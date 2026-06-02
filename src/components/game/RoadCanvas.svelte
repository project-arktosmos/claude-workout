<script lang="ts">
	// Standalone /road field. This component owns nothing but the DOM container and
	// the PixiJS engine's lifecycle: it boots RoadGame, mirrors the relevant stores
	// onto the running field (pause, trainer charset, evolved sprite), and forwards
	// each wild encounter to the road-game service — which carries all the XP and
	// evolution logic. The resolved outcome is re-dispatched as an `encounter` event
	// so the parent can surface a feedback banner.
	import { onMount, createEventDispatcher } from 'svelte';
	import { get } from 'svelte/store';
	import { RoadGame, type EncounterAward } from '$utils/game/road-game';
	import { followerSheetUrl } from '$utils/pokemon/sprite';
	import { roadProgress } from '$services/road-progress.service';
	import { trainerCharacter } from '$services/trainer-character.service';
	import { eventsService } from '$services/events.service';
	import {
		roadProgression,
		roadSecondaryProgression,
		loadProgression,
		recordEncounter,
		recordSecondaryEncounter
	} from '$services/road-game.service';
	import { capturePokemon } from '$services/caught-pokemon.service';
	import { roadStats, recordSeen, recordCaught } from '$services/road-stats.service';
	import type { EncounterOutcome } from '$adapters/classes/road-encounter.adapter';

	const dispatch = createEventDispatcher<{
		encounter: EncounterOutcome;
		capture: { name: string; level: number };
	}>();

	/** Engine's built-in default follower; restored evolutions push over it. */
	const DEFAULT_FOLLOWER = 'Bulbasaur';

	let container: HTMLDivElement;
	let game: RoadGame | undefined;
	let disposed = false;
	let initPromise: Promise<void> = Promise.resolve();
	/** True once the engine is running, so sprite swaps are safe to push. */
	let ready = false;
	/** Sprite name last pushed to the field, so we only re-slice on a real change. */
	let appliedSpriteName = DEFAULT_FOLLOWER;

	// The walk runs while a Claude Code prompt is in flight (same criteria as the
	// /events page) and pauses once every prompt completes — the default.
	const anyRunning = eventsService.anyRunning;
	$: game?.setPaused(!$anyRunning);

	// Mirror the persisted trainer charset onto the running field.
	$: game?.setTrainerCharacter($trainerCharacter);

	// Reflect the live species (a restored or freshly-earned evolution) on the
	// field sprite, but only once running and only when it actually changes.
	$: if (ready && $roadProgression.species && $roadProgression.species.name !== appliedSpriteName) {
		appliedSpriteName = $roadProgression.species.name;
		game?.setPlayerSprite(followerSheetUrl(appliedSpriteName));
	}

	/**
	 * A wild mon reached the follower: resolve via the service, surface feedback,
	 * and return the XP gained so the engine can float "+N EXP" above the follower.
	 */
	function handleEncounter(foeName: string): EncounterAward | void {
		const outcome = recordEncounter(foeName);
		if (!outcome) return;
		dispatch('encounter', outcome);
		return { amount: outcome.amount, multiplier: outcome.multiplier };
	}

	/**
	 * A wild mon reached the secondary follower (D2): resolve via the service and
	 * return the XP gained so the engine can float "+N EXP" above it. Surfaces the
	 * same `encounter` feedback banner as the primary.
	 */
	function handleSecondaryEncounter(foeName: string): EncounterAward | void {
		const outcome = recordSecondaryEncounter(foeName);
		if (!outcome) return;
		dispatch('encounter', outcome);
		return { amount: outcome.amount, multiplier: outcome.multiplier };
	}

	/** A wild mon reached the trainer: catch it (no XP) at the follower's level. */
	function handleCapture(foeName: string): void {
		const level = get(roadProgression).level;
		const mon = capturePokemon(foeName, level);
		if (mon) {
			recordCaught(foeName);
			dispatch('capture', { name: foeName, level });
		}
	}

	/** A wild mon stepped onto the canvas: bump the distinct-species "seen" tally. */
	function handleSeen(foeName: string): void {
		recordSeen(foeName);
	}

	/**
	 * Boot the field from the persisted (or freshly chosen) progression. start() is
	 * async — it inits Pixi and loads tiles — so teardown is guarded with `disposed`
	 * to never touch a game destroyed mid-init during a fast navigation.
	 */
	async function boot(): Promise<void> {
		await roadProgress.ready;
		await trainerCharacter.ready;
		await roadStats.ready;
		if (disposed) return;

		// Hydrate the live progression the field should start from.
		loadProgression();

		game = new RoadGame({
			container,
			getPlayerLevel: () => get(roadProgression).level,
			getPlayerName: () => get(roadProgression).species?.name ?? DEFAULT_FOLLOWER,
			onEncounter: handleEncounter,
			onCapture: handleCapture,
			onSeen: handleSeen,
			getSecondaryName: () => get(roadSecondaryProgression)?.species?.name ?? null,
			getSecondaryLevel: () =>
				get(roadSecondaryProgression)?.level ?? get(roadProgression).level,
			onSecondaryEncounter: handleSecondaryEncounter,
			getSeenCount: () => get(roadStats).seen.length,
			getCaughtCount: () => get(roadStats).caught.length
		});
		// Apply the trainer charset before the player is built so the chosen
		// character shows immediately rather than flashing the boy default first.
		game.setTrainerCharacter(get(trainerCharacter));

		await game.start();
		if (disposed) return;
		// Marking ready re-runs the sprite reactive, reflecting a non-default
		// starter / restored evolution on the field.
		ready = true;
	}

	onMount(() => {
		initPromise = boot();
		return () => {
			disposed = true;
			// Tear down once whichever init is in flight settles, so we never destroy
			// a half-initialised game. destroy() is idempotent and start-safe.
			initPromise.then(() => game?.destroy());
		};
	});
</script>

<!-- Square, centred canvas: the engine sizes a square from the smaller of this
     container's width/height. -->
<div
	bind:this={container}
	class="flex h-full w-full items-center justify-center overflow-hidden"
	role="application"
	aria-label="Scrolling grass field"
></div>
