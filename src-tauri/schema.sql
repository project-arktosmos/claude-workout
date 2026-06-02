-- Canonical schema for the app's SQLite database.
-- Single source of truth: read by `init_db` in src/events.rs (via include_str!)
-- and by scripts/db-reset.mjs. Do not duplicate this elsewhere.

CREATE TABLE IF NOT EXISTS prompt_events (
	id           TEXT PRIMARY KEY,
	session_id   TEXT NOT NULL,
	prompt       TEXT NOT NULL,
	cwd          TEXT NOT NULL,
	status       TEXT NOT NULL,
	started_at   INTEGER NOT NULL,
	ended_at     INTEGER,
	duration_ms  INTEGER,
	error_type   TEXT,
	exercises    TEXT
);

CREATE INDEX IF NOT EXISTS idx_prompt_events_session
	ON prompt_events (session_id, status);

-- The browseable catalog of workout and yoga illustrations. The SVG markup
-- itself stays bundled in the app (inlined at build time so it inherits the
-- page's text colour); this table holds the catalog metadata that the
-- exercises page lists and that the events feed draws from. Seeded from
-- seed.exercises.sql by both scripts/db-reset.mjs and Rust `init_db`.
CREATE TABLE IF NOT EXISTS exercises (
	id        TEXT PRIMARY KEY,  -- source SVG filename, e.g. tadasana-4777337.svg
	name      TEXT NOT NULL,     -- display name, e.g. "Tadasana"
	category  TEXT NOT NULL,     -- 'exercise' | 'yoga'
	src       TEXT NOT NULL      -- absolute URL of the SVG under static/
);

CREATE INDEX IF NOT EXISTS idx_exercises_category
	ON exercises (category);
