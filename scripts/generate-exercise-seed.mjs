import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Regenerate src-tauri/seed.exercises.sql from the SVG illustrations under
 * static/. This is the single source of truth for the `exercises` catalog
 * table: the emitted SQL is applied by both scripts/db-reset.mjs and the Rust
 * `init_db` (via include_str!). Run this whenever the static assets change:
 *
 *   node scripts/generate-exercise-seed.mjs
 *
 * The id/name derivation mirrors src/adapters/classes/exercise.adapter.ts so
 * the seeded catalog matches what the adapter would have produced from the
 * filenames (slug-id.svg → title-cased slug; anonymous `exercise` slugs are
 * numbered sequentially within their sorted category).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// category value (matches ExerciseCategory enum) → static folder it lives in.
const CATEGORIES = [
	{ category: 'exercise', folder: 'exercise' },
	{ category: 'yoga', folder: 'yoga-poses' }
];

function toTitle(slug) {
	return slug
		.split('-')
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

/** Derive the display name from a `slug-id.svg` filename. */
function displayName(filename, index) {
	const base = filename.replace(/\.svg$/i, '');
	const match = base.match(/^(.*?)-(\d+)$/);
	const slug = match ? match[1] : base;
	return slug && slug !== 'exercise' ? toTitle(slug) : `Exercise ${index + 1}`;
}

/** Escape a string literal for inclusion in single-quoted SQL. */
function sql(value) {
	return `'${value.replace(/'/g, "''")}'`;
}

const rows = [];
for (const { category, folder } of CATEGORIES) {
	const files = readdirSync(join(ROOT, 'static', folder))
		.filter((name) => name.toLowerCase().endsWith('.svg'))
		.sort();

	files.forEach((filename, index) => {
		rows.push({
			id: filename,
			name: displayName(filename, index),
			category,
			src: `/${folder}/${filename}`
		});
	});
}

const lines = rows.map(
	(r) =>
		`INSERT OR IGNORE INTO exercises (id, name, category, src) VALUES (${sql(r.id)}, ${sql(r.name)}, ${sql(r.category)}, ${sql(r.src)});`
);

const header = `-- GENERATED FILE — do not edit by hand.
-- Regenerate with: node scripts/generate-exercise-seed.mjs
-- Seeds the \`exercises\` catalog table (see src-tauri/schema.sql). Idempotent:
-- INSERT OR IGNORE leaves existing rows untouched, so it is safe to run on
-- every app start as well as on a fresh db:reset.
`;

const outPath = join(ROOT, 'src-tauri', 'seed.exercises.sql');
writeFileSync(outPath, `${header}\n${lines.join('\n')}\n`, 'utf8');
console.log(`Wrote ${rows.length} exercise rows to ${outPath}`);
