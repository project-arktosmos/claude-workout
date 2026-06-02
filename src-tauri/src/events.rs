use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

/// SQLite connection guarded for concurrent access from the hook server thread
/// and from frontend command handlers. Stored as Tauri managed state.
pub struct Db(pub Mutex<Connection>);

/// A single prompt turn, persisted in the app database. Serialized to the
/// frontend's `PromptEvent` shape (camelCase).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PromptEvent {
	pub id: String,
	pub session_id: String,
	pub prompt: String,
	pub cwd: String,
	pub status: String,
	pub started_at: i64,
	pub ended_at: Option<i64>,
	pub duration_ms: Option<i64>,
	pub error_type: Option<String>,
	pub exercises: Vec<ExerciseSegment>,
}

/// One exercise drawn into a round, stamped with the round's running-elapsed
/// (ms) at the moment it became active. Stored as JSON in the `exercises`
/// column; the frontend derives each exercise's run time from these stamps.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExerciseSegment {
	pub id: String,
	pub at_ms: i64,
}

const COLUMNS: &str =
	"id, session_id, prompt, cwd, status, started_at, ended_at, duration_ms, error_type, exercises";

/// A catalog entry from the seeded `exercises` table. Serialized to the
/// frontend's `ExerciseImage` shape (the SVG markup itself is inlined at build
/// time, so it is not carried here).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Exercise {
	pub id: String,
	pub name: String,
	pub category: String,
	pub src: String,
}

fn now_ms() -> i64 {
	SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.map(|d| d.as_millis() as i64)
		.unwrap_or(0)
}

fn row_to_event(row: &rusqlite::Row) -> rusqlite::Result<PromptEvent> {
	Ok(PromptEvent {
		id: row.get(0)?,
		session_id: row.get(1)?,
		prompt: row.get(2)?,
		cwd: row.get(3)?,
		status: row.get(4)?,
		started_at: row.get(5)?,
		ended_at: row.get(6)?,
		duration_ms: row.get(7)?,
		error_type: row.get(8)?,
		exercises: row
			.get::<_, Option<String>>(9)?
			.and_then(|json| serde_json::from_str::<Vec<ExerciseSegment>>(&json).ok())
			.unwrap_or_default(),
	})
}

/// Canonical database schema, shared with scripts/db-reset.mjs.
const SCHEMA: &str = include_str!("../schema.sql");

/// Exercise catalog seed, shared verbatim with scripts/db-reset.mjs. The SQL is
/// idempotent (INSERT OR IGNORE), so it is safe to run on every launch.
const SEED: &str = include_str!("../seed.exercises.sql");

/// Open (creating if needed) the events database under the OS app-data dir.
pub fn init_db(app: &AppHandle) -> Result<Connection, Box<dyn std::error::Error>> {
	let dir = app.path().app_data_dir()?;
	std::fs::create_dir_all(&dir)?;
	let conn = Connection::open(dir.join("events.db"))?;
	conn.execute_batch(SCHEMA)?;
	// Migrate databases created before the exercises column existed; ignore the
	// "duplicate column" error when it is already present.
	let _ = conn.execute("ALTER TABLE prompt_events ADD COLUMN exercises TEXT", []);
	// Seed the exercise catalog so a freshly created (or app-init) database has
	// the data the exercises page and events feed read. Idempotent.
	conn.execute_batch(SEED)?;
	// Close out turns left `running` by a previous app run (see below) so the
	// /road game doesn't read them as perpetually in-flight.
	reconcile_orphans(&conn)?;
	Ok(conn)
}

/// Reconcile turns left `running` by a previous app run. The hook server is the
/// source of truth for a turn's lifecycle, but it only lives while the app does:
/// any row still `running` at startup belongs to a session whose closing `Stop`
/// we can never receive (the app was down when it ended, or the session was
/// killed mid-turn). Left alone, such an orphan reads as perpetually in-flight
/// and keeps `eventsService.anyRunning` true forever, so the /road game walks
/// and never pauses. Mark them as abandoned with no duration so they drop out of
/// the "running" set without polluting any round's accumulated time.
fn reconcile_orphans(conn: &Connection) -> rusqlite::Result<()> {
	conn.execute(
		"UPDATE prompt_events
			SET status = 'failed', error_type = 'abandoned', ended_at = started_at, duration_ms = 0
			WHERE status = 'running'",
		[],
	)?;
	Ok(())
}

fn fetch_event(conn: &Connection, id: &str) -> rusqlite::Result<PromptEvent> {
	conn.query_row(
		&format!("SELECT {COLUMNS} FROM prompt_events WHERE id = ?1"),
		[id],
		row_to_event,
	)
}

