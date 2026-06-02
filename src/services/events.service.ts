import { writable, derived, get, type Readable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';
import {
	PromptStatus,
	type DirectoryEvent,
	type ExerciseSegment,
	type PromptEvent
} from '$types/event.type';
import { eventsAdapter } from '$adapters/classes/events.adapter';
import { exercisesCatalog } from '$services/exercises.service';
import { settingsService } from '$services/settings.service';
import { exerciseFlagsService } from '$services/exercise-flags.service';
import { ExerciseFlag } from '$types/exercise-flag.type';

/**
 * Feed of Claude Code prompt activity, backed by the Tauri SQLite database.
 * History is loaded once via the `list_prompt_events` command; subsequent
 * launches/ends arrive as `prompt-event` events emitted by the Rust hook
 * server (which is the source of truth — it persists before it emits).
 */
class EventsService {
	/** Newest events first. Raw per-turn feed (one entry per prompt). */
	store: Writable<PromptEvent[]> = writable<PromptEvent[]>([]);
	/**
	 * The per-turn feed collapsed to one row per directory, newest activity
	 * first. This is what the events page renders.
	 */
	byDirectory: Readable<DirectoryEvent[]> = derived(this.store, (events) =>
		eventsAdapter.groupByDirectory(events)
	);
	/**
	 * True while at least one prompt turn is in flight — the same "running"
	 * criteria the events page shows. Drives the /road game: it walks while a
	 * prompt is running and pauses once every prompt has completed.
	 */
	anyRunning: Readable<boolean> = derived(this.store, (events) =>
		events.some((e) => e.status === PromptStatus.Running)
	);
	private initialized = false;
	private unlisten: (() => void) | null = null;

	/**
	 * Load persisted history and subscribe to live updates. Safe to call
	 * repeatedly and during prerender (no-op outside the Tauri webview).
	 */
	async init(): Promise<void> {
		if (!browser || this.initialized) return;
		this.initialized = true;
		try {
			const { invoke } = await import('@tauri-apps/api/core');
			const { listen } = await import('@tauri-apps/api/event');
			this.store.set(await invoke<PromptEvent[]>('list_prompt_events'));
			this.unlisten = await listen<PromptEvent>('prompt-event', ({ payload }) => {
				this.upsert(payload);
				// A starting turn draws exercises only when it opens a new round.
				if (payload.status === PromptStatus.Running) this.maybeDraw(payload);
			});
		} catch (err) {
			console.error('events.service: init failed', err);
			this.initialized = false;
		}
	}

	private upsert(event: PromptEvent): void {
		this.store.update((events) => {
			const index = events.findIndex((e) => e.id === event.id);
			if (index === -1) return [event, ...events];
			const next = [...events];
			// Preserve a locally-drawn set if the incoming payload (e.g. the
			// closing Stop event) raced ahead of our persist and has none yet.
			next[index] = {
				...event,
				exercises: event.exercises.length ? event.exercises : events[index].exercises
			};
			return next;
		});
	}

	/**
	 * Draw exercises for a freshly started turn — but only when it opens a new
	 * round. If another prompt in the same directory is already running, this
	 * prompt joins that round and shares its exercises, so no new set is drawn;
	 * its time accumulates against the round's existing set instead.
	 */
	private maybeDraw(payload: PromptEvent): void {
		if (payload.exercises.length > 0) return;
		const siblingRunning = get(this.store).some(
			(e) => e.id !== payload.id && e.cwd === payload.cwd && e.status === PromptStatus.Running
		);
		if (!siblingRunning) this.drawExercises(payload.id, 'replace');
	}

	/**
	 * Move the round on to its next exercise, keeping the one just completed in the
	 * session log. Drives both the road panel's per-exercise countdown and its
	 * manual ban/next actions: in every case the current exercise was performed, so
	 * a fresh one is *appended*, stamped with `atMs` (the round's running-elapsed at
	 * the moment it was replaced — a window boundary, or "now" for a manual reroll).
	 * That stamp closes out the just-finished exercise's run time and opens the
	 * new one's, so the round's `exercises` becomes the timed sequence done this
	 * session.
	 */
	async advance(id: PromptEvent['id'], atMs: number): Promise<void> {
		await this.drawExercises(id, 'append', atMs);
	}

	/**
	 * Draw one exercise for the given round using the current mode and persist the
	 * round's resulting set. Banned exercises and everything already drawn this
	 * session are skipped, so each draw lands on a different, allowed exercise.
	 * `mode` decides whether the draw `append`s a fresh segment to the session log
	 * (a completed window, stamped at `atMs`) or `replace`s the current exercise,
	 * inheriting its start stamp (a manual swap — the slot's time is unchanged).
	 */
	private async drawExercises(
		id: PromptEvent['id'],
		mode: 'replace' | 'append',
		atMs = 0
	): Promise<void> {
		const current = get(this.store).find((e) => e.id === id);
		const existing = current?.exercises ?? [];
		const banned = exerciseFlagsService
			.filter((entry) => entry.flag === ExerciseFlag.Banned)
			.map((entry) => entry.id);
		const exclude = [...banned, ...existing.map((segment) => segment.id)];
		const [drawn] = exercisesCatalog.draw(settingsService.get().mode, 1, exclude);
		if (!drawn) return;
		// append → open a new segment at `atMs`; replace → swap the current
		// exercise but keep its start stamp (an empty round opens at 0).
		const last = existing[existing.length - 1];
		const next: ExerciseSegment[] =
			mode === 'append'
				? [...existing, { id: drawn.id, atMs }]
				: [...existing.slice(0, -1), { id: drawn.id, atMs: last?.atMs ?? 0 }];
		this.store.update((events) =>
			events.map((e) => (e.id === id ? { ...e, exercises: next } : e))
		);
		try {
			const { invoke } = await import('@tauri-apps/api/core');
			await invoke('set_prompt_exercises', { id, exercises: next });
		} catch (err) {
			console.error('events.service: persist exercises failed', err);
		}
	}

	async clear(): Promise<void> {
		if (!browser) return;
		const { invoke } = await import('@tauri-apps/api/core');
		await invoke('clear_prompt_events');
		this.store.set([]);
	}
}

export const eventsService = new EventsService();
