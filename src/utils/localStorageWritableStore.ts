import { writable } from 'svelte/store';

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

/**
 * @deprecated Backed by the browser's native `localStorage`, which is not a
 * reliable persistence target inside a packaged Tauri webview. Use
 * `persistentStore` from `$utils/tauriStore` (the Tauri Store plugin) for all
 * new persistence — see the "Persistence" section in CLAUDE.md. Kept only for
 * the existing array/object services.
 */
export default function localStorageWritableStore<T>(key: string, initialValue: T) {
	if (!isBrowser) {
		return writable(initialValue);
	}
	const storedValue = localStorage.getItem(key);
	const parsedValue = storedValue ? JSON.parse(storedValue) : initialValue;
	const store = writable<T>(parsedValue);
	store.subscribe((value) => {
		localStorage.setItem(key, JSON.stringify(value));
	});
	return store;
}