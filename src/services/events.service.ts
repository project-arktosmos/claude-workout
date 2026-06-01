import { writable, get, type Writable } from 'svelte/store';
import { browser } from '$app/environment';
import { claudeHookAdapter } from '$adapters/classes/claude-hook.adapter';
import { PromptStatus, type ClaudeHookPayload, type PromptEvent } from '$types/event.type';

/**
 * Live, in-memory feed of Claude Code prompt activity. Listens to the
 * `claude-hook` Tauri event (emitted by the Rust hook server) and correlates
 * each prompt launch with its matching end by `sessionId`. Not persisted —
 * the list is cleared when the app closes.
 */
class EventsService {
	/** Newest events first. */
	store: Writable<PromptEvent[]> = writable<PromptEvent[]>([]);
	private initialized = false;
	private unlisten: (() => void) | null = null;

	/**
	 * Subscribe to backend hook events. Safe to call repeatedly and during
	 * prerender (no-op unless running in the browser/Tauri webview).
	 */
	async init(): Promise<void> {
		if (!browser || this.initialized) return;
		this.initialized = true;
		try {
			const { listen } = await import('@tauri-apps/api/event');
			this.unlisten = await listen<ClaudeHookPayload>('claude-hook', ({ payload }) => {
				this.handle(payload);
			});
		} catch (err) {
			console.error('events.service: could not subscribe to claude-hook', err);
			this.initialized = false;
		}
	}

	private handle(payload: ClaudeHookPayload): void {
		const now = Date.now();
		if (payload.hook_event_name === 'UserPromptSubmit') {
			const event = claudeHookAdapter.toPromptEvent(payload, now);
			this.store.update((events) => [event, ...events]);
			return;
		}

		// Stop / StopFailure: close out the most recent running turn for this session.
		const running = get(this.store).find(
			(e) => e.sessionId === payload.session_id && e.status === PromptStatus.Running
		);
		if (!running) return;
		const ended = claudeHookAdapter.applyEnd(running, payload, now);
		this.store.update((events) => events.map((e) => (e.id === ended.id ? ended : e)));
	}

	clear(): void {
		this.store.set([]);
	}
}

export const eventsService = new EventsService();
