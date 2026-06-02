import { writable, type Writable } from 'svelte/store';
import { isTauri } from '@tauri-apps/api/core';

/**
 * Persistent Svelte store backed by the **Tauri Store plugin**
 * (`@tauri-apps/plugin-store`) — NOT the browser's native `localStorage`.
 *
 * This is the app's standard persistence layer. The Tauri plugin writes to a
 * JSON file in the OS app-data directory, so values survive across sessions
 * (and app reinstalls within the same data dir) the way browser `localStorage`
 * cannot be relied on inside a packaged Tauri webview. Always persist app state
 * through this util (or a thin service over it); do not call `localStorage`
 * directly. The legacy `localStorageWritableStore` is kept only for existing
 * services and should not be used for new code.
 *
 * Usage:
 *   const score = persistentStore('score', 0);
 *   await score.ready;        // optional: wait for the saved value to hydrate
 *   score.set(10);            // updates the store AND persists to disk
 *
 * Outside the Tauri runtime (e.g. `pnpm dev:vite` in a plain browser, or tests)
 * there is no IPC, so this degrades to an in-memory writable: the API still
 * works, but nothing is persisted. Persistence is a Tauri-runtime feature.
 */

/** Single backing file for all persistent stores. */
const STORE_FILE = 'app-state.json';

// The plugin module is imported lazily (only inside the Tauri runtime) so it is
// never pulled into the static prerender / SSR build where its IPC is absent.
type TauriStore = import('@tauri-apps/plugin-store').Store;
let storePromise: Promise<TauriStore> | null = null;
function getBackingStore(): Promise<TauriStore> {
	if (!storePromise) {
		// `autoSave: false` — we explicitly `save()` after each write so a crash
		// can't lose the most recent value.
		storePromise = import('@tauri-apps/plugin-store').then((m) =>
			m.load(STORE_FILE, { defaults: {}, autoSave: false })
		);
	}
	return storePromise;
}

export interface PersistentStore<T> extends Writable<T> {
	/**
	 * Resolves once the persisted value (if any) has hydrated the store. Await
	 * this before reading the initial value when the saved state matters.
	 */
	ready: Promise<void>;
}

/**
 * Create a persistent writable store for `key`, seeded with `initial` and, in
 * the Tauri runtime, hydrated from and saved to the Store plugin on every write.
 */
export function persistentStore<T>(key: string, initial: T): PersistentStore<T> {
	const { subscribe, set, update } = writable<T>(initial);

	// No-op until hydration wires up the real persister (in Tauri only).
	let persist: (value: T) => void = () => {};

	const ready: Promise<void> = isTauri()
		? (async () => {
				const store = await getBackingStore();
				const saved = await store.get<T>(key);
				if (saved !== undefined && saved !== null) set(saved);
				persist = (value) => {
					// Fire-and-forget; ordering is preserved by the single store promise.
					void store.set(key, value).then(() => store.save());
				};
			})()
		: Promise.resolve();

	return {
		subscribe,
		set: (value: T) => {
			set(value);
			persist(value);
		},
		update: (updater: (value: T) => T) =>
			update((current) => {
				const next = updater(current);
				persist(next);
				return next;
			}),
		ready
	};
}
