// Transforms a wild encounter on the /road field into the follower's next
// progression state. All the XP/level/evolution maths lives here (delegating the
// curve formulas to `$utils/pokemon/exp-system`), so neither the canvas component
// nor the service carries any business logic — the service simply persists the
// outcome this adapter returns.

import { AdapterClass } from '$adapters/classes/adapter.class';
import { applyExp, expGainOnDefeat } from '$utils/pokemon/exp-system';
import { typeMultiplier } from '$utils/pokemon/type-chart';
import { pokemonById, pokemonByName } from '$data/pokemon-compendium.data';
import type { PokemonSpecies } from '$types/pokemon.type';

/** A snapshot of the follower's progression an encounter is resolved against. */
export interface RoadProgressionState {
	species: PokemonSpecies;
	level: number;
	totalExp: number;
}

/** The resolved result of a wild encounter: new progression plus feedback fields. */
export interface EncounterOutcome {
	/** Active species after the encounter (may have evolved). */
	species: PokemonSpecies;
	level: number;
	totalExp: number;
	/** XP awarded by this encounter, after the type multiplier is applied. */
	amount: number;
	/**
	 * The attacker's main type (the follower's `types[0]`) used to score the hit,
	 * or undefined when the follower is untyped. Surfaced for the feedback banner.
	 */
	attackerType?: string;
	/**
	 * Type-chart damage multiplier of the follower's main type against the wild
	 * mon's type(s): 0, ¼, ½, 1, 2 or 4. The raw XP is scaled by this before being
	 * applied, so a super-effective hit yields more and an immune one yields none.
	 */
	multiplier: number;
	levelsGained: number;
	/** Name of the species evolved into during this encounter, if any. */
	evolvedInto?: string;
	/**
	 * Names of every form evolved into during this encounter, in chain order. A
	 * single big XP jump can clear more than one threshold, so this lists each
	 * intermediate form (not just the final one in `evolvedInto`). Empty when no
	 * evolution occurred.
	 */
	evolvedNames: string[];
}

/**
 * A wild mon meets the follower at the follower's own level; reaching it awards
 * the Gen-5 scaled XP as if it were defeated in battle, which may raise the level
 * and clear one or more level-gated evolution thresholds. Pure: no stores, no
 * side effects.
 */
export class RoadEncounterAdapter extends AdapterClass {
	constructor() {
		super('road-encounter');
	}

	/**
	 * Resolve an encounter with the named wild species against the given
	 * progression. Returns the new progression + feedback, or null when the foe
	 * is unknown or yields no XP.
	 */
	resolve(state: RoadProgressionState, foeName: string): EncounterOutcome | null {
		const foe = pokemonByName(foeName);
		if (!foe?.baseExp || !state.species) return null;

		const base = expGainOnDefeat({
			baseExp: foe.baseExp,
			defeatedLevel: state.level, // the wild mon shares the follower's level
			winnerLevel: state.level
		});

		// The follower strikes with its main type; scale the raw XP by how effective
		// that type is against the wild mon. An immune (×0) matchup awards no XP;
		// any positive matchup keeps at least 1 so a connecting hit always counts.
		const attackerType = state.species.types[0];
		const multiplier = typeMultiplier(attackerType, foe.types);
		const amount = multiplier === 0 ? 0 : Math.max(1, Math.round(base * multiplier));

		const result = applyExp(
			state.species.growthRate ?? 'medium',
			state.level,
			state.totalExp,
			amount
		);

		// Only re-check the evolution chain when the level actually advanced.
		const { species, evolvedInto, evolvedNames } =
			result.levelsGained > 0
				? this.resolveEvolutions(state.species, result.level)
				: { species: state.species, evolvedInto: undefined, evolvedNames: [] };

		return {
			species,
			level: result.level,
			totalExp: result.totalExp,
			amount,
			attackerType,
			multiplier,
			levelsGained: result.levelsGained,
			evolvedInto,
			evolvedNames
		};
	}

	/**
	 * Walk every level-gated evolution the new level now qualifies for (a big XP
	 * jump can clear more than one threshold). Capped at the chain length.
	 */
	private resolveEvolutions(
		from: PokemonSpecies,
		level: number
	): { species: PokemonSpecies; evolvedInto?: string; evolvedNames: string[] } {
		let species = from;
		let evolvedInto: string | undefined;
		const evolvedNames: string[] = [];
		for (let guard = 0; guard < 5; guard++) {
			const evo = species.evolvesTo.find((e) => e.level !== null && level >= e.level);
			if (!evo) break;
			const next =
				pokemonById(String(evo.toId)) ?? (evo.toName ? pokemonByName(evo.toName) : null);
			if (!next) break;
			species = next;
			evolvedInto = next.name;
			evolvedNames.push(next.name);
		}
		return { species, evolvedInto, evolvedNames };
	}
}

export const roadEncounterAdapter = new RoadEncounterAdapter();
