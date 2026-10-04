//! User hooks, git-style: an executable (or `.sh`) file in
//! `<library>/.xivly/hooks/` named after the event, e.g. `paper-added`,
//! `paper-added.sh`, `paper-saved.py`. Files ending in `.sample` are ignored.
//!
//! Hooks run through the user's login shell so `PATH` matches their terminal
//! (GUI apps on macOS otherwise get a bare PATH). They receive:
//! - cwd: the paper folder
//! - stdin: the paper's `paper.json`
//! - env: XIVLY_EVENT, XIVLY_LIBRARY, XIVLY_PAPER_ID, XIVLY_PAPER_DIR,
//!   XIVLY_PAPER_PDF, XIVLY_PAPER_JSON
//!
//! Output is appended to `<library>/.xivly/logs/hooks.log` and a `hook-finished`
//! event is emitted to the frontend.

use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone)]
pub struct HookResult {
    pub event: String,
    pub paper_id: String,
    pub hook: String,
    pub success: bool,
    pub code: Option<i32>,
    pub output: String,
}

fn find_hooks(library: &Path, event: &str) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(library.join(".xivly/hooks")) else {
        return vec![];
    };
    let mut hooks: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file())
        .filter(|p| {
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            !name.ends_with(".sample")
                && (name == event || name.strip_prefix(event).is_some_and(|r| r.starts_with('.')))
        })
        .collect();
    hooks.sort();
    hooks
}

/// Runs every hook for `event` on a background thread.
pub fn run(app: &AppHandle, library: &Path, event: &str, paper_id: &str, paper_dir: &Path) {
    let (app, library, event, paper_id, paper_dir) = (
        app.clone(),
        library.to_path_buf(),
        event.to_string(),
        paper_id.to_string(),
        paper_dir.to_path_buf(),
    );
    std::thread::spawn(move || run_blocking(&app, &library, &event, &paper_id, &paper_dir));
}

/// Runs every hook for `event` and waits for them (e.g. `paper-removed`,
/// which must see the folder before it goes to the Trash).
pub fn run_blocking(app: &AppHandle, library: &Path, event: &str, paper_id: &str, paper_dir: &Path) {
    let hooks = find_hooks(library, event);
    if hooks.is_empty() {
        return;
    }
    let stdin_json = std::fs::read(paper_dir.join("paper.json")).unwrap_or_default();
    for hook in hooks {
        let result = run_one(&hook, library, event, paper_id, paper_dir, &stdin_json);
        log(library, &result);
        let _ = app.emit("hook-finished", result);
    }
}

/// Hooks may call slow tools (an LLM summarising the paper): generous, but bounded.
const TIMEOUT: Duration = Duration::from_secs(10 * 60);

fn run_one(
    hook: &Path,
    library: &Path,
    event: &str,
    paper_id: &str,
    paper_dir: &Path,
    stdin_json: &[u8],
) -> HookResult {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    // Executables run directly (their shebang decides the interpreter);
    // everything else is run by /bin/sh.
    let script = if is_executable(hook) {
        r#"exec "$XIVLY_HOOK""#
    } else {
        r#"exec /bin/sh "$XIVLY_HOOK""#
    };

    let hook_name = hook.file_name().unwrap_or_default().to_string_lossy().to_string();
    let base = HookResult {
        event: event.into(),
        paper_id: paper_id.into(),
        hook: hook_name,
        success: false,
        code: None,
        output: String::new(),
    };

    // Interactive login shell: loads .zprofile *and* .zshrc, so PATH matches
    // the user's terminal (GUI apps on macOS otherwise get a bare PATH).
    let child = Command::new(shell)
        .args(["-i", "-l", "-c", script])
        .current_dir(paper_dir)
        .env("XIVLY_HOOK", hook)
        .env("XIVLY_EVENT", event)
        .env("XIVLY_LIBRARY", library)
        .env("XIVLY_PAPER_ID", paper_id)
        .env("XIVLY_PAPER_DIR", paper_dir)
        .env("XIVLY_PAPER_PDF", paper_dir.join("paper.pdf"))
        .env("XIVLY_PAPER_JSON", paper_dir.join("paper.json"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();
    let mut child = match child {
        Ok(c) => c,
        Err(e) => return HookResult { output: e.to_string(), ..base },
    };

    // Feed stdin and drain stdout/stderr on their own threads: writing
    // everything first could deadlock once both pipes fill up.
    if let Some(mut stdin) = child.stdin.take() {
        let data = stdin_json.to_vec();
        std::thread::spawn(move || {
            let _ = stdin.write_all(&data);
        });
    }
    let drain = |pipe: Option<Box<dyn Read + Send>>| {
        std::thread::spawn(move || {
            let mut buf = Vec::new();
            if let Some(mut p) = pipe {
                let _ = p.read_to_end(&mut buf);
            }
            buf
        })
    };
    let out = drain(child.stdout.take().map(|p| Box::new(p) as Box<dyn Read + Send>));
    let err = drain(child.stderr.take().map(|p| Box::new(p) as Box<dyn Read + Send>));

    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if started.elapsed() > TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(_) => break None,
        }
    };

    let mut output = String::from_utf8_lossy(&out.join().unwrap_or_default()).into_owned();
    output.push_str(&String::from_utf8_lossy(&err.join().unwrap_or_default()));
    match status {
        Some(s) => HookResult { success: s.success(), code: s.code(), output, ..base },
        None => HookResult { output: format!("{output}\n(timed out after {}s)", TIMEOUT.as_secs()), ..base },
    }
}

#[cfg(unix)]
fn is_executable(p: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    p.metadata().map(|m| m.permissions().mode() & 0o111 != 0).unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(_: &Path) -> bool {
    false
}

fn log(library: &Path, r: &HookResult) {
    let dir = library.join(".xivly/logs");
    let _ = std::fs::create_dir_all(&dir);
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(dir.join("hooks.log")) {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(
            f,
            "[{ts}] {} {} ({}) -> {:?}\n{}",
            r.event, r.paper_id, r.hook, r.code, r.output.trim_end()
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_and_runs_hooks() {
        let lib = std::env::temp_dir().join(format!("xivly-hooks-{}", std::process::id()));
        let hooks = lib.join(".xivly/hooks");
        let paper = lib.join("papers/p1");
        std::fs::create_dir_all(&hooks).unwrap();
        std::fs::create_dir_all(&paper).unwrap();
        std::fs::write(paper.join("paper.json"), r#"{"title":"T"}"#).unwrap();
        // Not executable: run by /bin/sh. Reads stdin and env.
        std::fs::write(hooks.join("paper-added.sh"), "read json; echo \"$XIVLY_EVENT $XIVLY_PAPER_ID $json $(basename \"$PWD\")\"").unwrap();
        std::fs::write(hooks.join("paper-added.sample"), "exit 1").unwrap();
        std::fs::write(hooks.join("paper-addedx"), "exit 1").unwrap();

        let found = find_hooks(&lib, "paper-added");
        assert_eq!(found, vec![hooks.join("paper-added.sh")]);

        let r = run_one(&found[0], &lib, "paper-added", "p1", &paper, br#"{"title":"T"}"#);
        assert!(r.success, "{}", r.output);
        assert!(r.output.contains(r#"paper-added p1 {"title":"T"} p1"#), "{}", r.output);
        std::fs::remove_dir_all(lib).unwrap();
    }
}
