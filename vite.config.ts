import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { routesPlugin } from './vite-plugins/routes';

// The app must ONLY ever use port 1995 — both the dev server and HMR.
const PORT = 1995;

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), routesPlugin()],

	// Tauri expects a fixed dev server URL; strictPort makes Vite fail loudly
	// instead of silently falling back to another port.
	clearScreen: false,
	server: {
		port: PORT,
		strictPort: true,
		host: false,
		hmr: {
			protocol: 'ws',
			host: 'localhost',
			port: PORT
		},
		watch: {
			// Don't watch the Rust side; cargo handles that.
			ignored: ['**/src-tauri/**']
		}
	}
});
