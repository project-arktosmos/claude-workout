use std::sync::Mutex;

use tauri::Manager;

mod events;
use events::Db;

/// Local address the Claude Code hooks POST their lifecycle payloads to.
/// Keep this in sync with the `command` entries in `~/.claude/settings.json`.
const HOOK_SERVER_ADDR: &str = "127.0.0.1:9871";

/// Spawn a tiny blocking HTTP server on a background thread. Each Claude Code
/// hook (UserPromptSubmit / Stop / StopFailure) POSTs its raw JSON payload here;
/// we persist it and emit a `prompt-event` to the frontend.
fn start_hook_server(app: tauri::AppHandle) {
  std::thread::spawn(move || {
    let server = match tiny_http::Server::http(HOOK_SERVER_ADDR) {
      Ok(server) => server,
      Err(err) => {
        log::error!("Could not start Claude hook server on {HOOK_SERVER_ADDR}: {err}");
        return;
      }
    };
    log::info!("Claude hook server listening on http://{HOOK_SERVER_ADDR}");

    for mut request in server.incoming_requests() {
      let mut body = String::new();
      if request.as_reader().read_to_string(&mut body).is_ok() {
        match serde_json::from_str::<serde_json::Value>(&body) {
          Ok(payload) => events::handle_payload(&app, payload),
          Err(err) => log::warn!("Ignoring invalid Claude hook payload: {err}"),
        }
      }
      let _ = request.respond(tiny_http::Response::from_string("{\"ok\":true}"));
    }
  });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // Persistent key-value store (frontend uses @tauri-apps/plugin-store). This
    // is the app's persistence layer for browser-side state — see
    // `src/utils/tauriStore.ts`.
    .plugin(tauri_plugin_store::Builder::default().build())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      let conn = events::init_db(app.handle())?;
      app.manage(Db(Mutex::new(conn)));
      start_hook_server(app.handle().clone());
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      events::list_prompt_events,
      events::set_prompt_exercises,
      events::list_exercises,
      events::clear_prompt_events
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
