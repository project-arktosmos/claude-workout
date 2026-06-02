import { isTauri } from '@tauri-apps/api/core';
import { Menu, Submenu, MenuItem } from '@tauri-apps/api/menu';
import { goto } from '$app/navigation';
import { routes } from 'virtual:routes';

/**
 * Install the app's page navigation into the native Tauri window menu.
 *
 * The route buttons used to live in the {@link Navbar}; they now appear as a
 * "Navigate" submenu in the OS menu bar (the macOS app menu / Windows window
 * menu). Routes are still discovered at build time via the `virtual:routes`
 * plugin, so this stays in sync with the filesystem automatically — clicking a
 * menu item performs a client-side SvelteKit navigation via `goto`.
 *
 * Outside the Tauri runtime (plain `pnpm dev:vite` in a browser, or tests)
 * there is no IPC/native menu, so this is a no-op.
 */
export async function setupAppMenu(): Promise<void> {
	if (!isTauri()) return;

	const navItems = await Promise.all(
		routes.map((route) =>
			MenuItem.new({
				text: route.label,
				action: () => {
					void goto(route.path);
				}
			})
		)
	);

	const navSubmenu = await Submenu.new({
		text: 'Navigate',
		items: navItems
	});

	// Start from the platform default menu (Quit, Edit, Copy/Paste, …) so we only
	// add our navigation entry instead of replacing the OS-provided items.
	const menu = await Menu.default();
	await menu.append(navSubmenu);
	await menu.setAsAppMenu();
}
