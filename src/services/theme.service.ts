import { persistentStore } from '$utils/tauriStore';

/** The two modes the app toggles between. */
export type Theme = 'light' | 'dark';

/**
 * Maps each mode to the actual DaisyUI theme applied to `<html data-theme>`.
 * "dark" uses DaisyUI's `halloween` theme. Both must be enabled in the
 * `@plugin "daisyui"` config in `src/css/app.css`.
 */
const DAISY_THEME: Record<Theme, string> = {
	light: 'light',
	dark: 'halloween'
};

/** The DaisyUI theme name to put on `<html data-theme>` for a given mode. */
export function daisyTheme(mode: Theme): string {
	return DAISY_THEME[mode];
}

/**
 * The system's current colour-scheme preference, or `'light'` when it can't be
 * read (SSR / prerender, where `window` is absent). Used only to seed the very
 * first run — once the player toggles, their saved choice takes over.
 */
function systemTheme(): Theme {
	if (typeof window === 'undefined' || !window.matchMedia) return 'light';
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * The active DaisyUI theme. Persisted via the Tauri Store plugin so the choice
 * survives across sessions; on a fresh install it defaults to the OS preference.
 * The layout applies it to `<html data-theme>` whenever it changes.
 */
export const theme = persistentStore<Theme>('theme', systemTheme());

/** Flip between light and dark. */
export function toggleTheme(): void {
	theme.update((current) => (current === 'dark' ? 'light' : 'dark'));
}
