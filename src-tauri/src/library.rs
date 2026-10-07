//! Filesystem primitives over the library folder.
//!
//! All library logic (layout, paper.json merging, slugs...) lives in
//! TypeScript (`src/lib/repo.ts`, `src/lib/library.svelte.ts`,
//! `src/lib/library-utils.ts`) so the desktop app and the static web build
//! share it. The web build implements the same primitives with the
//! File System Access API (`src/lib/platform/web.ts`).
//!
//! Every path is relative to the library root and checked so it can't
//! escape it, symlinks included. Every command also names the library root
//! its window opened: a window left open across a library change can't touch
//! the new one. Commands are `async` so file IO (PDFs are MBs) never blocks
//! the main thread.

use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, State};

use crate::config::{self, AppConfig};
use crate::error::Result;
use crate::hooks;

pub struct AppState {
    pub config: std::sync::Mutex<AppConfig>,
    /// Why config.json couldn't be read at launch, until a library is picked again.
    pub config_error: std::sync::Mutex<Option<String>>,
}

/// The library root, if it is still `expected`, the one the calling window
/// opened. After a library change, a window still open (it should have
/// closed) must never read or write a same-named file of the new library.
fn root(state: &State<AppState>, expected: &Path) -> Result<PathBuf> {
    same_root(state.config.lock().unwrap().library.as_deref(), expected)
}

fn same_root(current: Option<&Path>, expected: &Path) -> Result<PathBuf> {
    match current {
        Some(current) if current == expected => Ok(current.to_path_buf()),
        Some(_) => Err("The library folder was changed: this window can't use the new one (reopen the paper)".into()),
        None => Err("No library selected".into()),
    }
}

/// Join a relative path onto the root, rejecting `..`, absolute paths, etc.
/// (`.` segments are dropped). Purely textual: see `resolve` for symlinks.
fn join(root: &Path, rel: &str) -> Result<PathBuf> {
    let rel = Path::new(rel);
    if !rel.components().all(|c| matches!(c, Component::Normal(_) | Component::CurDir)) {
        return Err(format!("Invalid path: {}", rel.display()).into());
    }
    Ok(root.join(rel.components().filter(|c| matches!(c, Component::Normal(_))).collect::<PathBuf>()))
}

/// `join`, and the path must really be inside the library: a symlink in it
/// (a folder linked from elsewhere, or planted by a sync client or a script)
/// must not lead reads and writes out of it. What exists of the path is
/// resolved (symlinks, and on Windows 8.3 short names) and must stay under the
/// resolved root; the rest doesn't exist yet, so it can't be a link.
fn resolve(root: &Path, rel: &str) -> Result<PathBuf> {
    let p = join(root, rel)?;
    if !real_path(&p)?.starts_with(root.canonicalize()?) {
        return Err(format!("Refusing a path that leads out of the library ({rel:?})").into());
    }
    Ok(p)
}

/// `p` with its existing part resolved (symlinks followed), the rest appended
/// as is. A dangling symlink is an error (writing through it would create its
/// target, wherever it points).
fn real_path(p: &Path) -> Result<PathBuf> {
    let mut existing = p;
    let mut rest = Vec::new();
    loop {
        match existing.symlink_metadata() {
            Ok(_) => break,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                let (Some(name), Some(parent)) = (existing.file_name(), existing.parent()) else {
                    return Err(e.into());
                };
                rest.push(name);
                existing = parent;
            }
            Err(e) => return Err(e.into()),
        }
    }
    let mut real = existing.canonicalize()?;
    real.extend(rest.iter().rev());
    Ok(real)
}

