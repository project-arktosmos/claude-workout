// Typed accessors over the Pokémon-5e compendium.
//
// The raw data in `pokemon-compendium.json` is built from the canonical master
// dataset (Pokémon Showdown: identity, types, evolution levels) plus Pokémon
// Essentials growth curves, with the base SR (Stat Rank) grafted in from the
// Pokémon-5e ruleset. Per species it carries: national-dex number, genus,
// elemental types, base SR, the EXP growth rate and base-exp yield, and the
// outgoing evolution edges with their level/trigger.
//
// To regenerate, run `node scripts/generate-pokemon-compendium.mjs` against the
// Pokémon-Champions-5e source repo (see that script's header).

import type { PokemonSpecies } from '$types/pokemon.type';
import raw from '$data/pokemon-compendium.json';

/** The full compendium, ordered by national-dex number (formes trailing). */
export const pokemonCompendium = raw as PokemonSpecies[];

const byDex = new Map(pokemonCompendium.map((p) => [p.dexNumber, p]));
const byName = new Map(pokemonCompendium.map((p) => [p.name.toLowerCase(), p]));
const byId = new Map(pokemonCompendium.map((p) => [p.id, p]));

/** Look up the base-forme species for a national-dex number. */
export function pokemonByDex(dexNumber: number): PokemonSpecies | null {
	return byDex.get(dexNumber) ?? null;
}

/** Look up a species by (case-insensitive) name. */
export function pokemonByName(name: string): PokemonSpecies | null {
	return byName.get(name.toLowerCase()) ?? null;
}

/** Look up a species by its stable master-dataset (Showdown) id. */
export function pokemonById(id: string): PokemonSpecies | null {
	return byId.get(id) ?? null;
}

/** One distinct base-SR tier present in the compendium. */
export interface SrTier {
	/** The base Stat Rank value. */
	sr: number;
	/** How many species in the compendium share this SR. */
	count: number;
}

/**
 * Every distinct base-SR value in the compendium, ascending, each with the
 * number of species at that rank. Species without an SR (`null`) are skipped.
 */
export const pokemonSrTiers: SrTier[] = (() => {
	const counts = new Map<number, number>();
	for (const p of pokemonCompendium) {
		if (p.sr === null) continue;
		counts.set(p.sr, (counts.get(p.sr) ?? 0) + 1);
	}
	return Array.from(counts, ([sr, count]) => ({ sr, count })).sort((a, b) => a.sr - b.sr);
})();

/**
 * The wild-encounter SR ceiling for a follower currently at `currentSr`: the
 * next distinct SR tier strictly above it on the dex-wide ladder (e.g. SR 5 → 8).
 * A follower already at the top tier (or with no SR) caps at its own SR, falling
 * back to the lowest tier when SR is unknown.
 */
export function nextSrCap(currentSr: number | null): number {
	if (currentSr === null) return pokemonSrTiers[0]?.sr ?? 0;
	return pokemonSrTiers.find((t) => t.sr > currentSr)?.sr ?? currentSr;
}

/**
 * The 151 Generation-I base-forme species, in national-dex order. The compendium
 * lists each species' base forme before its alternate formes (Mega, Gmax, regional
 * …), so the first entry seen per dex number is the base forme.
 */
export const gen1BaseSpecies: PokemonSpecies[] = (() => {
	const seen = new Set<number>();
	const out: PokemonSpecies[] = [];
	for (const p of pokemonCompendium) {
		if (p.generation !== 1 || seen.has(p.dexNumber)) continue;
		seen.add(p.dexNumber);
		out.push(p);
	}
	return out;
})();

/**
 * Gen-I base-forme species eligible to spawn against a follower at `currentSr`:
 * those whose base SR is at or below the follower's next ladder step
 * (`nextSrCap`). Species without an SR are never eligible.
 */
export function gen1WildPool(currentSr: number | null): PokemonSpecies[] {
	const cap = nextSrCap(currentSr);
	return gen1BaseSpecies.filter((p) => p.sr !== null && p.sr <= cap);
}
