mod config;
mod error;
mod hooks;
mod library;

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

use tauri::{Emitter, Manager};

static QUITTING: AtomicBool = AtomicBool::new(false);
/// Windows that still have to answer a quit request.
static PENDING: AtomicUsize = AtomicUsize::new(0);

/// A window's answer to `quit-requested`: `true` once its work is saved (or
/// discarded), `false` if the user cancelled. The app quits when every
/// window agreed.
#[tauri::command]
fn quit_response(app: tauri::AppHandle, ok: bool) {
    if !ok {
        PENDING.store(0, Ordering::SeqCst);
        return;
    }
    if PENDING.fetch_sub(1, Ordering::SeqCst) == 1 {
        QUITTING.store(true, Ordering::SeqCst);
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
            let config = config::load(app.handle());
            app.manage(library::AppState { config: std::sync::Mutex::new(config) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            quit_response,
            library::get_library_path,
            library::set_library_path,
            library::fs_read,
            library::fs_write,
            library::fs_list,
            library::fs_exists,
            library::fs_mkdir,
            library::fs_rename,
            library::fs_trash,
            library::fs_abs,
            library::run_hook,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // ⌘Q: every window gets to save (or ask) first and answers with
            // `quit_response`. Closing a single window is handled in JS.
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                let windows = app.webview_windows().len();
                if !QUITTING.load(Ordering::SeqCst) && windows > 0 {
                    api.prevent_exit();
                    // A quit already in progress keeps its count.
                    if PENDING.compare_exchange(0, windows, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
                        let _ = app.emit("quit-requested", ());
                    }
                }
            }
        });
}