/// Like `resolve`, but never the library root itself (for destructive ops).
fn resolve_entry(root: &Path, rel: &str) -> Result<PathBuf> {
    let p = resolve(root, rel)?;
    if p == root || p.parent().is_none() {
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
    if let Some(err) = state.config_error.lock().unwrap().as_ref() {
        return Err(format!("Couldn't read Xivly's settings ({err}): choose your library folder again").into());
    }
    let path = default_library(&app.path().home_dir()?, &app.path().document_dir()?);
    std::fs::create_dir_all(&path)?;
    cfg.library = Some(path.clone());
    config::save(app, &cfg)?;
    Ok(path)
}

/// A library change in progress: like a quit, every window saves its work (or
/// the user cancels) before the library changes under it. The windows that
/// still have to answer, the folder picked, and when it was asked.
struct Change {
    windows: HashSet<String>,
    library: PathBuf,
    at: Instant,
}

static CHANGE: Mutex<Option<Change>> = Mutex::new(None);
/// A change still unanswered after this long is stale (a window that hung):
/// choosing a folder again starts over instead of waiting forever.
const STALE_CHANGE: Duration = Duration::from_secs(15);

/// Ask for a new library folder (the native picker, here rather than in JS:
/// the library root is what every fs command trusts, so only the user sets
/// it). The change itself waits for every window: `library-change-requested`,
/// answered by `library_change_response`, then `library-change-finished`
/// (`true` once changed: the library window reopens it, readers close).
#[tauri::command]
pub async fn change_library(app: AppHandle) -> Result<()> {
    use tauri_plugin_dialog::DialogExt;
    let picked = app.dialog().file().set_title("Choose a folder for your Xivly library").blocking_pick_folder();
    let Some(library) = picked.and_then(|p| p.into_path().ok()) else {
        return Ok(());
    };
    let windows: HashSet<String> = app.webview_windows().into_keys().collect();
    let mut change = CHANGE.lock().unwrap_or_else(|e| e.into_inner());
    if change.as_ref().is_some_and(|c| c.at.elapsed() < STALE_CHANGE) {
        return Err("The library folder is already being changed".into());
    }
    *change = Some(Change { windows, library, at: Instant::now() });
    app.emit("library-change-requested", ())?;
    finish_change_if_done(&app, &mut change)
}

/// A window's answer to `library-change-requested`: `true` once its work is
/// saved (or discarded), `false` if the user cancelled, which cancels the change.
#[tauri::command]
pub fn library_change_response(app: AppHandle, window: tauri::Window, ok: bool) -> Result<()> {
    let mut change = CHANGE.lock().unwrap_or_else(|e| e.into_inner());
    if !ok {
        if change.take().is_some() {
            app.emit("library-change-finished", false)?;
        }
        return Ok(());
    }
    if let Some(c) = change.as_mut() {
        c.windows.remove(window.label());
    }
    finish_change_if_done(&app, &mut change)
}

/// A window closed during a change has nothing left to answer.
pub fn window_gone(app: &AppHandle, label: &str) {
    let mut change = CHANGE.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(c) = change.as_mut() {
        c.windows.remove(label);
    }
    let _ = finish_change_if_done(app, &mut change);
}

/// Every window answered: switch the library (from now on, only windows that
/// open the new one can use it) and tell them.
fn finish_change_if_done(app: &AppHandle, change: &mut Option<Change>) -> Result<()> {
    if !change.as_ref().is_some_and(|c| c.windows.is_empty()) {
        return Ok(());
    }
    let Some(Change { library, .. }) = change.take() else { return Ok(()) };
    let state = app.state::<AppState>();
    let mut cfg = state.config.lock().unwrap();
    cfg.library = Some(library);
    config::save(app, &cfg)?;
    *state.config_error.lock().unwrap() = None;
    app.emit("library-change-finished", true)?;
    Ok(())
}

/// Hook scripts run with the user's rights, so the app itself never writes
/// one (only the `.sample`): enabling a hook is the user's own act.
fn refuse_hook(root: &Path, rel: &str) -> Result<()> {
    refuse_hook_name(rel)?;
    // The same folder under another name: a symlink, another case, a Windows
    // 8.3 short name (`XIVLY~1`): compared once resolved, when it exists.
    let Ok(hooks) = root.join(".xivly/hooks").canonicalize() else {
        return Ok(());
    };
    let target = real_path(&join(root, rel)?)?;
    let sample = target.parent() == Some(hooks.as_path())
        && target.file_name().is_some_and(|n| n.to_string_lossy().to_lowercase().ends_with(".sample"));
    if target.starts_with(&hooks) && !sample {
        return Err(format!("Refusing to write a hook script ({rel})").into());
    }
    Ok(())
}

fn refuse_hook_name(rel: &str) -> Result<()> {
    // Names Windows reads as another one: trailing dots and spaces are dropped
    // (`paper-added.ps1.`), `~` makes 8.3 short names, `:` alternate streams.
    // The app never writes such names.
    if Path::new(rel).components().any(|c| {
        let name = c.as_os_str().to_string_lossy();
        matches!(c, Component::Normal(_)) && (name.ends_with('.') || name.ends_with(' ') || name.contains('~') || name.contains(':'))
    }) {
        return Err(format!("Refusing an ambiguous file name ({rel})").into());
    }
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
pub async fn fs_read(state: State<'_, AppState>, root_dir: PathBuf, path: String) -> Result<tauri::ipc::Response> {
    let p = resolve(&root(&state, &root_dir)?, &path)?;
    match blocking(move || Ok(std::fs::read(&p))).await? {
        Ok(bytes) => Ok(tauri::ipc::Response::new(bytes)),
        // The frontend maps this prefix to "missing" (vs. a real IO error).
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Err(format!("ENOENT: {path}").into()),
        Err(e) => Err(e.into()),
    }
}

/// Body = raw bytes, `x-path` header = relative path, `x-root` = the
/// window's library root. Written via a temp file + rename so sync clients
/// never see a half-written file.
#[tauri::command]
pub async fn fs_write(state: State<'_, AppState>, request: tauri::ipc::Request<'_>) -> Result<()> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected raw bytes".into());
    };
    let header = |name: &str| {
        request
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(percent_decode)
            .ok_or_else(|| format!("Missing {name} header"))
    };
    let (root_dir, rel) = (PathBuf::from(header("x-root")?), header("x-path")?);
    let root = root(&state, &root_dir)?;
    let bytes = bytes.clone();
    blocking(move || write_file(&root, &rel, &bytes)).await
}

