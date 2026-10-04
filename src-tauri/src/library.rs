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

/// `~/Library/Mobile Documents/com~apple~CloudDocs/Xivly` ("iCloud Drive/Xivly"
/// in Finder) when iCloud Drive is on, else `~/Documents/Xivly`.
fn default_library(home: &Path) -> PathBuf {
    let icloud = home.join("Library/Mobile Documents/com~apple~CloudDocs");
    if icloud.is_dir() { icloud.join("Xivly") } else { home.join("Documents/Xivly") }
}

/// The library folder. First launch: create the default one and remember it,
/// so the app opens straight into a library.
#[tauri::command]
pub fn get_library_path(app: AppHandle, state: State<AppState>) -> Result<PathBuf> {
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
    let path = default_library(&app.path().home_dir()?);
    std::fs::create_dir_all(&path)?;
    cfg.library = Some(path.clone());
    config::save(&app, &cfg)?;
    Ok(path)
}

#[tauri::command]
pub fn set_library_path(app: AppHandle, state: State<AppState>, path: PathBuf) -> Result<()> {
    if !path.is_dir() {
        return Err(format!("{} is not a folder", path.display()).into());
    }
    let mut cfg = state.config.lock().unwrap();
    cfg.library = Some(path);
    config::save(&app, &cfg)
}

/// Raw bytes (an `ArrayBuffer` in JS), or `null`-equivalent error if missing.
#[tauri::command]
pub async fn fs_read(state: State<'_, AppState>, path: String) -> Result<tauri::ipc::Response> {
    let p = resolve(&root(&state)?, &path)?;
    match std::fs::read(&p) {
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
    let p = resolve(&root(&state)?, &rel)?;
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = p.with_file_name(format!(
        ".{}.xivly-tmp",
        p.file_name().unwrap_or_default().to_string_lossy()
    ));
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, &p)?;
    Ok(())
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
    let Ok(entries) = std::fs::read_dir(p) else {
        return Ok(vec![]);
    };
    Ok(entries
        .flatten()
        .map(|e| Entry {
            name: e.file_name().to_string_lossy().into_owned(),
            dir: e.file_type().map(|t| t.is_dir()).unwrap_or(false),
        })
        .collect())
}

#[tauri::command]
pub async fn fs_exists(state: State<'_, AppState>, path: String) -> Result<bool> {
    Ok(resolve(&root(&state)?, &path)?.exists())
}

#[tauri::command]
pub async fn fs_mkdir(state: State<'_, AppState>, path: String) -> Result<()> {
    std::fs::create_dir_all(resolve(&root(&state)?, &path)?)?;
    Ok(())
}

#[tauri::command]
pub async fn fs_rename(state: State<'_, AppState>, from: String, to: String) -> Result<()> {
    let r = root(&state)?;
    let (from, to) = (resolve_entry(&r, &from)?, resolve_entry(&r, &to)?);
    if to.exists() {
        return Err(format!("{} already exists", to.display()).into());
    }
    std::fs::rename(from, to)?;
    Ok(())
}

/// Moves to the macOS Trash (recoverable). Uses NSFileManager rather than
/// scripting Finder, which a hardened-runtime app may not do.
#[tauri::command]
pub async fn fs_trash(state: State<'_, AppState>, path: String) -> Result<()> {
    let p = resolve_entry(&root(&state)?, &path)?;
    let mut ctx = trash::TrashContext::default();
    #[cfg(target_os = "macos")]
    {
        use trash::macos::{DeleteMethod, TrashContextExtMacos};
        ctx.set_delete_method(DeleteMethod::NsFileManager);
    }
    ctx.delete(p)?;
    Ok(())
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
    fn default_library_prefers_icloud() {
        let home = std::env::temp_dir().join(format!("xivly-home-{}", std::process::id()));
        std::fs::create_dir_all(&home).unwrap();
        assert_eq!(default_library(&home), home.join("Documents/Xivly"));
        std::fs::create_dir_all(home.join("Library/Mobile Documents/com~apple~CloudDocs")).unwrap();
        assert_eq!(default_library(&home), home.join("Library/Mobile Documents/com~apple~CloudDocs/Xivly"));
        std::fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn decodes_paths() {
        assert_eq!(percent_decode("papers/%C3%A9t%C3%A9/paper.json"), "papers/été/paper.json");
        assert_eq!(percent_decode("a%2"), "a%2");
    }
}
