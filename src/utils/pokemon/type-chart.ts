/**
 * The canonical Pokémon type-effectiveness chart (Gen-6+, all 18 types) and the
 * helpers the /road field uses to score a wild encounter. When a wild mon reaches
 * a follower, the follower is the *attacker* striking with its **main type**
 * (`species.types[0]`); this module multiplies that attacking type's effectiveness
 * against each of the defender's types to produce the battle's damage multiplier,
 * which then scales the XP awarded.
 *
 * A dual-type defender stacks both lookups (e.g. Fire→Grass ×2 and Fire→Poison ×1
 * gives ×2; Fire→Bug ×2 and Fire→Steel ×2 gives ×4). Possible products are the
 * usual 0, ¼, ½, 1, 2 and 4.
 *
 * Pure data + pure functions — no stores, no side effects.
 */

/** The 18 elemental types, in canonical (display) capitalisation. */
export const POKEMON_TYPES = [
	'Normal',
	'Fire',
	'Water',
	'Electric',
	'Grass',
	'Ice',
	'Fighting',
	'Poison',
	'Ground',
	'Flying',
	'Psychic',
	'Bug',
	'Rock',
	'Ghost',
	'Dragon',
	'Dark',
	'Steel',
	'Fairy'
] as const;

/**
 * Attacking effectiveness, keyed by lowercased type name. The outer key is the
 * attacker's type, the inner map lists only the defender types whose multiplier
 * differs from the neutral 1 (0 = immune, 0.5 = resists, 2 = weak). Any defender
 * type absent from a row is neutral (×1). Mirrors Bulbapedia's type chart.
 */
const ATTACK_CHART: Record<string, Record<string, number>> = {
	normal: { rock: 0.5, ghost: 0, steel: 0.5 },
	fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
	water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
	electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
	grass: {
		fire: 0.5,
		water: 2,
		grass: 0.5,
		poison: 0.5,
		ground: 2,
		flying: 0.5,
		bug: 0.5,
		rock: 2,
		dragon: 0.5,
		steel: 0.5
	},
	ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
	fighting: {
		normal: 2,
		ice: 2,
		poison: 0.5,
		flying: 0.5,
		psychic: 0.5,
		bug: 0.5,
		rock: 2,
		ghost: 0,
		dark: 2,
		steel: 2,
		fairy: 0.5
	},
	poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
	ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
	flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
	psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
	bug: {
		fire: 0.5,
		grass: 2,
		fighting: 0.5,
		poison: 0.5,
		flying: 0.5,
		psychic: 2,
		ghost: 0.5,
		dark: 2,
		steel: 0.5,
		fairy: 0.5
	},
	rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
	ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
	dragon: { dragon: 2, steel: 0.5, fairy: 0 },
	dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
	steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
	fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 }
};

/**
 * Effectiveness of a single attacking type against a single defending type, with
 * neutral (×1) as the default for any pairing not listed. Case-insensitive.
 */
export function singleTypeMultiplier(attacker: string, defender: string): number {
	const row = ATTACK_CHART[attacker.toLowerCase()];
	if (!row) return 1;
	return row[defender.toLowerCase()] ?? 1;
}

/**
 * Overall damage multiplier of an attacker's **main type** against a (possibly
 * dual-type) defender — the product of the per-type lookups. Returns 1 when the
 * attacking type is missing or unknown, so an untyped follower never zeroes its XP.
 */
export function typeMultiplier(
	attackerType: string | undefined | null,
	defenderTypes: readonly string[]
): number {
	if (!attackerType || !ATTACK_CHART[attackerType.toLowerCase()]) return 1;
	return defenderTypes.reduce((mult, def) => mult * singleTypeMultiplier(attackerType, def), 1);
}

/**
 * Compact label for a multiplier, e.g. `×2`, `×0.5`, `×0.25`, `×0`. Trailing
 * zeros are trimmed so the canon ¼/½/2/4 values read cleanly.
 */
export function formatMultiplier(multiplier: number): string {
	const rounded = Math.round(multiplier * 100) / 100;
	return `×${rounded}`;
}

/**
 * Human label for how effective the hit was, matching the mainline games' battle
 * messages. Empty string for a neutral (×1) hit, which needs no callout.
 */
export function effectivenessLabel(multiplier: number): string {
	if (multiplier === 0) return 'No effect';
	if (multiplier > 1) return 'Super effective';
	if (multiplier < 1) return 'Not very effective';
	return '';
}
