import { persistentStore } from '$utils/tauriStore';

/**
 * Whether the app's sound cues (the "new prompt" / "exercise complete" effects
 * played from the road page) are allowed to fire. Persisted via the Tauri Store
 * plugin so the choice survives across sessions; defaults to on.
 *
 * Playback sites gate on this — flipping it off silences every cue immediately
 * without unflagging the chosen clips on the /sfx page.
 */
export const soundEnabled = persistentStore<boolean>('sound-enabled', true);
