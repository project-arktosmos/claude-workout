// Distinct-species tallies for the /road field: how many unique Pokémon the
// player has *seen* (a wild mon stepping onto the canvas) and *caught* (a wild
// mon reaching the trainer). Both are stored as sets of compendium species ids so
// re-encounters never inflate the count; the displayed counters are simply their
// sizes. Persisted via the Tauri Store plugin so the tallies carry across sessions.

import { get } from 'svelte/store';
import { persistentStore } from '$utils/tauriStore';
import { pokemonByName } from '$data/pokemon-compendium.data';

/** The player's distinct seen/caught species, by compendium id. */
export interface RoadStats {
	/** Distinct compendium species ids that have entered the canvas. */
	seen: string[];
	/** Distinct compendium species ids the trainer has caught. */
	caught: string[];
}

/** The empty tallies a brand-new (or reset) game begins from. */
const EMPTY_STATS: RoadStats = { seen: [], caught: [] };

/**
 * The live, persisted seen/caught tallies. `.set(...)` updates the counters and
 * writes to disk via the Tauri Store plugin; `await roadStats.ready` before
 * reading the restored value on mount.
 */
export const roadStats = persistentStore<RoadStats>('road-stats', { ...EMPTY_STATS });

/** Resolve a species name to its compendium id, or null when unknown. */
function speciesId(name: string): string | null {
	const species = pokemonByName(name);
	return species ? String(species.id) : null;
}

/** Note a species stepping onto the canvas; the first sighting bumps the seen tally. */
export function recordSeen(name: string): void {
	const id = speciesId(name);
	if (!id) return;
	const state = get(roadStats);
	if (state.seen.includes(id)) return;
	roadStats.set({ ...state, seen: [...state.seen, id] });
}

/** Note a species being caught; the first catch of it bumps the caught tally. */
export function recordCaught(name: string): void {
	const id = speciesId(name);
	if (!id) return;
	const state = get(roadStats);
	if (state.caught.includes(id)) return;
	roadStats.set({ ...state, caught: [...state.caught, id] });
}

/** Wipe both tallies back to empty (used when a game is started fresh or reset). */
export function resetRoadStats(): void {
	roadStats.set({ ...EMPTY_STATS });
}
