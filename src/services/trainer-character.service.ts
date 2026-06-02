// Which trainer charset (boy or girl) walks beside Bulbasaur on the /road page.
// The choice is a UI preference toggled from the road's top-right panel, persisted
// through the Tauri Store plugin (see `$utils/tauriStore`) so a reopened session
// keeps the same trainer. The page reads/writes only this store.

import { persistentStore } from '$utils/tauriStore';
import type { TrainerCharacter } from '$utils/game/road-game';

/** The journey starts with the boy trainer (Red). */
export const TRAINER_CHARACTER_DEFAULT: TrainerCharacter = 'boy';

/**
 * The live, persisted trainer choice. Calling `.set(...)` updates the UI and
 * writes to disk via the Tauri Store plugin; `await trainerCharacter.ready`
 * before reading the restored value on mount.
 */
export const trainerCharacter = persistentStore<TrainerCharacter>(
	'trainer-character',
	TRAINER_CHARACTER_DEFAULT
);

/** Restore the trainer choice to the default (boy), persisting the change. */
export function resetTrainerCharacter(): void {
	trainerCharacter.set(TRAINER_CHARACTER_DEFAULT);
}
