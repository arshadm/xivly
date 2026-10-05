//! Filesystem primitives over the library folder.
//!
//! All library logic (layout, paper.json merging, slugs...) lives in
//! TypeScript (`src/lib/library/`) so the desktop app and the static web
//! build share it. The web build implements the same primitives with the
//! File System Access API (`src/lib/platform/web.ts`).
//!
//! Every path is relative to the library root and checked so it can't
//! escape it. Commands are `async` so file IO (PDFs are MBs) never blocks
//! the main thread.

use std::path::{Component, Path, PathBuf};

use tauri::{AppHandle, Manager, State};

use crate::config::{self, AppConfig};
use crate::error::Result;
use crate::hooks;

pub struct AppState {
    pub config: std::sync::Mutex<AppConfig>,
}

fn root(state: &State<AppState>) -> Result<PathBuf> {
    state
        .config
        .lock()
        .unwrap()
        .library
        .clone()
        .ok_or_else(|| "No library selected".into())
}

/// Join a relative path onto the root, rejecting `..`, absolute paths, etc.
fn resolve(root: &Path, rel: &str) -> Result<PathBuf> {
    let rel = Path::new(rel);
    if !rel.components().all(|c| matches!(c, Component::Normal(_) | Component::CurDir)) {
        return Err(format!("Invalid path: {}", rel.display()).into());
    }
    Ok(root.join(rel))
}

/// Like `resolve`, but never the library root itself (for destructive ops).
fn resolve_entry(root: &Path, rel: &str) -> Result<PathBuf> {
    let p = resolve(root, rel)?;
    if p == root || p.parent().is_none() || Path::new(rel).components().all(|c| c == Component::CurDir) {
        return Err(format!("Refusing to modify the library root ({rel:?})").into());
    }
    Ok(p)
}

/// macOS: `~/Library/Mobile Documents/com~apple~CloudDocs/Xivly` ("iCloud
/// Drive/Xivly" in Finder) when iCloud Drive is on. Everywhere else: `Xivly`
/// in the user's Documents folder (OneDrive-redirected or localized included).
fn default_library(home: &Path, documents: &Path) -> PathBuf {
    let icloud = home.join("Library/Mobile Documents/com~apple~CloudDocs");
    if cfg!(target_os = "macos") && icloud.is_dir() { icloud.join("Xivly") } else { documents.join("Xivly") }
}

/// Run blocking file IO off the async runtime's workers.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T> + Send + 'static) -> Result<T> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

/// The library folder. First launch: create the default one and remember it,
/// so the app opens straight into a library.
#[tauri::command]
pub async fn get_library_path(app: AppHandle) -> Result<PathBuf> {
    blocking(move || library_path(&app)).await
}

fn library_path(app: &AppHandle) -> Result<PathBuf> {
    let state = app.state::<AppState>();
    let mut cfg = state.config.lock().unwrap();
    // Dev/testing override (`bun run tauri:demo`), never persisted.
    if let Some(path) = std::env::var_os("XIVLY_LIBRARY").filter(|p| !p.is_empty()) {
        let path = PathBuf::from(path);
        std::fs::create_dir_all(&path)?;
        // The fs commands resolve against the in-memory config.
        cfg.library = Some(path.clone());
        return Ok(path);
    }
    if let Some(path) = &cfg.library {
        // Don't silently recreate a library that was moved or is on an
        // unplugged drive: let the user pick it again.
        if !path.is_dir() {
            return Err(format!("Library folder not found: {}", path.display()).into());
        }
        return Ok(path.clone());
    }
    let path = default_library(&app.path().home_dir()?, &app.path().document_dir()?);
    std::fs::create_dir_all(&path)?;
    cfg.library = Some(path.clone());
    config::save(app, &cfg)?;
    Ok(path)
}

/// Ask for a library folder (the native picker, here rather than in JS: the
/// library root is what every fs command trusts, so only the user sets it).
#[tauri::command]
pub async fn pick_library(app: AppHandle, state: State<'_, AppState>) -> Result<Option<PathBuf>> {
    use tauri_plugin_dialog::DialogExt;
    let picked = app.dialog().file().set_title("Choose a folder for your Xivly library").blocking_pick_folder();
    let Some(path) = picked.and_then(|p| p.into_path().ok()) else {
        return Ok(None);
    };
    let mut cfg = state.config.lock().unwrap();
    cfg.library = Some(path.clone());
    config::save(&app, &cfg)?;
    Ok(Some(path))
}

