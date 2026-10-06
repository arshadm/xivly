//! App-level configuration (lives in the app config dir, NOT in the library).
//! Only remembers where the library is; everything else lives in the library
//! folder itself so it syncs with it.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::Result;

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub library: Option<PathBuf>,
}

fn config_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(app.path().app_config_dir()?.join("config.json"))
}

/// The saved config; none yet is the default, but an unreadable one is an error.
pub fn load(app: &AppHandle) -> Result<AppConfig> {
    match std::fs::read(config_path(app)?) {
        Ok(bytes) => Ok(serde_json::from_slice(&bytes)?),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(AppConfig::default()),
        Err(e) => Err(e.into()),
    }
}

/// Written atomically: a crash mid-write never leaves a half-written config.
pub fn save(app: &AppHandle, config: &AppConfig) -> Result<()> {
    crate::library::write_atomic(&config_path(app)?, &serde_json::to_vec_pretty(config)?)
}
