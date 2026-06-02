import { persistentStore } from '$utils/tauriStore';

/** The per-exercise countdown lengths the road panel offers, in seconds. */
export const WINDOW_OPTIONS = [10, 20, 30] as const;
export type WindowSeconds = (typeof WINDOW_OPTIONS)[number];

/** Default window: a fresh exercise every 30 seconds of prompt-running time. */
const DEFAULT_WINDOW: WindowSeconds = 30;

/**
 * How long each drawn exercise stays up before the road panel rolls a fresh one
 * and restarts the countdown. Persisted via the Tauri Store plugin so the choice
 * survives across sessions.
 *
 * The countdown itself is *not* a free-running timer: it is driven by the
 * prompt-running clock in the road page (see `src/routes/road/+page.svelte`), so
 * windows only advance while a Claude Code prompt is in flight and a long prompt
 * cycles through several exercises, one per window.
 */
export const exerciseWindowSeconds = persistentStore<WindowSeconds>(
	'exercise-window-seconds',
	DEFAULT_WINDOW
);
