//! The `claude` CLI (Claude Code) as Xivly's way to ask Claude about a paper,
//! with the user's own login (their subscription; no API key). Found once
//! through the login shell (GUI apps on macOS get a bare PATH), then run by
//! its full path in the paper's folder: `-p` with the prompt on stdin, and
//! `--output-format stream-json`, each event forwarded to the window as it
//! comes. No MCP servers, no user settings, and only the tools Xivly allows.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::State;
use tauri::ipc::Channel;

use crate::error::Result;
use crate::library::{self, AppState};

/// Runs in progress, by id (to cancel them).
#[derive(Default)]
pub struct ClaudeState {
    runs: Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>,
}

#[derive(Debug, Serialize)]
pub struct ClaudeInfo {
    path: String,
    version: String,
}

/// The login shell's PATH and where it finds `claude` (macOS and Linux), asked once.
fn login_shell() -> &'static (Option<String>, Option<PathBuf>) {
    static FOUND: OnceLock<(Option<String>, Option<PathBuf>)> = OnceLock::new();
    FOUND.get_or_init(|| {
        if cfg!(windows) {
            return (None, None);
        }
        // Markers: an interactive shell may print its own things (motd, prompts).
        let script = r#"printf '__XIVLY__%s__XIVLY__%s__XIVLY__' "$PATH" "$(command -v claude)""#;
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        let out = Command::new(shell).args(["-i", "-l", "-c", script]).stdin(Stdio::null()).stderr(Stdio::null()).output();
        let Ok(out) = out else { return (None, None) };
        let text = String::from_utf8_lossy(&out.stdout);
        let parts: Vec<&str> = text.split("__XIVLY__").collect();
        // ["…", PATH, claude, "…"]
        let path = parts.get(1).filter(|s| !s.is_empty()).map(|s| s.to_string());
        let claude = parts.get(2).filter(|s| !s.is_empty()).map(PathBuf::from).filter(|p| p.is_file());
        (path, claude)
    })
}

/// `claude`: the path given (Settings), else where the login shell finds it, else the usual places.
fn find(given: Option<&str>) -> Result<PathBuf> {
    if let Some(p) = given.map(str::trim).filter(|p| !p.is_empty()) {
        let p = PathBuf::from(p);
        return if p.is_file() { Ok(p) } else { Err(format!("No claude at {}", p.display()).into()) };
    }
    if let Some(p) = &login_shell().1 {
        return Ok(p.clone());
    }
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
    let candidates = [home.join(".local/bin/claude"), home.join(".claude/local/claude"), PathBuf::from("/opt/homebrew/bin/claude"), PathBuf::from("/usr/local/bin/claude")];
    candidates
        .into_iter()
        .find(|p| p.is_file())
        .ok_or_else(|| "Claude Code (the claude command) wasn't found: install it, or set its path in Settings › Claude".into())
}

