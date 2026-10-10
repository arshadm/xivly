//! Watches the library folder for changes made outside this app (a sync client
//! such as Google Drive bringing another device's edits, Finder, an agent) and
//! tells every window which files changed (`library-changed`, paths relative
//! to the library, `/`-separated). Changes are gathered for a moment first: a
//! sync brings many files at once, and each window reloads once for them.
use std::collections::BTreeSet;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::time::{Duration, Instant};

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, State};

use crate::error::Result;
use crate::library::{self, AppState};

const GATHER: Duration = Duration::from_millis(300);

/// The library being watched, and its watcher (dropping it stops the watch).
#[derive(Default)]
pub struct WatchState(Mutex<Option<(PathBuf, RecommendedWatcher)>>);

/// Watch the window's library (every window asks; the library is watched once).
#[tauri::command]
pub fn library_watch(
    app: AppHandle,
    state: State<'_, AppState>,
    watch: State<'_, WatchState>,
    root_dir: PathBuf,
) -> Result<()> {
    let root = library::root(&state, &root_dir)?;
    let mut current = watch.0.lock().unwrap_or_else(|e| e.into_inner());
    if current.as_ref().is_some_and(|(r, _)| *r == root) {
        return Ok(());
    }
    // Another library: the old watch stops (its thread ends with its channel).
    *current = None;
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher = notify::recommended_watcher(tx).map_err(|e| e.to_string())?;
    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    // Events may name the folder by its real path (symlinks resolved).
    let roots: Vec<PathBuf> = std::iter::once(root.clone())
        .chain(root.canonicalize().ok())
        .collect();
    std::thread::spawn(move || {
        gather(&rx, GATHER, |events| {
            let paths: BTreeSet<String> = events
                .iter()
                .flat_map(|e| &e.paths)
                .filter_map(|p| relative(&roots, p))
                .collect();
            if !paths.is_empty() {
                let _ = app.emit("library-changed", paths);
            }
        })
    });
    *current = Some((root, watcher));
    Ok(())
}

/// Hand on events in batches: each batch is what came within `quiet` of the
/// one before. Returns once the watcher is gone.
fn gather(
    rx: &Receiver<notify::Result<notify::Event>>,
    quiet: Duration,
    mut emit: impl FnMut(Vec<notify::Event>),
) {
    while let Ok(first) = rx.recv() {
        let mut batch: Vec<notify::Event> = first.into_iter().collect();
        let mut until = Instant::now() + quiet;
        loop {
            match rx.recv_timeout(until.saturating_duration_since(Instant::now())) {
                Ok(event) => {
                    batch.extend(event);
                    until = Instant::now() + quiet;
                }
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => {
                    emit(batch);
                    return;
                }
            }
        }
        emit(batch);
    }
}

/// `path` relative to the library, unless it's of no interest: temp files of
/// an atomic write (ours, or a sync client's), Finder's, the trash.
fn relative(roots: &[PathBuf], path: &Path) -> Option<String> {
    let rel = roots.iter().find_map(|r| path.strip_prefix(r).ok())?;
    let parts: Vec<&str> = rel
        .components()
        .map(|c| {
            if let Component::Normal(s) = c {
                s.to_str()
            } else {
                None
            }
        })
        .collect::<Option<_>>()?;
    let name = *parts.last()?;
    let noise = name.ends_with(".xivly-tmp")
        || name == ".DS_Store"
        || name.starts_with(".tmp")
        || name.starts_with("~$")
        || parts.starts_with(&[".xivly", "trash"]);
    (!noise).then(|| parts.join("/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relative_paths_without_the_noise() {
        let roots = [PathBuf::from("/lib"), PathBuf::from("/private/lib")];
        assert_eq!(
            relative(&roots, Path::new("/lib/papers/a/paper.json")).as_deref(),
            Some("papers/a/paper.json")
        );
        assert_eq!(
            relative(&roots, Path::new("/private/lib/.xivly/devices/mac.json")).as_deref(),
            Some(".xivly/devices/mac.json")
        );
        assert_eq!(
            relative(
                &roots,
                Path::new("/lib/papers/a/.paper.json.12-3.xivly-tmp")
            ),
            None
        );
        assert_eq!(relative(&roots, Path::new("/lib/.DS_Store")), None);
        assert_eq!(relative(&roots, Path::new("/lib/.xivly/trash/x")), None);
        assert_eq!(relative(&roots, Path::new("/elsewhere/x")), None);
        assert_eq!(relative(&roots, Path::new("/lib")), None);
    }

    #[test]
    fn events_close_together_come_as_one_batch() {
        let (tx, rx) = std::sync::mpsc::channel();
        let event =
            |p: &str| Ok(notify::Event::new(notify::EventKind::Any).add_path(PathBuf::from(p)));
        let sender = std::thread::spawn(move || {
            tx.send(event("/lib/a")).unwrap();
            tx.send(event("/lib/b")).unwrap();
            std::thread::sleep(Duration::from_millis(200));
            tx.send(event("/lib/c")).unwrap();
        });
        let mut batches = vec![];
        gather(&rx, Duration::from_millis(60), |b| batches.push(b.len()));
        sender.join().unwrap();
        assert_eq!(batches, vec![2, 1]);
    }
}
