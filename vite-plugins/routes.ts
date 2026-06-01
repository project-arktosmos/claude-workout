import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Build-time route discovery plugin.
 *
 * Walks `src/routes` looking for SvelteKit `+page.svelte` files and exposes the
 * resulting navigable routes through a virtual module so the navbar can render a
 * button per page without any runtime filesystem access (important for the
 * adapter-static / Tauri SPA build).
 *
 * Usage in a component:
 *
 *   import { routes } from 'virtual:routes';
 */

const VIRTUAL_ID = 'virtual:routes';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

export interface DiscoveredRoute {
	/** URL path, e.g. `/` or `/about`. */
	path: string;
	/** Human-friendly label derived from the folder name, e.g. `About`. */
	label: string;
}

/** Turn a route segment like `user-settings` into a label like `User Settings`. */
function toLabel(segment: string): string {
	return segment
		.split('-')
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

/**
 * A segment is dynamic / non-navigable when it contains route params (`[id]`,
 * `[...rest]`) — we can't link to those without data, so they're skipped.
 */
function isDynamic(segment: string): boolean {
	return segment.includes('[') || segment.includes(']');
}

/** Route groups like `(app)` don't contribute a URL segment — unwrap them. */
function isGroup(segment: string): boolean {
	return segment.startsWith('(') && segment.endsWith(')');
}

function discoverRoutes(routesDir: string): DiscoveredRoute[] {
	const found: DiscoveredRoute[] = [];

	function walk(dir: string, skip: boolean) {
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}

		const hasPage = entries.includes('+page.svelte');
		if (hasPage && !skip) {
			const rel = relative(routesDir, dir);
			const segments = rel
				.split(sep)
				.filter((s) => s && !isGroup(s));

			const path = segments.length ? '/' + segments.join('/') : '/';
			const last = segments[segments.length - 1];
			const label = segments.length === 0 ? 'Home' : toLabel(last);
			found.push({ path, label });
		}

		for (const entry of entries) {
			const full = join(dir, entry);
			if (!statSync(full).isDirectory()) continue;
			// Skip the descent into dynamic dirs so we never emit param routes.
			walk(full, skip || isDynamic(entry));
		}
	}

	walk(routesDir, false);

	// Home first, then alphabetical by label for stable, readable nav order.
	return found.sort((a, b) => {
		if (a.path === '/') return -1;
		if (b.path === '/') return 1;
		return a.label.localeCompare(b.label);
	});
}

export function routesPlugin(): Plugin {
	let routesDir = '';

	return {
		name: 'arktosmos:routes',

		configResolved(config) {
			routesDir = join(config.root, 'src', 'routes');
		},

		resolveId(id) {
			if (id === VIRTUAL_ID) return RESOLVED_ID;
		},

		load(id) {
			if (id !== RESOLVED_ID) return;
			const routes = discoverRoutes(routesDir);
			return `export const routes = ${JSON.stringify(routes)};`;
		},

		// In dev, adding/removing a route folder should rebuild the virtual module.
		configureServer(server) {
			const invalidate = (file: string) => {
				if (!file.startsWith(routesDir)) return;
				const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
				if (mod) {
					server.moduleGraph.invalidateModule(mod);
					server.ws.send({ type: 'full-reload' });
				}
			};
			server.watcher.on('add', invalidate);
			server.watcher.on('unlink', invalidate);
			server.watcher.on('addDir', invalidate);
			server.watcher.on('unlinkDir', invalidate);
		}
	};
}