/// Persist a raw Claude Code hook payload. Returns the affected event (the new
/// running turn, or the just-closed one) so the caller can emit it, or `None`
/// when an end hook has no matching running turn.
fn record_hook(
	conn: &Connection,
	payload: &serde_json::Value,
) -> rusqlite::Result<Option<PromptEvent>> {
	let event_name = payload
		.get("hook_event_name")
		.and_then(|v| v.as_str())
		.unwrap_or("");
	let session_id = payload
		.get("session_id")
		.and_then(|v| v.as_str())
		.unwrap_or("unknown");

	if event_name == "UserPromptSubmit" {
		let id = uuid::Uuid::new_v4().to_string();
		let prompt = payload.get("prompt").and_then(|v| v.as_str()).unwrap_or("");
		let cwd = payload.get("cwd").and_then(|v| v.as_str()).unwrap_or("");
		conn.execute(
			"INSERT INTO prompt_events (id, session_id, prompt, cwd, status, started_at)
				VALUES (?1, ?2, ?3, ?4, 'running', ?5)",
			rusqlite::params![id, session_id, prompt, cwd, now_ms()],
		)?;
		return fetch_event(conn, &id).map(Some);
	}

	// Stop / StopFailure: close out the most recent running turn for this session.
	let failed = event_name == "StopFailure";
	let target: Option<(String, i64)> = conn
		.query_row(
			"SELECT id, started_at FROM prompt_events
				WHERE session_id = ?1 AND status = 'running'
				ORDER BY started_at DESC LIMIT 1",
			[session_id],
			|r| Ok((r.get(0)?, r.get(1)?)),
		)
		.ok();

	let Some((id, started_at)) = target else {
		return Ok(None);
	};
	let ended_at = now_ms();
	let error_type = failed.then(|| {
		payload
			.get("error_type")
			.and_then(|v| v.as_str())
			.unwrap_or("unknown")
			.to_string()
	});
	conn.execute(
		"UPDATE prompt_events
			SET status = ?1, ended_at = ?2, duration_ms = ?3, error_type = ?4
			WHERE id = ?5",
		rusqlite::params![
			if failed { "failed" } else { "completed" },
			ended_at,
			ended_at - started_at,
			error_type,
			id
		],
	)?;
	fetch_event(conn, &id).map(Some)
}

/// Called by the hook server for every received payload: persist it, then emit
/// the resulting event to the frontend for live updates.
pub fn handle_payload(app: &AppHandle, payload: serde_json::Value) {
	let db = app.state::<Db>();
	let result = {
		let Ok(conn) = db.0.lock() else {
			return;
		};
		record_hook(&conn, &payload)
	};
	match result {
		Ok(Some(event)) => {
			if let Err(err) = app.emit("prompt-event", event) {
				log::error!("Failed to emit prompt-event: {err}");
			}
		}
		Ok(None) => {}
		Err(err) => log::error!("Failed to record hook payload: {err}"),
	}
}

#[tauri::command]
pub fn list_prompt_events(db: State<Db>) -> Result<Vec<PromptEvent>, String> {
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	let mut stmt = conn
		.prepare(&format!(
			"SELECT {COLUMNS} FROM prompt_events ORDER BY started_at DESC"
		))
		.map_err(|e| e.to_string())?;
	let events = stmt
		.query_map([], row_to_event)
		.map_err(|e| e.to_string())?
		.collect::<rusqlite::Result<Vec<_>>>()
		.map_err(|e| e.to_string())?;
	Ok(events)
}

/// Persist the exercises drawn by the frontend for a given turn.
#[tauri::command]
pub fn set_prompt_exercises(
	db: State<Db>,
	id: String,
	exercises: Vec<ExerciseSegment>,
) -> Result<(), String> {
	let json = serde_json::to_string(&exercises).map_err(|e| e.to_string())?;
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	conn.execute(
		"UPDATE prompt_events SET exercises = ?1 WHERE id = ?2",
		rusqlite::params![json, id],
	)
	.map_err(|e| e.to_string())?;
	Ok(())
}

/// List the seeded exercise catalog (workout + yoga) for the exercises page
/// and the events feed's random draw, ordered by category then name.
#[tauri::command]
pub fn list_exercises(db: State<Db>) -> Result<Vec<Exercise>, String> {
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	let mut stmt = conn
		.prepare("SELECT id, name, category, src FROM exercises ORDER BY category, name")
		.map_err(|e| e.to_string())?;
	let rows = stmt
		.query_map([], |r| {
			Ok(Exercise {
				id: r.get(0)?,
				name: r.get(1)?,
				category: r.get(2)?,
				src: r.get(3)?,
			})
		})
		.map_err(|e| e.to_string())?
		.collect::<rusqlite::Result<Vec<_>>>()
		.map_err(|e| e.to_string())?;
	Ok(rows)
}

#[tauri::command]
pub fn clear_prompt_events(db: State<Db>) -> Result<(), String> {
	let conn = db.0.lock().map_err(|e| e.to_string())?;
	conn.execute("DELETE FROM prompt_events", [])
		.map_err(|e| e.to_string())?;
	Ok(())
}
