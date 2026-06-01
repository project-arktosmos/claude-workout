// Types for the `virtual:routes` module produced at build time by
// `vite-plugins/routes.ts`. Keep `DiscoveredRoute` in sync with that plugin.
declare module 'virtual:routes' {
	export interface DiscoveredRoute {
		/** URL path, e.g. `/` or `/about`. */
		path: string;
		/** Human-friendly label derived from the folder name. */
		label: string;
	}

	export const routes: DiscoveredRoute[];
}
