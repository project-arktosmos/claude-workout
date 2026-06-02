import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Nuke the app's SQLite database and kickstart a fresh, empty one.
 *
 * The DB lives in the OS app-data dir under the Tauri bundle identifier.
 * The schema and seed are read from the single source of truth shared with the
 * Rust backend: src-tauri/schema.sql and src-tauri/seed.exercises.sql.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA = readFileSync(join(__dirname, '../src-tauri/schema.sql'), 'utf8');
// Seed data applied after the schema. Shared verbatim with the Rust backend
// (src-tauri/src/events.rs include_str!s the same file). Regenerate with
// scripts/generate-exercise-seed.mjs when the static illustrations change.
const SEED = readFileSync(join(__dirname, '../src-tauri/seed.exercises.sql'), 'utf8');

// Keep in sync with `identifier` in src-tauri/tauri.conf.json
const IDENTIFIER = 'com.arktosmos.claude-workout';
const DB_FILE = 'events.db';

/** Resolve Tauri's `app_data_dir()` for the current OS. */
function appDataDir() {
	const home = homedir();
	switch (platform()) {
		case 'darwin':
			return join(home, 'Library', 'Application Support', IDENTIFIER);
		case 'win32':
			return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), IDENTIFIER);
		default:
			return join(process.env.XDG_DATA_HOME ?? join(home, '.local', 'share'), IDENTIFIER);
	}
}

const dir = appDataDir();
const dbPath = join(dir, DB_FILE);

// 1. Nuke the existing database and its WAL/SHM sidecar files.
for (const suffix of ['', '-wal', '-shm']) {
	const file = dbPath + suffix;
	if (existsSync(file)) {
		rmSync(file);
		console.log(`Removed ${file}`);
	}
}

// 2. Kickstart a fresh database with the shared schema, then seed the catalog.
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(SCHEMA);
db.exec(SEED);
const { count } = db.prepare('SELECT COUNT(*) AS count FROM exercises').get();
db.close();

console.log(`Fresh database created at ${dbPath}`);
console.log(`Seeded ${count} exercises`);
