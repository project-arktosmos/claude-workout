import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';
import { exerciseAdapter } from '$adapters/classes/exercise.adapter';
import { exerciseFiles, yogaFiles } from '$data/exercises.data';
import { ExerciseCategory, ExerciseMode, type ExerciseImage } from '$types/exercise.type';
import type { ID } from '$types/core.type';
import { pickRandom } from '$utils/array/pickRandom';

/**
 * Build-time catalog derived from the static filename manifest. This is the
 * fallback used during prerender (SSR is off) and before the SQLite catalog —
 * the source of truth — has loaded. The two are generated from the same static
 * folders (see scripts/generate-exercise-seed.mjs), so they agree.
 */
const fallback: ExerciseImage[] = [
	...exerciseAdapter.fromFilenames(exerciseFiles, ExerciseCategory.Exercise),
	...exerciseAdapter.fromFilenames(yogaFiles, ExerciseCategory.Yoga)
];

// Inline the SVG markup (rather than loading via <img>) so the illustrations
// inherit `fill: currentColor` and render in the page's text color. This stays
// a build-time concern — the DB only holds catalog metadata, not the markup.
const rawSvgs = import.meta.glob('/static/{exercise,yoga-poses}/*.svg', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const svgByFile: Record<string, string> = {};
for (const [path, content] of Object.entries(rawSvgs)) {
	const file = path.split('/').pop();
	if (file) svgByFile[file] = content;
}

/**
 * Read-only catalog of every exercise illustration, backed by the SQLite
 * `exercises` table. It starts from the build-time fallback so draws and
 * lookups work immediately, then re-indexes from the database on {@link init}.
 */
class ExercisesService {
	/** Reactive catalog (all categories), for components to render. */
	store: Writable<ExerciseImage[]> = writable<ExerciseImage[]>(fallback);
	private catalog: ExerciseImage[] = fallback;
	private byId = new Map<ID, ExerciseImage>();
	private initialized = false;

	constructor() {
		this.index(fallback);
	}

	/**
	 * Load the catalog from the SQLite database (the source of truth) and
	 * re-index. Safe to call repeatedly and during prerender (no-op outside the
	 * Tauri webview, where the build-time fallback already applies).
	 */
	async init(): Promise<void> {
		if (!browser || this.initialized) return;
		this.initialized = true;
		try {
			const { invoke } = await import('@tauri-apps/api/core');
			const rows = await invoke<ExerciseImage[]>('list_exercises');
			if (rows.length) this.index(rows);
		} catch (err) {
			console.error('exercises.service: init failed', err);
			this.initialized = false;
		}
	}

	private index(images: ExerciseImage[]): void {
		this.catalog = images;
		this.byId = new Map(images.map((image) => [image.id, image]));
		this.store.set(images);
	}

	/** The pool a given mode draws from. */
	private pool(mode: ExerciseMode): ExerciseImage[] {
		switch (mode) {
			case ExerciseMode.Workout:
				return this.catalog.filter((image) => image.category === ExerciseCategory.Exercise);
			case ExerciseMode.Yoga:
				return this.catalog.filter((image) => image.category === ExerciseCategory.Yoga);
			default:
				return this.catalog;
		}
	}

	/**
	 * Draw `count` distinct random exercises from the pool for `mode`, skipping
	 * any id in `exclude` (e.g. banned exercises, or the current one on a
	 * re-roll). Falls back to the full pool when everything would be excluded, so
	 * a draw never comes back empty.
	 */
	draw(mode: ExerciseMode, count = 1, exclude: ID[] = []): ExerciseImage[] {
		const blocked = new Set(exclude.map(String));
		const pool = this.pool(mode).filter((image) => !blocked.has(String(image.id)));
		return pickRandom(pool.length ? pool : this.pool(mode), count);
	}

	/** Resolve stored exercise ids back to displayable images, dropping unknowns. */
	resolve(ids: ID[]): ExerciseImage[] {
		return ids
			.map((id) => this.byId.get(id))
			.filter((image): image is ExerciseImage => Boolean(image));
	}

	/** Raw inline SVG markup for an exercise id, or '' when unavailable. */
	inlineSvg(id: ID): string {
		return svgByFile[String(id)] ?? '';
	}
}

export const exercisesService = new ExercisesService();

/** Backwards-compatible alias for existing call sites. */
export const exercisesCatalog = exercisesService;
