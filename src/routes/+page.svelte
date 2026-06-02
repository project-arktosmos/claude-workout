<script lang="ts">
	import { onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';
	import classNames from 'classnames';
	import { browser } from '$app/environment';
	import { eventsService } from '$services/events.service';
	import { exercisesCatalog } from '$services/exercises.service';
	import { exerciseFlagsService } from '$services/exercise-flags.service';
	import { settingsService } from '$services/settings.service';
	import {
		exerciseWindowSeconds,
		WINDOW_OPTIONS,
		type WindowSeconds
	} from '$services/exercise-window.service';
	import { sfxFlags } from '$services/sfx-flags.service';
	import { soundEnabled } from '$services/sound-enabled.service';
	import sfxManifest from '$data/sfx.json';
	import PromptActivityList from '$components/core/PromptActivityList.svelte';
	import { PromptStatus } from '$types/event.type';
	import { ExerciseFlag } from '$types/exercise-flag.type';
	import { ExerciseMode } from '$types/exercise.type';
	import type { ID } from '$types/core.type';

	// The page is a thin shell around the session UI: it surfaces the in-flight
	// round's timer and drawn exercise, mirroring the /events page.

	// The walk runs while a Claude Code prompt is in flight (same criteria as the
	// /events page) and pauses once every prompt completes.
	const anyRunning = eventsService.anyRunning;

	// Every Claude Code prompt currently in flight, across all sessions/directories
	// — surfaced above the history so you can see exactly what's driving the walk.
	// The raw feed is newest-first, so this stays newest-first too.
	const allPrompts = eventsService.store;
	$: runningPrompts = $allPrompts.filter((prompt) => prompt.status === PromptStatus.Running);

	// Surface the in-flight round's timer and drawn exercises, exactly as the
	// /events page does. `byDirectory` is newest-activity first, so the first
	// running directory is the most recent one.
	const directories = eventsService.byDirectory;
	$: activeDir = $directories.find((d) => d.status === PromptStatus.Running) ?? null;
	$: activeRound = activeDir
		? (activeDir.rounds.find((r) => r.status === PromptStatus.Running) ?? activeDir.rounds[0] ?? null)
		: null;

	// History of executed exercise sets: the finished rounds of the running
	// directory, or — once everything is paused — the most recently active one,
	// so the log of past exercises and their times stays on screen between runs.
	$: sessionDir = activeDir ?? $directories[0] ?? null;

	// The round whose exercise the panel shows. While walking it's the running
	// round; once every prompt finishes we keep the most recent round on screen
	// (rounds are newest-first) instead of clearing it, so the last drawn
	// exercise stays put between prompts rather than vanishing.
	$: displayRound = activeRound ?? sessionDir?.rounds[0] ?? null;

	// The exercise the round is on right now — the latest draw, and the target of
	// the favorite/ban/next actions. Earlier entries are the session's completed
	// exercises, kept for the history below; the current one is the last.
	$: currentExerciseId = displayRound?.exercises.at(-1)?.id ?? null;

	// Which pool new exercises (and re-rolls) are drawn from; the 3-way toggle
	// writes this preference, which events.service reads on every draw.
	const mode = settingsService.store;

	/** Switch the pool new exercises are drawn from and persist the choice. */
	function selectMode(next: ExerciseMode): void {
		settingsService.set({ ...settingsService.get(), mode: next });
	}

	/** Ban the displayed round's exercise, log the time it ran, then draw a fresh one. */
	function banCurrent(): void {
		if (!currentExerciseId || !displayRound) return;
		exerciseFlagsService.setFlag(currentExerciseId, ExerciseFlag.Banned);
		rerollCurrent(displayRound);
	}

	/** Log the displayed exercise with the time it ran, then draw a fresh one. */
	function nextExercise(): void {
		if (displayRound) rerollCurrent(displayRound);
	}

	/**
	 * Manual reroll (ban / next): the displayed exercise *was* performed, so close
	 * it out at the round's elapsed-so-far — which logs it to the session with that
	 * duration — and append a freshly drawn one. Re-anchoring the window resets the
	 * countdown so the new exercise gets a full window rather than the leftover of
	 * the one it replaced.
	 */
	function rerollCurrent(round: NonNullable<typeof displayRound>): void {
		const elapsed = roundElapsed(round, now);
		windowRoundId = round.id;
		windowPeriodMs = windowMs;
		windowAnchorMs = elapsed;
		eventsService.advance(round.id, elapsed);
	}

	// Live clock so the running timer counts up each second (mirrors /events).
	let now = browser ? Date.now() : 0;
	const clock = browser ? setInterval(() => (now = Date.now()), 1000) : undefined;
	onDestroy(() => clearInterval(clock));

	// A round's elapsed time = summed completed durations + live time of its
	// still-running prompts. `now` is passed in (not closed over) so every caller
	// — including the reactive `activeElapsed` below — re-runs on each clock tick.
	function roundElapsed(round: typeof activeRound, atNow: number): number {
		if (!round) return 0;
		return (
			round.completedDurationMs +
			round.runningSince.reduce((sum, since) => sum + Math.max(0, atNow - since), 0)
		);
	}
	$: activeElapsed = roundElapsed(activeRound, now);

	function formatElapsed(ms: number): string {
		const total = Math.max(0, Math.floor(ms / 1000));
		const hours = Math.floor(total / 3600);
		const minutes = Math.floor((total % 3600) / 60);
		const seconds = total % 60;
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
	}

	/** Compact per-exercise duration: `45s`, `1m 23s`, or `1h 02m`. */
	function formatDuration(ms: number): string {
		const total = Math.max(0, Math.round(ms / 1000));
		if (total < 60) return `${total}s`;
		const minutes = Math.floor(total / 60);
		const seconds = total % 60;
		if (minutes < 60) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
		const hours = Math.floor(minutes / 60);
		return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
	}

	// History of executed exercises across the whole session, with the time each
	// ran (resolved from each round's segments by the events adapter). Every prompt
	// opens its own round, so we flatten ALL of the directory's rounds rather than
	// just the current one — otherwise the list would reset on every new prompt.
	// Rounds are newest-first and each round's log is oldest-first, so we reverse
	// within each round to get an overall newest-first list. The exercise currently
	// up (the last entry of the displayed round) is shown in the left card, so it's
	// dropped from the history.
	$: exerciseHistory = (sessionDir?.rounds ?? [])
		.flatMap((round) => {
			const log = round.id === displayRound?.id ? round.exerciseLog.slice(0, -1) : round.exerciseLog;
			return [...log].reverse();
		})
		.map((entry, index) => ({
			key: index,
			id: entry.id,
			name: exercisesCatalog.resolve([entry.id])[0]?.name ?? String(entry.id),
			durationMs: entry.durationMs
		}));

	// Per-exercise countdown window (10/20/30s), persisted via the Tauri Store.
	$: windowMs = $exerciseWindowSeconds * 1000;

	/** Switch how long each exercise stays up before auto-rerolling. */
	function selectWindow(seconds: WindowSeconds): void {
		exerciseWindowSeconds.set(seconds);
	}

	// Auto-reroll: when the current window elapses, log the current exercise and
	// draw a fresh one. The window is anchored at the round-elapsed where the
	// current exercise began (`windowAnchorMs`), so switching rounds/lengths and a
	// manual ban/next all reset the countdown to a full window from that point
	// rather than snapping to a fixed grid or firing a burst of catch-up rerolls.
	let windowRoundId: ID | null = null;
	let windowPeriodMs = 0;
	let windowAnchorMs = 0;

	function advanceWindow(round: typeof activeRound, elapsed: number, periodMs: number): void {
		if (!round) {
			windowRoundId = null;
			return;
		}
		if (round.id !== windowRoundId || periodMs !== windowPeriodMs) {
			windowRoundId = round.id;
			windowPeriodMs = periodMs;
			windowAnchorMs = elapsed;
			return;
		}
		if (elapsed - windowAnchorMs >= periodMs) {
			windowAnchorMs += periodMs;
			// Stamp the new exercise at the boundary just crossed, so the one it
			// replaces is logged as having run exactly that window.
			eventsService.advance(round.id, windowAnchorMs);
		}
	}

	// Reading `activeElapsed` (which tracks `now`) makes this fire on each tick.
	$: if (browser) advanceWindow(activeRound, activeElapsed, windowMs);

	// Time left in the current window, and how much of it has run — measured from
	// the window's anchor so it counts down only while walking and resets on a
	// manual ban/next. Reads the anchor so it re-renders when a reroll moves it.
	$: windowRemainingMs = Math.max(0, windowPeriodMs - (activeElapsed - windowAnchorMs));
	$: windowRemainingSeconds = Math.ceil(windowRemainingMs / 1000);

	// --- Sound cues -----------------------------------------------------------
	// Two cues, resolved from the /sfx page's flags: the sound the player flagged
	// "new prompt" fires when the exercise runner kickstarts (walking begins), and
	// the one flagged "exercise complete" fires when the last prompt finishes and
	// the timer stops. Both are matched by their custom label (not a fixed id), so
	// re-flagging a different clip on /sfx swaps the cue here too.
	interface SoundEffect {
		id: string;
		name: string;
		file: string;
	}
	const sfxList = sfxManifest as SoundEffect[];

	/** The file of the clip flagged under `label` (case-insensitive), or null. */
	function soundFileForLabel(flags: Record<string, string>, label: string): string | null {
		const target = label.toLowerCase();
		const id = Object.keys(flags).find((key) => flags[key].trim().toLowerCase() === target);
		return id ? (sfxList.find((sound) => sound.id === id)?.file ?? null) : null;
	}

	$: newPromptFile = browser ? soundFileForLabel($sfxFlags, 'new prompt') : null;
	$: exerciseCompleteFile = browser ? soundFileForLabel($sfxFlags, 'exercise complete') : null;

	// Preloaded <audio> elements, rebuilt only when the resolved file changes.
	// `preload='auto'` + load() fetches the clip up front so the cue is instant.
	let newPromptSrc: string | null = null;
	let exerciseCompleteSrc: string | null = null;
	let newPromptAudio: HTMLAudioElement | undefined;
	let exerciseCompleteAudio: HTMLAudioElement | undefined;

	function preload(file: string): HTMLAudioElement {
		const audio = new Audio(file);
		audio.preload = 'auto';
		audio.load();
		return audio;
	}

	$: if (browser && newPromptFile !== newPromptSrc) {
		newPromptSrc = newPromptFile;
		newPromptAudio = newPromptFile ? preload(newPromptFile) : undefined;
	}
	$: if (browser && exerciseCompleteFile !== exerciseCompleteSrc) {
		exerciseCompleteSrc = exerciseCompleteFile;
		exerciseCompleteAudio = exerciseCompleteFile ? preload(exerciseCompleteFile) : undefined;
	}

	/** Play a preloaded cue from the start, ignoring autoplay rejections. */
	function playCue(audio: HTMLAudioElement | undefined): void {
		if (!audio || !get(soundEnabled)) return;
		audio.currentTime = 0;
		void audio.play().catch(() => {});
	}

	// Cue rules, edge-triggered off the running state:
	//   • run begins (idle → running) → play "new prompt" once
	//   • run ends  (running → idle)  → play "exercise complete" once
	// The start cue only fires when the timer wasn't already running, so a request
	// to play while a runner is active is ignored (no mid-run re-trigger). Seed
	// `wasRunning` from the live running state so opening this page mid-run doesn't
	// fire the start cue for a timer that was already going before we arrived.
	let wasRunning = browser ? get(anyRunning) : false;

	function onRunningChange(running: boolean): void {
		if (running && !wasRunning) {
			playCue(newPromptAudio);
		} else if (!running && wasRunning) {
			playCue(exerciseCompleteAudio);
		}
		wasRunning = running;
	}
	$: if (browser) onRunningChange($anyRunning);

	onDestroy(() => {
		newPromptAudio?.pause();
		exerciseCompleteAudio?.pause();
	});
</script>

<svelte:head>
	<title>Road — Endless Grass</title>
</svelte:head>

<!-- Fill the viewport: 100vh minus the layout's `p-4` top+bottom padding (2rem). -->
<section class="flex h-[calc(100vh-2rem)] flex-col items-center justify-center gap-4">
	<!-- Two columns: the live session controls on the left, the executed-exercise
	     history (and how long each ran) on the right. -->
	<div class="grid w-full grid-cols-1 items-start gap-4 md:grid-cols-2">
		<!-- Session controls: run/pause state, the in-flight round's live timer, and
		     its drawn exercise — the same one the /events page shows for the round. -->
		<div class="card bg-base-100 gap-4 p-6 shadow-xl">
			<div class="flex items-center justify-between gap-2">
				<span
					class={classNames('badge badge-sm gap-2', {
						'badge-success': $anyRunning,
						'badge-ghost': !$anyRunning
					})}
				>
					<span
						class={classNames('inline-block h-2 w-2 rounded-full', {
							'animate-pulse bg-current': $anyRunning,
							'bg-base-content/40': !$anyRunning
						})}
					></span>
					{$anyRunning ? 'Walking' : 'Paused'}
				</span>
				{#if $anyRunning && activeRound}
					<span class="text-info font-mono text-xs tabular-nums">
						{formatElapsed(activeElapsed)}
					</span>
				{/if}
			</div>

			<!-- Pool toggle: which collection new draws and re-rolls pull from. -->
			<div role="group" aria-label="Exercise pool" class="join w-full">
				<button
					class={classNames('btn btn-xs join-item flex-1', {
						'btn-primary': $mode.mode === ExerciseMode.Mix,
						'btn-ghost': $mode.mode !== ExerciseMode.Mix
					})}
					aria-pressed={$mode.mode === ExerciseMode.Mix}
					on:click={() => selectMode(ExerciseMode.Mix)}
				>
					All
				</button>
				<button
					class={classNames('btn btn-xs join-item flex-1', {
						'btn-primary': $mode.mode === ExerciseMode.Workout,
						'btn-ghost': $mode.mode !== ExerciseMode.Workout
					})}
					aria-pressed={$mode.mode === ExerciseMode.Workout}
					on:click={() => selectMode(ExerciseMode.Workout)}
				>
					Exercise
				</button>
				<button
					class={classNames('btn btn-xs join-item flex-1', {
						'btn-primary': $mode.mode === ExerciseMode.Yoga,
						'btn-ghost': $mode.mode !== ExerciseMode.Yoga
					})}
					aria-pressed={$mode.mode === ExerciseMode.Yoga}
					on:click={() => selectMode(ExerciseMode.Yoga)}
				>
					Ioga
				</button>
			</div>

			<!-- Window toggle: how long each exercise stays up before auto-rerolling. -->
			<div role="group" aria-label="Exercise window" class="join w-full">
				{#each WINDOW_OPTIONS as seconds (seconds)}
					<button
						class={classNames('btn btn-xs join-item flex-1', {
							'btn-primary': $exerciseWindowSeconds === seconds,
							'btn-ghost': $exerciseWindowSeconds !== seconds
						})}
						aria-pressed={$exerciseWindowSeconds === seconds}
						on:click={() => selectWindow(seconds)}
					>
						{seconds}s
					</button>
				{/each}
			</div>

			{#if displayRound && displayRound.exercises.length}
				<!-- Countdown to the next auto-roll, driven by the running clock. Always
				     visible so the window stays on screen even while paused. -->
				<div class="flex flex-col gap-1">
					<div class="flex items-center justify-end px-1">
						<span class="text-primary font-mono text-xs tabular-nums">
							{windowRemainingSeconds}s
						</span>
					</div>
					<progress
						class="progress progress-primary h-1 w-full"
						value={windowMs - windowRemainingMs}
						max={windowMs}
					></progress>
				</div>
				<!-- The drawn exercise. Keyed by id and positioned absolutely inside a
				     fixed-aspect box so the outgoing and incoming images cross-fade in
				     place when the exercise changes, with no layout jump. -->
				<div class="relative aspect-square w-full">
					{#each exercisesCatalog.resolve(currentExerciseId ? [currentExerciseId] : []) as image (image.id)}
						<span
							aria-label={image.name}
							in:fade={{ duration: 250 }}
							out:fade={{ duration: 250 }}
							class={classNames(
								'tooltip absolute inset-0 flex items-center justify-center overflow-hidden rounded p-4 [&_svg]:h-full [&_svg]:w-full [&_svg]:fill-current',
								{ 'opacity-50': !$anyRunning }
							)}
							data-tip={image.name}
						>
							{@html exercisesCatalog.inlineSvg(image.id)}
						</span>
					{/each}
				</div>

				<!-- Actions on the current exercise: favorite, ban (+re-roll), next. -->
				{#if currentExerciseId}
					<div role="group" aria-label="Exercise actions" class="join w-full">
						<button
							type="button"
							title="Ban this exercise and draw another"
							aria-label="Ban this exercise and draw another"
							class="btn btn-ghost join-item h-auto flex-1 py-2 text-2xl leading-none"
							on:click={banCurrent}
						>
							⊘
						</button>
						<button
							type="button"
							title="Draw a different exercise"
							aria-label="Draw a different exercise"
							class="btn btn-ghost join-item h-auto flex-1 py-2 text-2xl leading-none"
							on:click={nextExercise}
						>
							↻
						</button>
					</div>
				{/if}
			{:else}
				<p class="text-base-content/50 px-1 text-xs">
					The game starts as soon as a Claude Code prompt is detected.
				</p>
			{/if}
		</div>

		<!-- Right column: the live prompts driving the walk, then the executed-exercise
		     history below them. -->
		<div class="flex flex-col gap-4">
		<!-- Running prompts: every Claude Code prompt in flight right now and its
		     status — what's keeping the walk going. -->
		<div class="card bg-base-100 gap-3 p-6 shadow-xl">
			<span class="text-base-content/60 text-[0.65rem] font-semibold tracking-wide uppercase">
				Running prompts
			</span>
			{#if runningPrompts.length}
				<PromptActivityList prompts={runningPrompts} />
			{:else}
				<p class="text-base-content/50 text-xs">No prompts running.</p>
			{/if}
		</div>

		<!-- History: every exercise executed this round and how long each was held
		     up, newest first. Durations come from the round's resolved segments. -->
		<div class="card bg-base-100 gap-3 p-6 shadow-xl">
			<span class="text-base-content/60 text-[0.65rem] font-semibold tracking-wide uppercase">
				History
			</span>
			{#if exerciseHistory.length}
				<ul class="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto">
					{#each exerciseHistory as item (item.key)}
						<li class="flex flex-col items-center gap-1">
							<span
								aria-label={item.name}
								class="bg-base-200 flex aspect-square w-full items-center justify-center rounded p-2 [&_svg]:h-full [&_svg]:w-full [&_svg]:fill-current"
							>
								{@html exercisesCatalog.inlineSvg(item.id)}
							</span>
							<span class="text-base-content/70 font-mono text-xs tabular-nums">
								{formatDuration(item.durationMs)}
							</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-base-content/50 text-xs">No exercises completed yet.</p>
			{/if}
		</div>
		</div>
	</div>
</section>
