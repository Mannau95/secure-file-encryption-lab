use std::path::Path;
use crate::crypto::hash::compute_sha256_file;
use crate::error::SfelError;

/// Tauri command to compute the SHA-256 fingerprint of any file.
#[tauri::command]
pub fn cmd_hash_file(path: String) -> Result<String, SfelError> {
    compute_sha256_file(Path::new(&path))
}
