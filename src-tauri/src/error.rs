use serde::Serialize;

/// Error type returned by every command. Serialized as a plain string so the
/// frontend can display it directly.
#[derive(Debug)]
pub struct Error(pub String);

pub type Result<T> = std::result::Result<T, Error>;

impl Serialize for Error {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.0)
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

macro_rules! impl_from {
    ($($t:ty),*) => {$(
        impl From<$t> for Error {
            fn from(e: $t) -> Self { Error(e.to_string()) }
        }
    )*};
}
impl_from!(
    std::io::Error,
    serde_json::Error,
    tauri::Error,
    trash::Error,
    rusqlite::Error
);

impl From<&str> for Error {
    fn from(e: &str) -> Self {
        Error(e.to_string())
    }
}

impl From<String> for Error {
    fn from(e: String) -> Self {
        Error(e)
    }
}
