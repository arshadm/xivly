mod config;
mod error;
mod hooks;
mod library;

use std::collections::HashSet;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use tauri::{Emitter, Manager};

static QUITTING: AtomicBool = AtomicBool::new(false);
/// During a quit request: the windows that still have to answer, and when it was asked.
static PENDING: Mutex<Option<(HashSet<String>, Instant)>> = Mutex::new(None);
/// A quit still unanswered after this long is stale (a window that hung, or that
/// never got the request): the next ⌘Q asks again instead of waiting forever. A
/// window showing its "unsaved changes" dialog keeps the quit pending meanwhile.
const STALE_QUIT: Duration = Duration::from_secs(15);

type Pending = Option<(HashSet<String>, Instant)>;

/// Quit once no window is left to answer.
fn quit_if_done(app: &tauri::AppHandle, pending: &mut Pending) {
    if pending.as_ref().is_some_and(|(set, _)| set.is_empty()) {
        *pending = None;
        QUITTING.store(true, Ordering::SeqCst);
        app.exit(0);
    }
}

/// A window's answer to `quit-requested`: `true` once its work is saved (or
/// discarded), `false` if the user cancelled. The app quits when every
/// window agreed; one cancel cancels the whole quit.
#[tauri::command]
fn quit_response(app: tauri::AppHandle, window: tauri::Window, ok: bool) {
    let mut pending = PENDING.lock().unwrap_or_else(|e| e.into_inner());
    if !ok {
        *pending = None;
        return;
    }
    if let Some((set, _)) = pending.as_mut() {
        set.remove(window.label());
    }
    quit_if_done(&app, &mut pending);
}

/// Ask every window to save (or confirm) before quitting; `false` when there
/// is nothing to ask (no window) and the app may exit right away.
fn begin_quit(app: &tauri::AppHandle) -> bool {
    let windows: HashSet<String> = app.webview_windows().into_keys().collect();
    if QUITTING.load(Ordering::SeqCst) || windows.is_empty() {
        return false;
    }
    let mut pending = PENDING.lock().unwrap_or_else(|e| e.into_inner());
    // A quit already in progress keeps waiting for its windows, unless it went stale.
    let stale = pending.as_ref().is_some_and(|(_, at)| at.elapsed() > STALE_QUIT);
    if pending.is_none() || stale {
        *pending = Some((windows, Instant::now()));
        let _ = app.emit("quit-requested", ());
    }
    true
}

/// Ctrl+Q on Windows and Linux (macOS has ⌘Q in the app menu): the same
/// quit as the menu's.
#[tauri::command]
fn request_quit(app: tauri::AppHandle) {
    if !begin_quit(&app) {
        app.exit(0);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            // A broken config.json is reported (the user picks the library again), never
            // silently replaced by a new default library.
            let (config, config_error) = match config::load(app.handle()) {
                Ok(config) => (config, None),
                Err(e) => (config::AppConfig::default(), Some(e.to_string())),
            };
            app.manage(library::AppState {
                config: std::sync::Mutex::new(config),
                config_error: std::sync::Mutex::new(config_error),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            quit_response,
            request_quit,
            library::get_library_path,
            library::pick_library,
            library::fs_read,
            library::fs_write,
            library::fs_list,
            library::fs_exists,
            library::fs_mkdir,
            library::fs_trash,
            library::fs_abs,
            library::run_hook,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            // ⌘Q: every window gets to save (or ask) first and answers with
            // `quit_response`. Closing a single window is handled in JS.
            tauri::RunEvent::ExitRequested { api, .. } => {
                if begin_quit(app) {
                    api.prevent_exit();
                }
            }
            // A window closed mid-quit has nothing left to answer.
            tauri::RunEvent::WindowEvent { label, event: tauri::WindowEvent::Destroyed, .. } => {
                let mut pending = PENDING.lock().unwrap_or_else(|e| e.into_inner());
                if let Some((set, _)) = pending.as_mut() {
                    set.remove(&label);
                }
                quit_if_done(app, &mut pending);
            }
            _ => {}
        });
}
