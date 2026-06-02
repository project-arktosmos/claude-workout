// Persisted "flags" for the /sfx page: a player can pin any sound effect under a
// custom name so it surfaces in its own grid above the full list. The mapping is
// sound-effect id → custom label, written through the Tauri Store plugin (see
// `$utils/tauriStore`) so the pinned set survives across sessions. The page reads
// and mutates only this store.

import { get } from 'svelte/store';
import { persistentStore } from '$utils/tauriStore';

/** Map of sound-effect id (e.g. "0005") to its player-given custom name. */
export type SfxFlags = Record<string, string>;

/**
 * The set ships with a couple of flags out of the box: "firered 0005" →
 * "new prompt", "firered 0140" → "exercise complete".
 */
export const SFX_FLAGS_DEFAULT: SfxFlags = {
	'0005': 'new prompt',
	'0140': 'exercise complete'
};

/**
 * The live, persisted flags. Mutate through `flagSound` / `unflagSound` so each
 * change is written to disk; `await sfxFlags.ready` before reading on mount.
 */
export const sfxFlags = persistentStore<SfxFlags>('sfx-flags', SFX_FLAGS_DEFAULT);

/** Flag (or rename) a sound effect by id under `name`. Blank names are ignored. */
export function flagSound(id: string, name: string): void {
	const label = name.trim();
	if (!label) return;
	sfxFlags.update((flags) => ({ ...flags, [id]: label }));
}

/** Remove a sound effect's flag by id. */
export function unflagSound(id: string): void {
	sfxFlags.update((flags) => {
		const { [id]: _removed, ...rest } = flags;
		return rest;
	});
}

/** Current custom name for a sound id, or null if it isn't flagged. */
export function flagName(id: string): string | null {
	return get(sfxFlags)[id] ?? null;
}
