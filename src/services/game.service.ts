// Top-level game lifecycle that ties the road game's two persisted stores
// together: whether a game exists at all, starting a fresh one from the player's
// starter + trainer choice, and clearing everything back to "no game". The /road
// page shows the new-game modal whenever `gameStarted` is false, and the settings
// page wipes back to that state. All writes persist via the Tauri Store plugin.

import { persistentStore } from '$utils/tauriStore';
import { pokemonByName, pokemonCompendium } from '$data/pokemon-compendium.data';
import { expForLevel } from '$utils/pokemon/exp-system';
import { roadProgress, resetRoadProgress, ROAD_START_LEVEL } from '$services/road-progress.service';
import { trainerCharacter, resetTrainerCharacter } from '$services/trainer-character.service';
import { seedStarterCaught, resetCaught } from '$services/caught-pokemon.service';
import { resetRoadStats } from '$services/road-stats.service';
import type { TrainerCharacter } from '$utils/game/road-game';

/**
 * The species a new game can begin with, each at level 5: every first-generation
 * Pokémon whose base SR (Stat Rank) is 1 or lower — the weakest, most
 * beginner-friendly mons. Deduped to one entry per national-dex number (the base
 * forme, since alternate formes share a dex number and lack their own starter
 * artwork). Derived from the compendium so the roster tracks the dataset rather
 * than a hardcoded list.
 */
export const STARTER_SPECIES = (() => {
	const seenDex = new Set<number>();
	return pokemonCompendium.filter((species) => {
		if (species.generation !== 1) return false;
		if (species.sr === null || species.sr > 1) return false;
		if (seenDex.has(species.dexNumber)) return false;
		seenDex.add(species.dexNumber);
		return true;
	});
})();

/** Display names of the SR ≤ 1 starter roster, in national-dex order. */
export const STARTER_NAMES = STARTER_SPECIES.map((species) => species.name);
export type StarterName = string;

/**
 * Whether a game is currently in progress. `false` means "no save data" — the
 * /road page presents the new-game modal until the player picks a starter and
 * trainer. Persisted so a reopened session drops straight back into the run.
 */
export const gameStarted = persistentStore<boolean>('game-started', false);

export interface NewGameChoice {
	starter: StarterName;
	trainer: TrainerCharacter;
}

/**
 * Begin a fresh journey: seed the road progress with the chosen starter at the
 * starting level, set the trainer charset, and mark the game started. The road
 * page reads these stores when it boots the game right after this call.
 */
export function startNewGame({ starter, trainer }: NewGameChoice): void {
	const species = pokemonByName(starter);
	const speciesId = String(species?.id ?? starter.toLowerCase());
	const totalExp = expForLevel(species?.growthRate ?? 'medium', ROAD_START_LEVEL);

	roadProgress.set({ speciesId, level: ROAD_START_LEVEL, totalExp });
	// The starter is also the player's first caught Pokémon, and the primary.
	seedStarterCaught(starter, ROAD_START_LEVEL);
	// A fresh journey starts with empty seen/caught tallies.
	resetRoadStats();
	trainerCharacter.set(trainer);
	gameStarted.set(true);
}

/**
 * Clear all saved progress back to "no game" so the next /road visit shows the
 * new-game modal. Also resets the follower progression and trainer choice so no
 * stale state leaks into the next journey.
 */
export function resetGame(): void {
	resetRoadProgress();
	resetCaught();
	resetRoadStats();
	resetTrainerCharacter();
	gameStarted.set(false);
}
