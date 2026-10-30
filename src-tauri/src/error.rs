use serde::Serialize;

/// Structured error type for all SFEL operations.
/// 
/// Error messages are intentionally vague for authentication and integrity
/// failures to avoid providing oracles to attackers.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SfelError {
    #[error("File not found: {0}")]
    FileNotFound(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Invalid SFEL file format")]
    InvalidFormat,

    #[error("Unsupported format version: {0}")]
    UnsupportedVersion(u8),

    #[error("File is corrupted or has been tampered with")]
    IntegrityError,

    #[error("Incorrect password or corrupted file")]
    AuthenticationFailed,

    #[error("File is truncated or incomplete")]
    TruncatedFile,

    #[error("Operation cancelled by user")]
    Cancelled,

    #[error("Insufficient disk space")]
    InsufficientSpace,

    #[error("Invalid parameters: {0}")]
    InvalidParameters(String),

    #[error("I/O error: {0}")]
    IoError(String),

    #[error("File already exists: {0}")]
    FileAlreadyExists(String),
}

// Implement Serialize for Tauri command return compatibility.
// We serialize errors as their display message to avoid leaking internal details.
impl Serialize for SfelError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<std::io::Error> for SfelError {
    fn from(err: std::io::Error) -> Self {
        match err.kind() {
            std::io::ErrorKind::NotFound => {
                SfelError::FileNotFound(err.to_string())
            }
            std::io::ErrorKind::PermissionDenied => {
                SfelError::PermissionDenied(err.to_string())
            }
            std::io::ErrorKind::StorageFull => {
                SfelError::InsufficientSpace
            }
            _ => SfelError::IoError(err.to_string()),
        }
    }
}
