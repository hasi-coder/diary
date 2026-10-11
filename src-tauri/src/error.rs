use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Wrong password, or the workspace data is corrupted.")]
    BadPassword,
    #[error("The workspace is locked.")]
    Locked,
    #[error("{0}")]
    Invalid(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Encryption error: data could not be sealed or opened.")]
    Crypto,
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Data format error: {0}")]
    Json(#[from] serde_json::Error),
}

/// Errors cross the IPC boundary as plain strings.
impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;