/// Hook scripts run with the user's rights, so the app itself never writes
/// one (only the `.sample`): enabling a hook is the user's own act.
fn refuse_hook(rel: &str) -> Result<()> {
    // Compared without `.` segments and case-insensitively: macOS and
    // Windows file systems would treat `.XIVLY/Hooks` as the same folder.
    let parts: Vec<String> = Path::new(rel)
        .components()
        .filter(|c| !matches!(c, Component::CurDir))
        .map(|c| c.as_os_str().to_string_lossy().to_lowercase())
        .collect();
    let in_hooks = parts.len() >= 3 && parts[0] == ".xivly" && parts[1] == "hooks";
    if in_hooks && !(parts.len() == 3 && parts[2].ends_with(".sample")) {
        return Err(format!("Refusing to write a hook script ({rel})").into());
    }
    Ok(())
}

/// Raw bytes (an `ArrayBuffer` in JS), or `null`-equivalent error if missing.
#[tauri::command]
pub async fn fs_read(state: State<'_, AppState>, path: String) -> Result<tauri::ipc::Response> {
    let p = resolve(&root(&state)?, &path)?;
    match blocking(move || Ok(std::fs::read(&p))).await? {
        Ok(bytes) => Ok(tauri::ipc::Response::new(bytes)),
        // The frontend maps this prefix to "missing" (vs. a real IO error).
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Err(format!("ENOENT: {path}").into()),
        Err(e) => Err(e.into()),
    }
}

/// Body = raw bytes, `x-path` header = relative path. Written via a temp file
/// + rename so sync clients never see a half-written file.
#[tauri::command]
pub async fn fs_write(state: State<'_, AppState>, request: tauri::ipc::Request<'_>) -> Result<()> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected raw bytes".into());
    };
    let rel = request
        .headers()
        .get("x-path")
        .and_then(|v| v.to_str().ok())
        .ok_or("Missing x-path header")?;
    let rel = percent_decode(rel);
    refuse_hook(&rel)?;
    let p = resolve_entry(&root(&state)?, &rel)?;
    let bytes = bytes.clone();
    blocking(move || write_atomic(&p, &bytes)).await
}

