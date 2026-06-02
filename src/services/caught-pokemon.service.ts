// The player's caught-Pokémon roster for the /road field. Wild mon that walk to
// the trainer (rather than the follower) are *caught* instead of battled — each
// one is appended here. The player can promote any caught mon to "primary": the
// active map follower, which swaps the field sprite and progression via the
// road-game service.
//
// Persistence rides on the Tauri Store plugin through `persistentStore`; this
// service owns the roster store and the two actions over it.

import { get } from 'svelte/store';
import { persistentStore } from '$utils/tauriStore';
import { pokemonByName } from '$data/pokemon-compendium.data';
import { setActiveFollower, setSecondaryFollower } from '$services/road-game.service';

/** One caught Pokémon: a unique instance over a compendium species at a level. */
export interface CaughtMon {
	/** Stable per-instance id (the same species can be caught more than once). */
	id: string;
	/** Compendium (master-dataset) species id, e.g. "rattata". */
	speciesId: string;
	/** Level it was caught at (wild mon share the follower's level). */
	level: number;
}

/** The roster plus which instances fill the two map-follower slots. */
export interface CaughtState {
	mons: CaughtMon[];
	/** Instance id of the primary follower (cell B2), or null while the starter is active. */
	primaryId: string | null;
	/** Instance id of the secondary follower (cell D2), or null while that slot is empty. */
	secondaryId: string | null;
}

/** The live, persisted caught roster. Starts empty with no promoted slots. */
export const caughtPokemon = persistentStore<CaughtState>('road-caught', {
	mons: [],
	primaryId: null,
	secondaryId: null
});

/** The empty roster a brand-new (or reset) game begins from. */
const EMPTY_ROSTER: CaughtState = { mons: [], primaryId: null, secondaryId: null };

/**
 * Record a capture: resolve the species by name and append it to the roster at
 * the given level. Returns the new entry, or null when the species is unknown.
 */
export function capturePokemon(speciesName: string, level: number): CaughtMon | null {
	const species = pokemonByName(speciesName);
	if (!species) return null;

	const mon: CaughtMon = { id: crypto.randomUUID(), speciesId: String(species.id), level };
	const state = get(caughtPokemon);

	// The first Pokémon caught on the road fills the (empty) secondary slot at D2,
	// so it starts battling for its own XP straight away — just like the primary.
	const fillsSecondary = state.secondaryId === null;
	caughtPokemon.set({
		...state,
		mons: [...state.mons, mon],
		secondaryId: fillsSecondary ? mon.id : state.secondaryId
	});
	if (fillsSecondary) setSecondaryFollower(mon.speciesId, mon.level);

	return mon;
}

/**
 * Begin a fresh roster from the chosen starter: it is the player's first caught
 * Pokémon and the primary (active map) follower. Replaces any prior roster, so a
 * new game never inherits the previous run's catches. The road progress is seeded
 * separately by `startNewGame`, which is the source of truth for the live sprite.
 */
export function seedStarterCaught(speciesName: string, level: number): void {
	const species = pokemonByName(speciesName);
	if (!species) {
		caughtPokemon.set(EMPTY_ROSTER);
		return;
	}

	const mon: CaughtMon = { id: crypto.randomUUID(), speciesId: String(species.id), level };
	caughtPokemon.set({ mons: [mon], primaryId: mon.id, secondaryId: null });
}

/** Wipe the caught roster back to empty (used when a game is reset). */
export function resetCaught(): void {
	caughtPokemon.set(EMPTY_ROSTER);
}

/**
 * Promote a caught mon to primary: make it the active map follower (swapping the
 * field sprite + progression via the road-game service) and mark it primary so
 * the roster panel reflects the change.
 */
export function setPrimaryCaught(id: string): void {
	const state = get(caughtPokemon);
	const mon = state.mons.find((m) => m.id === id);
	if (!mon) return;

	setActiveFollower(mon.speciesId, mon.level);
	// A mon never occupies both slots — drop it from the secondary if it was there.
	caughtPokemon.set({
		...state,
		primaryId: id,
		secondaryId: state.secondaryId === id ? null : state.secondaryId
	});
}

/**
 * Assign a caught mon to the secondary slot (cell D2): make it the active
 * secondary follower (swapping the D2 sprite + progression via the road-game
 * service) and mark it secondary so the roster panel reflects the change.
 */
export function setSecondaryCaught(id: string): void {
	const state = get(caughtPokemon);
	const mon = state.mons.find((m) => m.id === id);
	if (!mon) return;

	setSecondaryFollower(mon.speciesId, mon.level);
	// A mon never occupies both slots — drop it from the primary if it was there.
	caughtPokemon.set({
		...state,
		secondaryId: id,
		primaryId: state.primaryId === id ? null : state.primaryId
	});
}