fn write_file(root: &Path, rel: &str, bytes: &[u8]) -> Result<()> {
    refuse_hook(root, rel)?;
    write_atomic(&resolve_entry(root, rel)?, bytes)
}

/// Write via a temp file + rename, so sync clients never see a half-written file.
pub(crate) fn write_atomic(p: &Path, bytes: &[u8]) -> Result<()> {
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
            // Access denied, sharing or lock violation (ERROR_ACCESS_DENIED / _SHARING_ / _LOCK_VIOLATION).
            Err(e) if cfg!(windows) && tries < 5 && matches!(e.raw_os_error(), Some(5 | 32 | 33)) => {
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
pub async fn fs_list(state: State<'_, AppState>, root_dir: PathBuf, path: String) -> Result<Vec<Entry>> {
    let root = root(&state, &root_dir)?;
    blocking(move || list_dir(&root, &path)).await
}

fn list_dir(root: &Path, rel: &str) -> Result<Vec<Entry>> {
    let entries = match std::fs::read_dir(resolve(root, rel)?) {
        Ok(entries) => entries,
        // A folder not created yet is empty; other errors (permissions) are real.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e.into()),
    };
    Ok(entries
        .flatten()
        .map(|e| Entry {
            name: e.file_name().to_string_lossy().into_owned(),
            // Follows symlinks: a linked folder lists as a folder (reading it
            // is refused if it leads out of the library).
            dir: std::fs::metadata(e.path()).map(|m| m.is_dir()).unwrap_or(false),
        })
        .collect())
}

#[tauri::command]
pub async fn fs_exists(state: State<'_, AppState>, root_dir: PathBuf, path: String) -> Result<bool> {
    let p = resolve(&root(&state, &root_dir)?, &path)?;
    blocking(move || Ok(p.try_exists()?)).await
}

#[tauri::command]
pub async fn fs_mkdir(state: State<'_, AppState>, root_dir: PathBuf, path: String) -> Result<()> {
    let p = resolve_entry(&root(&state, &root_dir)?, &path)?;
    blocking(move || Ok(std::fs::create_dir_all(p)?)).await
}

/// Moves to the macOS Trash (recoverable). Uses NSFileManager rather than
/// scripting Finder, which a hardened-runtime app may not do.
#[tauri::command]
pub async fn fs_trash(state: State<'_, AppState>, root_dir: PathBuf, path: String) -> Result<()> {
    let p = resolve_entry(&root(&state, &root_dir)?, &path)?;
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
pub async fn fs_abs(state: State<'_, AppState>, root_dir: PathBuf, path: String) -> Result<PathBuf> {
    resolve(&root(&state, &root_dir)?, &path)
}

/// `paper-removed` waits for its hooks (they need the folder, which is
/// trashed right after); other events run in the background.
#[tauri::command]
pub async fn run_hook(app: AppHandle, state: State<'_, AppState>, root_dir: PathBuf, event: String, paper_id: String) -> Result<()> {
    // Only the events Xivly fires (an empty name would match every dotfile in hooks/).
    if !hooks::EVENTS.contains(&event.as_str()) {
        return Err(format!("Unknown hook event: {event:?}").into());
    }
    let r = root(&state, &root_dir)?;
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

    /// A fresh folder, removed when dropped.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new(name: &str) -> Self {
            static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let n = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let dir = std::env::temp_dir().join(format!("xivly-test-{name}-{}-{n}", std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            TempDir(dir)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    /// A library (with `.xivly/hooks` and a paper) and a folder outside it.
    fn library() -> (TempDir, PathBuf, PathBuf) {
        let tmp = TempDir::new("lib");
        let (root, outside) = (tmp.0.join("library"), tmp.0.join("outside"));
        std::fs::create_dir_all(root.join(".xivly/hooks")).unwrap();
        std::fs::create_dir_all(root.join("papers/a")).unwrap();
        std::fs::write(root.join("papers/a/paper.json"), "{}").unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("secret.txt"), "secret").unwrap();
        (tmp, root, outside)
    }

    #[cfg(unix)]
    fn symlink(target: &Path, link: &Path) {
        std::os::unix::fs::symlink(target, link).unwrap();
    }

    #[test]
    fn rejects_traversal() {
        let root = Path::new("/lib");
        assert!(join(root, "../etc").is_err());
        assert!(join(root, "papers/../../x").is_err());
        assert!(join(root, "/etc/passwd").is_err());
        assert_eq!(join(root, "papers/a/paper.pdf").unwrap(), Path::new("/lib/papers/a/paper.pdf"));
        assert_eq!(join(root, "./papers/./a").unwrap(), Path::new("/lib/papers/a"));
        let (_tmp, root, _) = library();
        assert!(resolve(&root, "../outside/secret.txt").is_err());
        assert!(resolve_entry(&root, "").is_err());
        assert!(resolve_entry(&root, ".").is_err());
        assert!(resolve_entry(&root, "./").is_err());
        assert!(resolve_entry(&root, "papers/a").is_ok());
        // Not there yet (a write creates it, inside).
        assert_eq!(resolve(&root, "papers/new/paper.pdf").unwrap(), root.join("papers/new/paper.pdf"));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinks_out_of_the_library() {
        let (_tmp, root, outside) = library();
        symlink(&outside, &root.join("papers/linked"));
        symlink(&outside.join("secret.txt"), &root.join("papers/a/paper.pdf"));
        symlink(&outside.join("missing.pdf"), &root.join("papers/a/dangling.pdf"));
        for rel in ["papers/linked", "papers/linked/secret.txt", "papers/linked/new/paper.pdf", "papers/a/paper.pdf", "papers/a/dangling.pdf"] {
            assert!(resolve(&root, rel).is_err(), "{rel}");
        }
        assert!(write_file(&root, "papers/linked/paper.pdf", b"x").is_err());
        assert!(write_file(&root, "papers/a/dangling.pdf", b"x").is_err());
        assert!(!outside.join("missing.pdf").exists() && !outside.join("paper.pdf").exists());
        assert!(list_dir(&root, "papers/linked").is_err());
        assert!(resolve_entry(&root, "papers/linked/secret.txt").is_err());
        // A link that stays inside is fine, and so is a library folder that is itself a link.
        symlink(&root.join("papers/a"), &root.join("papers/alias"));
        assert!(resolve(&root, "papers/alias/paper.json").is_ok());
        let link = root.parent().unwrap().join("library-link");
        symlink(&root, &link);
        assert!(write_file(&link, "papers/a/paper.json", b"{}").is_ok());
    }

    #[test]
    fn refuses_hook_scripts() {
        let (_tmp, root, _) = library();
        for rel in [
            ".xivly/hooks/paper-added",
            ".xivly/hooks/paper-added.sh",
            ".XIVLY/Hooks/paper-added",
            "./.xivly/./hooks/paper-added",
            ".xivly/hooks/sub/x.sample",
            ".xivly/hooks",
            // What Windows would read as `.xivly/hooks/paper-added.ps1` (or a stream of it).
            ".xivly/hooks/paper-added.ps1.",
            ".xivly/hooks/paper-added.ps1 ",
            ".xivly/hooks./paper-added.ps1",
            ".xivly/hooks/paper-added.ps1:x.sample",
            "XIVLY~1/hooks/paper-added.ps1",
        ] {
            assert!(refuse_hook(&root, rel).is_err(), "{rel}");
        }
        for rel in [".xivly/hooks/paper-added.sample", ".xivly/library.json", "papers/hooks/x", "papers/a/paper.pdf"] {
            assert!(refuse_hook(&root, rel).is_ok(), "{rel}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn refuses_hook_scripts_through_a_link() {
        let (_tmp, root, _) = library();
        symlink(&root.join(".xivly/hooks"), &root.join("papers/h"));
        assert!(write_file(&root, "papers/h/paper-added", b"rm -rf ~").is_err());
        symlink(&root.join(".xivly/hooks/paper-added"), &root.join(".xivly/hooks/x.sample"));
        assert!(write_file(&root, ".xivly/hooks/x.sample", b"rm -rf ~").is_err());
        assert!(!root.join(".xivly/hooks/paper-added").exists());
    }

    #[test]
    fn writes_atomically() {
        let (_tmp, root, _) = library();
        write_file(&root, "papers/b/paper.pdf", b"one").unwrap();
        write_file(&root, "papers/b/paper.pdf", b"two").unwrap();
        assert_eq!(std::fs::read(root.join("papers/b/paper.pdf")).unwrap(), b"two");
        // No temp file left behind.
        let names: Vec<_> = list_dir(&root, "papers/b").unwrap().into_iter().map(|e| e.name).collect();
        assert_eq!(names, ["paper.pdf"]);
        assert!(write_file(&root, "", b"x").is_err());
        assert!(write_file(&root, "../escape", b"x").is_err());
        assert!(!root.parent().unwrap().join("escape").exists());
    }

    #[test]
    fn lists_folders() {
        let (_tmp, root, _) = library();
        let mut entries: Vec<_> = list_dir(&root, "papers").unwrap().into_iter().map(|e| (e.name, e.dir)).collect();
        entries.sort();
        assert_eq!(entries, [("a".to_string(), true)]);
        assert!(list_dir(&root, "papers/missing").unwrap().is_empty());
        assert!(list_dir(&root, "..").is_err());
    }

    #[test]
    fn only_the_window_s_own_library() {
        let (a, b) = (Path::new("/libraries/a"), Path::new("/libraries/b"));
        assert_eq!(same_root(Some(a), a).unwrap(), a);
        assert!(same_root(Some(b), a).is_err());
        assert!(same_root(None, a).is_err());
    }

    #[test]
    fn default_library_prefers_icloud() {
        let home = TempDir::new("home");
        let home = &home.0;
        let docs = home.join("Documents");
        assert_eq!(default_library(home, &docs), docs.join("Xivly"));
        std::fs::create_dir_all(home.join("Library/Mobile Documents/com~apple~CloudDocs")).unwrap();
        let expected = if cfg!(target_os = "macos") { home.join("Library/Mobile Documents/com~apple~CloudDocs/Xivly") } else { docs.join("Xivly") };
        assert_eq!(default_library(home, &docs), expected);
    }

    #[test]
    fn decodes_paths() {
        assert_eq!(percent_decode("papers/%C3%A9t%C3%A9/paper.json"), "papers/été/paper.json");
        assert_eq!(percent_decode("a%2"), "a%2");
    }
}
