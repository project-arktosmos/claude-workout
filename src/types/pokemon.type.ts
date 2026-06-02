/**
 * Pokémon compendium types. The data backing these lives in
 * `src/data/pokemon-compendium.json`, built from the canonical "master dataset"
 * (Pokémon Showdown: identity, types, evolution levels) plus Pokémon Essentials
 * growth curves — with exactly one value grafted in from the Pokémon-5e ruleset:
 * the base SR. See `src/data/pokemon-compendium.data.ts` for the typed accessors.
 */

import type { ID } from '$types/core.type';

/**
 * Pokémon Essentials experience-curve identifiers (Gen-5+ canon). Each species
 * carries one; it selects the formula in `$utils/pokemon/exp-system`.
 *
 *   fast        4n³/5
 *   medium      n³                          (canon: Medium Fast)
 *   slow        5n³/4
 *   parabolic   6n³/5 − 15n² + 100n − 140   (canon: Medium Slow)
 *   erratic     piecewise around n=50/68/98
 *   fluctuating piecewise around n=15/35
 */
export type GrowthRate = 'fast' | 'medium' | 'slow' | 'parabolic' | 'erratic' | 'fluctuating';

/** A single raw evolution condition as stored in the source chains. */
export interface EvolutionCondition {
	type: 'level' | 'item' | 'loyalty' | 'special' | 'move' | 'time' | 'move-type' | 'gender';
	value: number | string;
}

/** One edge in a species' evolution chain (this species → some other species). */
export interface Evolution {
	/** Stable poke5e id of the evolved species. */
	toId: ID;
	/** Display name of the evolved species, if resolved. */
	toName: string | null;
	/** National-dex number of the evolved species, if resolved. */
	toDexNumber: number | null;
	/** Level required, when the evolution is level-gated; otherwise null. */
	level: number | null;
	/** All raw conditions that gate this evolution. */
	conditions: EvolutionCondition[];
	/** Human-readable trigger, e.g. "Level 6" or "use Fire Stone". */
	trigger: string;
}

/** A single Pokémon species in the compendium. */
export interface PokemonSpecies {
	/** Stable master-dataset (Showdown) id, e.g. "bulbasaur". */
	id: ID;
	/** National Pokédex number. */
	dexNumber: number;
	/** Display name. */
	name: string;
	/** Genus word (e.g. "Seed" → shown as "Seed Pokémon"). */
	category: string | null;
	/** Elemental types in slot order, e.g. ["Grass", "Poison"]. */
	types: string[];
	/** Base SR (Stat Rank) from the Pokémon-5e PHB. */
	sr: number | null;
	/** Experience growth curve, or null when unknown (some alternate formes). */
	growthRate: GrowthRate | null;
	/** Base experience yield on defeat, or null when unknown. */
	baseExp: number | null;
	/** Egg-hatch step count. */
	hatchSteps: number | null;
	/** Generation introduced. */
	generation: number | null;
	/** Outgoing evolutions (may be empty for final-stage species). */
	evolvesTo: Evolution[];
}
