# Claude Workout

A cross-platform desktop app built with [SvelteKit](https://svelte.dev/docs/kit) (Svelte 5) and [Tauri v2](https://v2.tauri.app/). The web frontend is rendered with Vite + TailwindCSS v4 / DaisyUI v5, and packaged into a native desktop window by Tauri. State is persisted with the Tauri Store plugin.

## Prerequisites

You need the following installed before you can run the app:

- **[Node.js](https://nodejs.org/) 20+** — `engine-strict` is enabled, so use a current LTS.
- **[pnpm](https://pnpm.io/installation)** — this project uses pnpm (see `pnpm-lock.yaml`). Install with `npm install -g pnpm` or `corepack enable`.
- **[Rust](https://www.rust-lang.org/tools/install) 1.77.2+** (with Cargo) — required by Tauri to build the native shell. Install via [rustup](https://rustup.rs/).
- **Tauri system dependencies** — platform-specific native libraries. Follow the official [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/) for your OS:
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`)
  - **Linux:** `webkit2gtk`, `libappindicator`, `librsvg`, `patchelf`, and build essentials (see the Tauri guide for the exact package list)
  - **Windows:** Microsoft C++ Build Tools and the WebView2 runtime

## Install

Clone the repository and install the frontend dependencies:

```bash
pnpm install
```

This also runs `svelte-kit sync` (via the `prepare` script) to generate type definitions. Rust dependencies are fetched automatically by Cargo the first time you run or build the Tauri app.

## Run (development)

Launch the full desktop app with hot-reloading:

```bash
pnpm dev
```

This runs `tauri dev`, which starts the Vite dev server on **port 1995** (`pnpm dev:vite`) and opens the native window pointing at it. The first run compiles the Rust side and may take a few minutes; subsequent runs are fast.

> **Note:** the dev server is locked to port 1995 (`strictPort`). If that port is in use, free it before starting — Vite will fail loudly rather than fall back to another port.

### Frontend only (browser)

To work on the UI in a regular browser without the Tauri shell:

```bash
pnpm dev:vite
```

Then open <http://localhost:1995>. Note that Tauri-only features — most importantly persistence through the Store plugin — degrade to in-memory behavior when running outside the Tauri runtime, so nothing is saved to disk in this mode.

## Build (production)

Build the distributable native application (installers/bundles for your platform):

```bash
pnpm tauri:build
```

This first builds the web frontend with `pnpm build` (output to `dist/`) and then compiles and bundles the native app. The resulting installers are written under `src-tauri/target/release/bundle/`.

To build only the web frontend (static SPA into `dist/`):

```bash
pnpm build
pnpm preview   # serve the production build locally
```

## Other scripts

| Command               | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `pnpm check`          | Type-check the project with `svelte-check`               |
| `pnpm check:watch`    | Type-check in watch mode                                 |
| `pnpm lint`           | Check formatting (Prettier) and lint (ESLint)            |
| `pnpm format`         | Auto-format the codebase with Prettier                   |
| `pnpm test`           | Run the test suite once (Vitest)                         |
| `pnpm test:ui`        | Run tests with the interactive Vitest UI                 |
| `pnpm test:coverage`  | Run tests and produce a coverage report                  |
| `pnpm clean`          | Remove `dist/` and `.svelte-kit/` build artifacts        |

## Project structure

```
src/                SvelteKit frontend (components, services, adapters, utils, routes)
src-tauri/          Rust/Tauri native shell, config, and plugins
scripts/            Data-generation and maintenance scripts
static/             Static assets served as-is
test/               Vitest test suites mirroring src/
```

See [CLAUDE.md](CLAUDE.md) for detailed architecture and contribution conventions.