#[tauri::command]
pub async fn claude_locate(path: Option<String>) -> Result<ClaudeInfo> {
    tauri::async_runtime::spawn_blocking(move || {
        let claude = find(path.as_deref())?;
        let out = Command::new(&claude).arg("--version").env_remove("CLAUDECODE").output()?;
        if !out.status.success() {
            return Err(format!("{} --version failed: {}", claude.display(), String::from_utf8_lossy(&out.stderr).trim()).into());
        }
        Ok(ClaudeInfo { path: claude.display().to_string(), version: String::from_utf8_lossy(&out.stdout).trim().to_string() })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRequest {
    /// The run's id (to cancel it).
    id: String,
    /// `claude` (from `claude_locate`).
    claude: String,
    root_dir: PathBuf,
    paper_id: String,
    prompt: String,
    /// The conversation: new (`--session-id`) or continued (`--resume`).
    session_id: String,
    resume: bool,
    model: Option<String>,
    /// Appended to Claude Code's system prompt.
    system: Option<String>,
    /// The tools Claude may use (e.g. ["Read"]); none: an empty list.
    tools: Vec<String>,
}

/// The arguments of a run (the prompt goes on stdin).
fn args(r: &RunRequest) -> Vec<String> {
    let tools = r.tools.join(",");
    let mut a: Vec<String> = ["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--strict-mcp-config", "--setting-sources", ""].map(String::from).to_vec();
    a.extend(["--tools".into(), tools.clone()]);
    if !tools.is_empty() {
        a.extend(["--allowedTools".into(), tools]);
    }
    a.extend([if r.resume { "--resume" } else { "--session-id" }.into(), r.session_id.clone()]);
    if let Some(m) = r.model.as_deref().filter(|m| !m.is_empty()) {
        a.extend(["--model".into(), m.into()]);
    }
    if let Some(s) = r.system.as_deref().filter(|s| !s.is_empty()) {
        a.extend(["--append-system-prompt".into(), s.into()]);
    }
    a
}

#[tauri::command]
pub async fn claude_run(state: State<'_, AppState>, claude: State<'_, ClaudeState>, request: RunRequest, on_event: Channel<Value>) -> Result<()> {
    if request.paper_id.is_empty() || request.paper_id.contains(['/', '\\']) || request.paper_id.starts_with('.') {
        return Err(format!("Not a paper: {:?}", request.paper_id).into());
    }
    let root = library::root(&state, &request.root_dir)?;
    let dir = library::resolve(&root, &format!("papers/{}", request.paper_id))?;
    if !dir.is_dir() {
        return Err(format!("No paper folder for {}", request.paper_id).into());
    }
    let program = PathBuf::from(&request.claude);
    let child = spawn(&program, &args(&request), &dir, login_shell().0.as_deref(), &request.prompt)?;
    let child = Arc::new(Mutex::new(child));
    claude.runs.lock().unwrap().insert(request.id.clone(), child.clone());
    let runs = claude.runs.clone();
    let id = request.id;
    std::thread::spawn(move || {
        stream(&child, |v| {
            let _ = on_event.send(v);
        });
        runs.lock().unwrap().remove(&id);
    });
    Ok(())
}

#[tauri::command]
pub fn claude_cancel(claude: State<'_, ClaudeState>, id: String) -> Result<()> {
    if let Some(child) = claude.runs.lock().unwrap().get(&id) {
        let _ = child.lock().unwrap().kill();
    }
    Ok(())
}

/// Start `program` in `dir` with the prompt on stdin.
fn spawn(program: &Path, args: &[String], dir: &Path, path_env: Option<&str>, prompt: &str) -> Result<Child> {
    let mut c = Command::new(program);
    c.args(args).current_dir(dir).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    // Not "inside Claude Code" (the app may be started from a Claude Code terminal).
    c.env_remove("CLAUDECODE");
    if let Some(p) = path_env {
        c.env("PATH", p);
    }
    let mut child = c.spawn().map_err(|e| format!("Couldn't start {}: {e}", program.display()))?;
    if let Some(mut stdin) = child.stdin.take() {
        let prompt = prompt.to_string();
        std::thread::spawn(move || {
            let _ = stdin.write_all(prompt.as_bytes());
        });
    }
    Ok(child)
}

/// Every line of stdout as an event (JSON; anything else as `xivly_text`), then
/// `xivly_exit` with the exit code and the end of stderr.
fn stream(child: &Arc<Mutex<Child>>, mut emit: impl FnMut(Value)) {
    let (stdout, stderr) = {
        let mut c = child.lock().unwrap();
        (c.stdout.take(), c.stderr.take())
    };
    let errors = std::thread::spawn(move || {
        let mut s = String::new();
        if let Some(mut e) = stderr {
            let _ = e.read_to_string(&mut s);
        }
        s
    });
    if let Some(out) = stdout {
        for line in BufReader::new(out).lines() {
            let Ok(line) = line else { break };
            if line.trim().is_empty() {
                continue;
            }
            emit(serde_json::from_str(&line).unwrap_or_else(|_| json!({ "type": "xivly_text", "text": line })));
        }
    }
    let stderr = errors.join().unwrap_or_default();
    let code = child.lock().unwrap().wait().ok().and_then(|s| s.code());
    let tail: String = stderr.chars().rev().take(2000).collect::<Vec<_>>().into_iter().rev().collect();
    emit(json!({ "type": "xivly_exit", "code": code, "stderr": tail }));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(resume: bool, tools: &[&str]) -> RunRequest {
        RunRequest {
            id: "r".into(),
            claude: "claude".into(),
            root_dir: PathBuf::new(),
            paper_id: "p".into(),
            prompt: "?".into(),
            session_id: "s-1".into(),
            resume,
            model: Some("sonnet".into()),
            system: Some("Cite pages".into()),
            tools: tools.iter().map(|t| t.to_string()).collect(),
        }
    }

    #[test]
    fn arguments() {
        let a = args(&request(false, &["Read"]));
        assert_eq!(&a[..8], &["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--strict-mcp-config", "--setting-sources", ""]);
        let joined = a.join(" ");
        assert!(joined.contains("--tools Read --allowedTools Read"));
        assert!(joined.contains("--session-id s-1"));
        assert!(joined.contains("--model sonnet"));
        assert!(joined.contains("--append-system-prompt Cite pages"));
        let b = args(&request(true, &[]));
        assert!(b.join(" ").contains("--resume s-1"));
        assert!(!b.contains(&"--allowedTools".to_string()));
        let i = b.iter().position(|x| x == "--tools").unwrap();
        assert_eq!(b[i + 1], "");
    }

    #[cfg(unix)]
    #[test]
    fn streams_events_then_the_exit() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("xivly-claude-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        // A stand-in for claude: echoes its stdin and arguments as events, a non-JSON line, stderr, exit 3.
        let fake = dir.join("claude");
        std::fs::write(
            &fake,
            "#!/bin/sh\nprompt=$(cat)\nprintf '{\"type\":\"system\",\"subtype\":\"init\",\"cwd\":\"%s\"}\\n' \"$(pwd)\"\nprintf '{\"type\":\"result\",\"result\":\"%s\",\"args\":\"%s\"}\\n' \"$prompt\" \"$*\"\necho not json\necho oops >&2\nexit 3\n",
        )
        .unwrap();
        std::fs::set_permissions(&fake, std::fs::Permissions::from_mode(0o755)).unwrap();
        let child = spawn(&fake, &["--x".into()], &dir, None, "What is it about?").unwrap();
        let mut events = Vec::new();
        stream(&Arc::new(Mutex::new(child)), |v| events.push(v));
        assert_eq!(events[0]["type"], "system");
        assert_eq!(Path::new(events[0]["cwd"].as_str().unwrap()).canonicalize().unwrap(), dir.canonicalize().unwrap());
        assert_eq!(events[1]["result"], "What is it about?");
        assert_eq!(events[1]["args"], "--x");
        assert_eq!(events[2], json!({ "type": "xivly_text", "text": "not json" }));
        assert_eq!(events[3]["type"], "xivly_exit");
        assert_eq!(events[3]["code"], 3);
        assert_eq!(events[3]["stderr"].as_str().unwrap().trim(), "oops");
        std::fs::remove_dir_all(dir).ok();
    }

    /// The real claude, as Xivly runs it: `cargo test -- --ignored real_claude --nocapture` (costs a few tokens).
    #[test]
    #[ignore]
    fn real_claude() {
        let dir = std::env::temp_dir().join(format!("xivly-real-claude-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("note.txt"), "Pineapple is the first word of this file.").unwrap();
        let claude = find(None).unwrap();
        let mut r = request(false, &["Read"]);
        r.session_id = uuid_like();
        r.model = Some("haiku".into());
        r.system = None;
        let child = spawn(&claude, &args(&r), &dir, login_shell().0.as_deref(), "Read note.txt and reply with only its first word.").unwrap();
        let mut events = Vec::new();
        stream(&Arc::new(Mutex::new(child)), |v| events.push(v));
        let kinds: Vec<String> = events.iter().map(|e| format!("{}/{}", e["type"].as_str().unwrap_or(""), e["subtype"].as_str().unwrap_or(""))).collect();
        println!("claude {}\nevents {:?}", claude.display(), kinds);
        let result = events.iter().find(|e| e["type"] == "result").expect("a result");
        println!("result {} cost {} session {}", result["result"], result["total_cost_usd"], result["session_id"]);
        assert_eq!(result["is_error"], false);
        assert!(result["result"].as_str().unwrap().contains("Pineapple"));
        assert_eq!(result["session_id"], r.session_id.as_str());
        std::fs::remove_dir_all(dir).ok();
    }

    fn uuid_like() -> String {
        let n = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let h = format!("{:032x}", n ^ 0x5bd1e995_5bd1e995_5bd1e995_5bd1e995u128);
        format!("{}-{}-4{}-a{}-{}", &h[0..8], &h[8..12], &h[13..16], &h[17..20], &h[20..32])
    }

    #[test]
    fn a_given_path_that_is_not_there() {
        assert!(find(Some("/nowhere/claude")).unwrap_err().0.contains("No claude at"));
    }
}
