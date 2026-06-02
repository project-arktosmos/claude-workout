// Live progression state for the /road field, sitting on top of the persisted
// `roadProgress` store. It exposes the *resolved* progression (the active species
// object, not just its id) for the canvas and its overlays, and the single
// `recordEncounter` action the field calls when a wild mon reaches the follower.
//
// All the XP/evolution maths is delegated to `roadEncounterAdapter`; this service
// only owns the store and the persistence wiring (writing each gain back through
// the Tauri Store plugin via `roadProgress`).

import { get, writable } from 'svelte/store';
import { roadProgress, roadSecondary, ROAD_START } from '$services/road-progress.service';
import { recordSeen, recordCaught } from '$services/road-stats.service';
import { pokemonById, pokemonByName } from '$data/pokemon-compendium.data';
import { expForLevel } from '$utils/pokemon/exp-system';
import {
	roadEncounterAdapter,
	type EncounterOutcome,
	type RoadProgressionState
} from '$adapters/classes/road-encounter.adapter';
import type { PokemonSpecies } from '$types/pokemon.type';

/** Bulbasaur backs every fallback — the journey's default starter. */
const FALLBACK_SPECIES = pokemonByName('Bulbasaur') as PokemonSpecies;

/** Resolve a persisted `RoadProgress` (species *id*) into a live view (species *object*). */
function resolve(speciesId: string, level: number, totalExp: number): RoadProgressionState {
	return { species: pokemonById(speciesId) ?? FALLBACK_SPECIES, level, totalExp };
}

/**
 * Live, resolved follower progression for the road field and its overlays
 * (SpeciesInfoCard, feedback banner). Seeded from the journey's starting state and
 * rehydrated from disk via `loadProgression` once the save has hydrated.
 */
export const roadProgression = writable<RoadProgressionState>(
	resolve(ROAD_START.speciesId, ROAD_START.level, ROAD_START.totalExp)
);

/**
 * Live, resolved progression for the *secondary* follower (cell D2), or null
 * while that slot is empty. Mirrors `roadProgression` for the second slot: the
 * canvas reads it to render the D2 sprite and advances it via
 * `recordSecondaryEncounter` whenever a wild mon reaches it.
 */
export const roadSecondaryProgression = writable<RoadProgressionState | null>(null);

/** Rehydrate both followers' live progression from the persisted save (await `.ready` first). */
export function loadProgression(): void {
	const saved = get(roadProgress);
	roadProgression.set(resolve(saved.speciesId, saved.level, saved.totalExp));
	const second = get(roadSecondary);
	roadSecondaryProgression.set(
		second ? resolve(second.speciesId, second.level, second.totalExp) : null
	);
}

/**
 * Tally any forms a follower evolved into during an encounter as both *seen* and
 * *caught*: an evolved Pokémon is, by definition, on the field and in the player's
 * party, so it belongs in both Pokédex counters. A no-op when nothing evolved.
 */
function countEvolutions(outcome: EncounterOutcome): void {
	for (const name of outcome.evolvedNames) {
		recordSeen(name);
		recordCaught(name);
	}
}

/**
 * Resolve a wild encounter with the named species through the adapter, commit the
 * new progression to the live store, and persist it via the Tauri Store plugin.
 * Returns the outcome (XP gained, level-ups, evolution) for the feedback banner,
 * or null when the foe yields no XP.
 */
export function recordEncounter(foeName: string): EncounterOutcome | null {
	const outcome = roadEncounterAdapter.resolve(get(roadProgression), foeName);
	if (!outcome) return null;

	roadProgression.set({
		species: outcome.species,
		level: outcome.level,
		totalExp: outcome.totalExp
	});
	roadProgress.set({
		speciesId: String(outcome.species.id),
		level: outcome.level,
		totalExp: outcome.totalExp
	});
	countEvolutions(outcome);
	return outcome;
}

/**
 * Make a given species (at a given level) the active map follower, swapping the
 * field sprite and the persisted progression. Used when the player promotes a
 * caught Pokémon to primary; EXP is set to that level's floor on the species'
 * growth curve, so the follower resumes from the start of its current level.
 */
export function setActiveFollower(speciesId: string, level: number): void {
	const species = pokemonById(speciesId) ?? FALLBACK_SPECIES;
	const totalExp = expForLevel(species.growthRate ?? 'medium', level);
	roadProgression.set({ species, level, totalExp });
	roadProgress.set({ speciesId: String(species.id), level, totalExp });
}

/**
 * Resolve a wild encounter against the *secondary* follower (cell D2), commit
 * the new progression to its live store, and persist it. The secondary slot
 * behaves exactly like the primary — gaining XP, levelling and evolving — but on
 * its own progression. A no-op (returns null) while the slot is empty.
 */
export function recordSecondaryEncounter(foeName: string): EncounterOutcome | null {
	const current = get(roadSecondaryProgression);
	if (!current) return null;

	const outcome = roadEncounterAdapter.resolve(current, foeName);
	if (!outcome) return null;

	roadSecondaryProgression.set({
		species: outcome.species,
		level: outcome.level,
		totalExp: outcome.totalExp
	});
	roadSecondary.set({
		speciesId: String(outcome.species.id),
		level: outcome.level,
		totalExp: outcome.totalExp
	});
	countEvolutions(outcome);
	return outcome;
}

/**
 * Fill (or replace) the secondary slot with a given species at a given level,
 * swapping its field sprite and persisted progression — the D2 counterpart of
 * `setActiveFollower`. EXP is set to that level's floor on the growth curve, so
 * the secondary resumes from the start of its current level.
 */
export function setSecondaryFollower(speciesId: string, level: number): void {
	const species = pokemonById(speciesId) ?? FALLBACK_SPECIES;
	const totalExp = expForLevel(species.growthRate ?? 'medium', level);
	roadSecondaryProgression.set({ species, level, totalExp });
	roadSecondary.set({ speciesId: String(species.id), level, totalExp });
}
