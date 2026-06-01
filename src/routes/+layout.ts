// Tauri bundles a static SPA — there is no Node server at runtime.
// Disable SSR and prerender the shell so adapter-static can emit index.html.
export const ssr = false;
export const prerender = true;
