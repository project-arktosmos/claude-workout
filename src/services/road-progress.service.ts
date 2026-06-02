// Persisted progression for the follower on the /road page. Every encounter
// awards EXP, which can raise the level and evolve the species — and each gain
// is written through the Tauri Store plugin (see `$utils/tauriStore`) so the
// next session resumes exactly where it left off. This is the persistence layer
// for the road game; the page reads/writes only this store.

import { persistentStore } from '$utils/tauriStore';
import { pokemonByName } from '$data/pokemon-compendium.data';
import { expForLevel } from '$utils/pokemon/exp-system';

/** The follower's saved state. `speciesId` is a master-dataset id (e.g. "bulbasaur"). */
export interface RoadProgress {
	speciesId: string;
	level: number;
	totalExp: number;
}

/** The journey begins with a level-5 Bulbasaur. */
export const ROAD_START_LEVEL = 5;

const bulbasaur = pokemonByName('Bulbasaur');

export const ROAD_START: RoadProgress = {
	speciesId: String(bulbasaur?.id ?? 'bulbasaur'),
	level: ROAD_START_LEVEL,
	totalExp: expForLevel(bulbasaur?.growthRate ?? 'medium', ROAD_START_LEVEL)
};

/**
 * The live, persisted road progress. Calling `.set(...)` updates the UI and
 * writes to disk via the Tauri Store plugin; `await roadProgress.ready` before
 * reading the restored value on mount.
 */
export const roadProgress = persistentStore<RoadProgress>('road-progress', ROAD_START);

/**
 * The optional *secondary* follower's saved state. The road field has a second
 * slot at cell D2 that battles wild mon for its own XP, exactly like the primary
 * follower at B2 — but it starts empty (`null`) and is filled by the first wild
 * mon caught at the trainer (or any roster mon the player assigns to it).
 */
export const roadSecondary = persistentStore<RoadProgress | null>('road-secondary', null);

/**
 * Wipe all saved road progression back to the journey's starting state and
 * persist it. Use this to let the player begin the game over from scratch; the
 * /road page rehydrates from this store on mount, so the reset takes effect the
 * next time the page is opened.
 */
export function resetRoadProgress(): void {
	roadProgress.set(ROAD_START);
	roadSecondary.set(null);
}
