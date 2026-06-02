<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import classNames from 'classnames';
	import { browser } from '$app/environment';
	import RoadCanvas from '$components/game/RoadCanvas.svelte';
	import SpeciesInfoCard from '$components/pokemon/SpeciesInfoCard.svelte';
	import NewGameModal from '$components/game/NewGameModal.svelte';
	import CaughtPokemonPanel, {
		type CaughtEntry
	} from '$components/game/CaughtPokemonPanel.svelte';
	import { roadProgression } from '$services/road-game.service';
	import {
		caughtPokemon,
		setPrimaryCaught,
		setSecondaryCaught
	} from '$services/caught-pokemon.service';
	import { pokemonById } from '$data/pokemon-compendium.data';
	import { frontSpriteUrl } from '$utils/pokemon/sprite';
	import capitalize from '$utils/string/capitalize';
	import { trainerCharacter } from '$services/trainer-character.service';
	import { gameStarted, startNewGame, type StarterName } from '$services/game.service';
	import type { TrainerCharacter } from '$utils/game/road-game';
	import type { EncounterOutcome } from '$adapters/classes/road-encounter.adapter';
	import { formatMultiplier, effectivenessLabel } from '$utils/pokemon/type-chart';
	import { eventsService } from '$services/events.service';
	import { exercisesCatalog } from '$services/exercises.service';
	import { exerciseFlagsService } from '$services/exercise-flags.service';
	import { settingsService } from '$services/settings.service';
	import {
		exerciseWindowSeconds,
		WINDOW_OPTIONS,
		type WindowSeconds
	} from '$services/exercise-window.service';
	import { PromptStatus } from '$types/event.type';
	import { ExerciseFlag } from '$types/exercise-flag.type';
	import { ExerciseMode } from '$types/exercise.type';
	import type { ID } from '$types/core.type';

	// The page is a thin shell: it decides between the new-game modal and the
	// standalone <RoadCanvas>, renders the compendium/feedback/trainer/session
	// overlays around it, and forwards the player's new-game picks. All the field
	// and progression logic lives in the canvas component, the road-game service
	// and the encounter adapter.
	let showSetup = false;
	let gameActive = false;

	// The follower's live, resolved progression (species/level/EXP), owned by the
	// road-game service and advanced by the canvas on every encounter.
	$: progression = $roadProgression;

	// The walk runs while a Claude Code prompt is in flight (same criteria as the
	// /events page) and pauses once every prompt completes.
	const anyRunning = eventsService.anyRunning;

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

	// Personal Favorite/Banned marks, reactive so the favorite button reflects state.
	const flags = exerciseFlagsService.store;
	$: currentFlag = currentExerciseId
		? ($flags.find((entry) => entry.id === currentExerciseId)?.flag ?? null)
		: null;

	// Which pool new exercises (and re-rolls) are drawn from; the 3-way toggle
	// writes this preference, which events.service reads on every draw.
	const mode = settingsService.store;

	/** Switch the pool new exercises are drawn from and persist the choice. */
	function selectMode(next: ExerciseMode): void {
		settingsService.set({ ...settingsService.get(), mode: next });
	}

	/** Mark the running round's exercise favorite (re-applying clears it). */
	function favoriteCurrent(): void {
		if (currentExerciseId) exerciseFlagsService.toggle(currentExerciseId, ExerciseFlag.Favorite);
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

	/** Switch the trainer walking beside the follower and persist the choice. */
	function selectTrainer(character: TrainerCharacter): void {
		trainerCharacter.set(character);
	}

	// Transient banner shown after each encounter (type matchup, XP gained, level-ups,
	// evolution).
	let feedback: {
		amount: number;
		multiplier: number;
		attackerType?: string;
		levelsGained: number;
		evolvedInto?: string;
	} | null = null;
	let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
	onDestroy(() => clearTimeout(feedbackTimer));

	/** The canvas resolved an encounter through the service; flash the outcome. */
	function handleEncounter(event: CustomEvent<EncounterOutcome>): void {
		const outcome = event.detail;
		feedback = {
			amount: outcome.amount,
			multiplier: outcome.multiplier,
			attackerType: outcome.attackerType,
			levelsGained: outcome.levelsGained,
			evolvedInto: outcome.evolvedInto
		};
		clearTimeout(feedbackTimer);
		feedbackTimer = setTimeout(() => (feedback = null), outcome.evolvedInto ? 3200 : 2200);
	}

	// The player's caught roster (bottom-left panel), resolved to display rows from
	// the persisted store: species name/sprite plus which entry is the primary
	// (active map) follower. The canvas appends to the store on each trainer catch.
	$: caughtRoster = $caughtPokemon.mons.map((mon): CaughtEntry => {
		const species = pokemonById(mon.speciesId);
		const name = species?.name ?? mon.speciesId;
		return {
			id: mon.id,
			name,
			dexNumber: species?.dexNumber ?? 0,
			level: mon.level,
			spriteUrl: frontSpriteUrl(name),
			primary: $caughtPokemon.primaryId === mon.id,
			secondary: $caughtPokemon.secondaryId === mon.id
		};
	});

	// Transient banner shown when a wild mon is caught at the trainer.
	let captureFeedback: { name: string; level: number } | null = null;
	let captureTimer: ReturnType<typeof setTimeout> | undefined;
	onDestroy(() => clearTimeout(captureTimer));

	/** The canvas caught a wild mon at the trainer; flash it and let the panel update. */
	function handleCapture(event: CustomEvent<{ name: string; level: number }>): void {
		captureFeedback = { name: capitalize(event.detail.name), level: event.detail.level };
		clearTimeout(captureTimer);
		captureTimer = setTimeout(() => (captureFeedback = null), 2200);
	}

	/** Promote a caught mon to the primary map follower (B2). */
	function handleSetPrimary(event: CustomEvent<{ id: string }>): void {
		setPrimaryCaught(event.detail.id);
	}

	/** Assign a caught mon to the secondary map follower (D2). */
	function handleSetSecondary(event: CustomEvent<{ id: string }>): void {
		setSecondaryCaught(event.detail.id);
	}

	/** Seed a fresh game from the modal's picks, then let the canvas boot itself. */
	function startGame(event: CustomEvent<{ starter: StarterName; trainer: TrainerCharacter }>): void {
		startNewGame({ starter: event.detail.starter, trainer: event.detail.trainer });
		showSetup = false;
		gameActive = true;
	}

	onMount(async () => {
		// A saved game boots straight into the field; otherwise show the modal and
		// wait for the player to pick a trainer + starter (see startGame).
		await gameStarted.ready;
		if (get(gameStarted)) gameActive = true;
		else showSetup = true;
	});
</script>

<svelte:head>
	<title>Road — Endless Grass</title>
</svelte:head>

<!-- Fill the viewport: 100vh minus the layout's `p-4` top+bottom padding (2rem). -->
<section class="relative flex h-[calc(100vh-2rem)] flex-col">
	{#if gameActive}
		<RoadCanvas on:encounter={handleEncounter} on:capture={handleCapture} />
	{/if}

	<!-- Top-right controls: trainer toggle above the run/pause indicator. -->
	<div class="absolute top-4 right-4 flex flex-col items-end gap-2">
		<!-- Switch the trainer walking beside the follower between boy and girl. -->
		<div class="card bg-base-100/90 gap-2 p-2 shadow-lg backdrop-blur">
			<span class="text-base-content/70 px-1 text-xs font-semibold">Trainer</span>
			<div role="group" aria-label="Trainer character" class="join">
				<button
					class={classNames('btn btn-xs join-item', {
						'btn-primary': $trainerCharacter === 'boy',
						'btn-ghost': $trainerCharacter !== 'boy'
					})}
					aria-pressed={$trainerCharacter === 'boy'}
					on:click={() => selectTrainer('boy')}
				>
					Boy
				</button>
				<button
					class={classNames('btn btn-xs join-item', {
						'btn-primary': $trainerCharacter === 'girl',
						'btn-ghost': $trainerCharacter !== 'girl'
					})}
					aria-pressed={$trainerCharacter === 'girl'}
					on:click={() => selectTrainer('girl')}
				>
					Girl
				</button>
			</div>
		</div>

		<!-- Session card: run/pause state, the in-flight round's live timer, and its
		     drawn exercise — the same one the /events page shows for the round. -->
		<div class="card bg-base-100/90 w-56 gap-2 p-2 shadow-lg backdrop-blur">
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
				{#if $anyRunning && activeRound}
					<!-- Countdown to the next auto-roll, driven by the running clock. -->
					<div class="flex flex-col gap-1">
						<div class="flex items-center justify-between px-1">
							<span
								class="text-base-content/60 text-[0.65rem] font-semibold tracking-wide uppercase"
							>
								Next exercise
							</span>
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
				{/if}
				<div class="flex flex-col gap-1">
					{#each exercisesCatalog.resolve(currentExerciseId ? [currentExerciseId] : []) as image (image.id)}
						<span
							aria-label={image.name}
							class="bg-base-200 tooltip flex w-full items-center justify-center rounded p-1 [&_svg]:h-auto [&_svg]:w-full [&_svg]:fill-current"
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
							title="Favorite this exercise"
							aria-label="Favorite this exercise"
							aria-pressed={currentFlag === ExerciseFlag.Favorite}
							class={classNames('btn btn-xs join-item flex-1', {
								'btn-warning': currentFlag === ExerciseFlag.Favorite,
								'btn-ghost': currentFlag !== ExerciseFlag.Favorite
							})}
							on:click={favoriteCurrent}
						>
							★
						</button>
						<button
							type="button"
							title="Ban this exercise and draw another"
							aria-label="Ban this exercise and draw another"
							class="btn btn-ghost btn-xs join-item flex-1"
							on:click={banCurrent}
						>
							⊘
						</button>
						<button
							type="button"
							title="Draw a different exercise"
							aria-label="Draw a different exercise"
							class="btn btn-ghost btn-xs join-item flex-1"
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
	</div>

	<!-- Compendium overlay for the road's follower. It tracks the live species,
	     level and EXP as encounters award XP and trigger evolutions. Pointer-events
	     stay off the wrapper so it never blocks the canvas. -->
	{#if progression.species}
		<div class="pointer-events-none absolute top-4 left-4 flex flex-col gap-2">
			<SpeciesInfoCard
				species={progression.species}
				level={progression.level}
				currentExp={progression.totalExp}
			/>
			{#if feedback}
				<div
					class={classNames('alert w-72 py-2 shadow-lg', {
						'alert-success': feedback.multiplier > 1,
						'alert-warning': feedback.multiplier < 1,
						'alert-info': feedback.multiplier === 1
					})}
				>
					<span class="text-sm font-semibold">
						{#if feedback.multiplier !== 1}
							<span class="badge badge-sm badge-neutral mr-1">
								{formatMultiplier(feedback.multiplier)}
							</span>
							{effectivenessLabel(feedback.multiplier)}<br />
						{/if}
						{#if feedback.amount > 0}
							+{feedback.amount.toLocaleString()} EXP
						{:else}
							No EXP gained
						{/if}
						{#if feedback.levelsGained > 0}
							· Level up! → Lv {progression.level}
						{/if}
						{#if feedback.evolvedInto}
							<br />✨ Evolved into {feedback.evolvedInto}!
						{/if}
					</span>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Caught-Pokémon roster, bottom-left. Wild mon led to the trainer are caught
	     (no XP) and listed here; each can be promoted to the active map follower.
	     The panel itself takes pointer events so its buttons work. -->
	{#if gameActive}
		<div class="absolute bottom-4 left-4 flex flex-col gap-2">
			{#if captureFeedback}
				<div class="alert alert-info w-64 py-2 shadow-lg">
					<span class="text-sm font-semibold">
						Caught {captureFeedback.name} (Lv {captureFeedback.level})!
					</span>
				</div>
			{/if}
			<CaughtPokemonPanel
				mons={caughtRoster}
				on:primary={handleSetPrimary}
				on:secondary={handleSetSecondary}
			/>
		</div>
	{/if}

	<!-- No saved game yet: the player picks a trainer and a level-5 starter before
	     the field boots. startGame() seeds the run and renders the canvas. -->
	{#if showSetup}
		<NewGameModal on:start={startGame} />
	{/if}
</section>
