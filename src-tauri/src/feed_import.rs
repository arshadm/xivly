//! Import from the `arxiv_fetch.py` tool: its SQLite database (papers, scores,
//! dismissals, runs) and `config.json`, from a folder the user picked. Read-only;
//! rows are returned as stored, and the frontend maps them into the feed.

use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags, Row};
use serde::Serialize;

use crate::error::Result;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedPaper {
    arxiv_id: String,
    version: Option<String>,
    title: String,
    authors: Option<String>,
    #[serde(rename = "abstract")]
    abstract_: Option<String>,
    categories: Option<String>,
    topics: Option<String>,
    published: Option<String>,
    priority: Option<i64>,
    rationale: Option<String>,
    scored_at: Option<String>,
    scorer_model: Option<String>,
    first_seen: Option<String>,
    dismissed: bool,
    dismissed_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedRun {
    started_at: Option<String>,
    finished_at: Option<String>,
    window_from: Option<String>,
    window_to: Option<String>,
    n_found: i64,
    n_new: i64,
    n_scored: i64,
    status: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Imported {
    /// `config.json` as it is (null when missing).
    config: Option<serde_json::Value>,
    papers: Vec<ImportedPaper>,
    runs: Vec<ImportedRun>,
}

#[tauri::command]
pub async fn feed_import_arxiv_fetch(dir: PathBuf) -> Result<Imported> {
    tauri::async_runtime::spawn_blocking(move || read(&dir))
        .await
        .map_err(|e| e.to_string())?
}

fn has_column(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let names = stmt.query_map([], |r| r.get::<_, String>(1))?;
    for name in names {
        if name? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

fn paper(r: &Row, dismissed_cols: bool) -> rusqlite::Result<ImportedPaper> {
    Ok(ImportedPaper {
        arxiv_id: r.get("arxiv_id")?,
        version: r.get("version")?,
        title: r.get("title")?,
        authors: r.get("authors")?,
        abstract_: r.get("abstract")?,
        categories: r.get("categories")?,
        topics: r.get("topics")?,
        published: r.get("published")?,
        priority: r.get("priority")?,
        rationale: r.get("rationale")?,
        scored_at: r.get("scored_at")?,
        scorer_model: r.get("scorer_model")?,
        first_seen: r.get("first_seen")?,
        dismissed: dismissed_cols && r.get::<_, Option<i64>>("dismissed")?.unwrap_or(0) != 0,
        dismissed_at: if dismissed_cols {
            r.get("dismissed_at")?
        } else {
            None
        },
    })
}

pub fn read(dir: &Path) -> Result<Imported> {
    let db = dir.join("arxiv.db");
    if !db.is_file() {
        return Err(format!("No arxiv.db in {}", dir.display()).into());
    }
    let conn = Connection::open_with_flags(
        &db,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    // Databases from before the webapp's delete feature have no dismissed columns.
    let dismissed_cols = has_column(&conn, "papers", "dismissed")?;
    let mut stmt = conn.prepare("SELECT * FROM papers ORDER BY published DESC")?;
    let papers = stmt
        .query_map([], |r| paper(r, dismissed_cols))?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let runs = if has_column(&conn, "runs", "window_to")? {
        let mut stmt = conn.prepare("SELECT * FROM runs ORDER BY id")?;
        stmt.query_map([], |r| {
            Ok(ImportedRun {
                started_at: r.get("started_at")?,
                finished_at: r.get("finished_at")?,
                window_from: r.get("window_from")?,
                window_to: r.get("window_to")?,
                n_found: r.get::<_, Option<i64>>("n_found")?.unwrap_or(0),
                n_new: r.get::<_, Option<i64>>("n_new")?.unwrap_or(0),
                n_scored: r.get::<_, Option<i64>>("n_scored")?.unwrap_or(0),
                status: r.get("status")?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?
    } else {
        Vec::new()
    };

    let config = match std::fs::read(dir.join("config.json")) {
        Ok(bytes) => Some(serde_json::from_slice(&bytes).map_err(|e| format!("config.json: {e}"))?),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(e.into()),
    };

    Ok(Imported {
        config,
        papers,
        runs,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str, with_dismissed: bool) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("xivly-feed-import-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let conn = Connection::open(dir.join("arxiv.db")).unwrap();
        let dismissed = if with_dismissed {
            ", dismissed INTEGER NOT NULL DEFAULT 0, dismissed_at TEXT"
        } else {
            ""
        };
        conn.execute_batch(&format!(
            "CREATE TABLE papers (arxiv_id TEXT PRIMARY KEY, version TEXT, title TEXT NOT NULL, authors TEXT, abstract TEXT,
               categories TEXT, topics TEXT, published TEXT, updated TEXT, abs_url TEXT, pdf_url TEXT, priority INTEGER,
               rationale TEXT, scored_at TEXT, scorer_model TEXT, downloaded INTEGER NOT NULL DEFAULT 0, pdf_path TEXT,
               first_seen TEXT NOT NULL, run_date TEXT{dismissed});
             CREATE TABLE runs (id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, finished_at TEXT,
               window_from TEXT NOT NULL, window_to TEXT NOT NULL, n_found INTEGER DEFAULT 0, n_new INTEGER DEFAULT 0,
               n_scored INTEGER DEFAULT 0, n_downloaded INTEGER DEFAULT 0, status TEXT NOT NULL DEFAULT 'running');
             INSERT INTO papers (arxiv_id, version, title, authors, abstract, categories, topics, published, priority,
               rationale, scored_at, scorer_model, first_seen)
             VALUES ('2610.00001', 'v2', 'Fusing kernels', 'Ada Lovelace, Alan Turing', 'We fuse.', 'cs.PL, cs.LG',
               'operator-fusion, mlir', '2026-10-01T00:00:00Z', 1, 'On point.', '2026-10-02T00:00:00Z', 'sonnet',
               '2026-10-02T00:00:00Z');
             INSERT INTO runs (started_at, finished_at, window_from, window_to, n_found, n_new, n_scored, status)
             VALUES ('2026-10-02T00:00:00Z', '2026-10-02T00:10:00Z', '2026-09-25T00:00:00Z', '2026-10-02T00:00:00Z', 5, 5, 5, 'ok');"
        ))
        .unwrap();
        if with_dismissed {
            conn.execute_batch(
                "INSERT INTO papers (arxiv_id, title, published, first_seen, dismissed, dismissed_at)
                 VALUES ('2610.00002', 'Not for me', '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z', 1, '2026-10-03T00:00:00Z');",
            )
            .unwrap();
        }
        dir
    }

    #[test]
    fn reads_papers_runs_and_config() {
        let dir = fixture("full", true);
        std::fs::write(
            dir.join("config.json"),
            r#"{"categories": ["cs.PL"], "profile": "compilers"}"#,
        )
        .unwrap();
        let out = read(&dir).unwrap();
        assert_eq!(out.papers.len(), 2);
        let p = out
            .papers
            .iter()
            .find(|p| p.arxiv_id == "2610.00001")
            .unwrap();
        assert_eq!(p.priority, Some(1));
        assert_eq!(p.topics.as_deref(), Some("operator-fusion, mlir"));
        assert!(!p.dismissed);
        let d = out
            .papers
            .iter()
            .find(|p| p.arxiv_id == "2610.00002")
            .unwrap();
        assert!(d.dismissed);
        assert_eq!(d.dismissed_at.as_deref(), Some("2026-10-03T00:00:00Z"));
        assert_eq!(out.runs.len(), 1);
        assert_eq!(out.runs[0].status.as_deref(), Some("ok"));
        assert_eq!(out.config.unwrap()["profile"], "compilers");
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn older_databases_without_dismissals_and_no_config() {
        let dir = fixture("old", false);
        let out = read(&dir).unwrap();
        assert_eq!(out.papers.len(), 1);
        assert!(!out.papers[0].dismissed);
        assert!(out.config.is_none());
        std::fs::remove_dir_all(dir).ok();
    }

    /// Against a real tool folder: `XIVLY_ARXIV_FETCH_DIR=… cargo test -- --ignored real_tool_folder --nocapture`.
    #[test]
    #[ignore]
    fn real_tool_folder() {
        let dir =
            PathBuf::from(std::env::var("XIVLY_ARXIV_FETCH_DIR").expect("XIVLY_ARXIV_FETCH_DIR"));
        let out = read(&dir).unwrap();
        let dismissed = out.papers.iter().filter(|p| p.dismissed).count();
        let scored = out.papers.iter().filter(|p| p.priority.is_some()).count();
        println!(
            "papers {} scored {} dismissed {} runs {} config {}",
            out.papers.len(),
            scored,
            dismissed,
            out.runs.len(),
            out.config.is_some()
        );
        // What the frontend would get, to check the import end to end (XIVLY_ARXIV_FETCH_OUT=file.json).
        if let Ok(path) = std::env::var("XIVLY_ARXIV_FETCH_OUT") {
            std::fs::write(path, serde_json::to_vec(&out).unwrap()).unwrap();
        }
    }

    #[test]
    fn a_folder_without_the_database_says_so() {
        let dir =
            std::env::temp_dir().join(format!("xivly-feed-import-none-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert!(read(&dir).unwrap_err().0.contains("No arxiv.db"));
        std::fs::remove_dir_all(dir).ok();
    }
}