/// Write via a temp file + rename, so sync clients never see a half-written file.
fn write_atomic(p: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir)?;
    }
    // Unique per write, so concurrent writes of one file never share a temp file.
    static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let tmp = p.with_file_name(format!(
        ".{}.{}-{}.xivly-tmp",
        p.file_name().unwrap_or_default().to_string_lossy(),
        std::process::id(),
        SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    std::fs::write(&tmp, bytes)?;
    // Windows: a sync client or antivirus briefly holding the file makes the
    // rename fail; try again a few times before giving up.
    let mut tries = 0;
    loop {
        match std::fs::rename(&tmp, p) {
            Ok(()) => return Ok(()),
            Err(e) if cfg!(windows) && tries < 5 && e.kind() == std::io::ErrorKind::PermissionDenied => {
                tries += 1;
                std::thread::sleep(std::time::Duration::from_millis(50 * tries));
            }
            Err(e) => {
                let _ = std::fs::remove_file(&tmp);
                return Err(e.into());
            }
        }
    }
}

/// Headers are ASCII-only, so the frontend percent-encodes the path.
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
            if let Ok(b) = u8::from_str_radix(hex, 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[derive(serde::Serialize)]
pub struct Entry {
    name: String,
    dir: bool,
}

#[tauri::command]
pub async fn fs_list(state: State<'_, AppState>, path: String) -> Result<Vec<Entry>> {
    let p = resolve(&root(&state)?, &path)?;
    blocking(move || {
        let entries = match std::fs::read_dir(p) {
            Ok(entries) => entries,
            // A folder not created yet is empty; other errors (permissions) are real.
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
            Err(e) => return Err(e.into()),
        };
        Ok(entries
            .flatten()
            .map(|e| Entry {
                name: e.file_name().to_string_lossy().into_owned(),
                dir: e.file_type().map(|t| t.is_dir()).unwrap_or(false),
            })
            .collect())
    })
    .await
}

#[tauri::command]
pub async fn fs_exists(state: State<'_, AppState>, path: String) -> Result<bool> {
    Ok(resolve(&root(&state)?, &path)?.exists())
}

#[tauri::command]
pub async fn fs_mkdir(state: State<'_, AppState>, path: String) -> Result<()> {
    let p = resolve_entry(&root(&state)?, &path)?;
    blocking(move || Ok(std::fs::create_dir_all(p)?)).await
}

/// Moves to the macOS Trash (recoverable). Uses NSFileManager rather than
/// scripting Finder, which a hardened-runtime app may not do.
#[tauri::command]
pub async fn fs_trash(state: State<'_, AppState>, path: String) -> Result<()> {
    let p = resolve_entry(&root(&state)?, &path)?;
    blocking(move || {
        #[cfg(target_os = "macos")]
        let ctx = {
            use trash::macos::{DeleteMethod, TrashContextExtMacos};
            let mut ctx = trash::TrashContext::default();
            ctx.set_delete_method(DeleteMethod::NsFileManager);
            ctx
        };
        #[cfg(not(target_os = "macos"))]
        let ctx = trash::TrashContext::default();
        ctx.delete(p)?;
        Ok(())
    })
    .await
}

/// Absolute path, for "Show in Finder".
#[tauri::command]
pub async fn fs_abs(state: State<'_, AppState>, path: String) -> Result<PathBuf> {
    resolve(&root(&state)?, &path)
}

/// `paper-removed` waits for its hooks (they need the folder, which is
/// trashed right after); other events run in the background.
#[tauri::command]
pub async fn run_hook(app: AppHandle, state: State<'_, AppState>, event: String, paper_id: String) -> Result<()> {
    let r = root(&state)?;
    let dir = resolve_entry(&r, &format!("papers/{paper_id}"))?;
    if event == "paper-removed" {
        tauri::async_runtime::spawn_blocking(move || hooks::run_blocking(&app, &r, &event, &paper_id, &dir))
            .await
            .map_err(|e| e.to_string())?;
    } else {
        hooks::run(&app, &r, &event, &paper_id, &dir);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal() {
        let root = Path::new("/lib");
        assert!(resolve(root, "../etc").is_err());
        assert!(resolve(root, "papers/../../x").is_err());
        assert!(resolve(root, "/etc/passwd").is_err());
        assert_eq!(resolve(root, "papers/a/paper.pdf").unwrap(), Path::new("/lib/papers/a/paper.pdf"));
        assert!(resolve_entry(root, "").is_err());
        assert!(resolve_entry(root, ".").is_err());
        assert!(resolve_entry(root, "./").is_err());
        assert!(resolve_entry(root, "papers/a").is_ok());
    }

    #[test]
    fn refuses_hook_scripts() {
        assert!(refuse_hook(".xivly/hooks/paper-added").is_err());
        assert!(refuse_hook(".xivly/hooks/paper-added.sh").is_err());
        assert!(refuse_hook(".xivly/hooks/paper-added.sample").is_ok());
        assert!(refuse_hook(".xivly/library.json").is_ok());
        assert!(refuse_hook("papers/hooks/x").is_ok());
        assert!(refuse_hook(".XIVLY/Hooks/paper-added").is_err());
        assert!(refuse_hook("./.xivly/./hooks/paper-added").is_err());
        assert!(refuse_hook(".xivly/hooks/sub/x.sample").is_err());
    }

    #[test]
    fn default_library_prefers_icloud() {
        let home = std::env::temp_dir().join(format!("xivly-home-{}", std::process::id()));
        std::fs::create_dir_all(&home).unwrap();
        let docs = home.join("Documents");
        assert_eq!(default_library(&home, &docs), docs.join("Xivly"));
        std::fs::create_dir_all(home.join("Library/Mobile Documents/com~apple~CloudDocs")).unwrap();
        let expected = if cfg!(target_os = "macos") { home.join("Library/Mobile Documents/com~apple~CloudDocs/Xivly") } else { docs.join("Xivly") };
        assert_eq!(default_library(&home, &docs), expected);
        std::fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn decodes_paths() {
        assert_eq!(percent_decode("papers/%C3%A9t%C3%A9/paper.json"), "papers/été/paper.json");
        assert_eq!(percent_decode("a%2"), "a%2");
    }
}
