use std::path::Path;
use zeroize::Zeroizing;

use crate::crypto::hash::compute_sha256_file;
use crate::crypto::rng::fill_random;
use crate::error::SfelError;
use crate::fs::atomic::atomic_write_bytes;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyfileReport {
    pub path: String,
    pub sha256: String,
    pub bytes: usize,
}

/// Generates a cryptographically secure 4096-byte random keyfile from `OsRng`,
/// writes it atomically to `dest_path`, and returns its path and SHA-256 fingerprint.
pub fn generate_keyfile(dest_path: &Path) -> Result<KeyfileReport, SfelError> {
    if dest_path.exists() {
        return Err(SfelError::FileAlreadyExists(
            dest_path.display().to_string(),
        ));
    }

    let mut random_material = Zeroizing::new(vec![0u8; 4096]);
    fill_random(&mut random_material);

    atomic_write_bytes(dest_path, &random_material)?;
    let sha256 = compute_sha256_file(dest_path)?;

    Ok(KeyfileReport {
        path: dest_path.display().to_string(),
        sha256,
        bytes: 4096,
    })
}

/// Tauri command to generate a 4096-byte CSPRNG keyfile on disk.
#[tauri::command]
pub fn cmd_generate_keyfile(dest_path: String) -> Result<KeyfileReport, SfelError> {
    generate_keyfile(Path::new(&dest_path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_generate_keyfile() {
        let tmp = TempDir::new().unwrap();
        let kf_path = tmp.path().join("master.sfel.key");

        let report = generate_keyfile(&kf_path).unwrap();
        assert!(kf_path.exists());
        assert_eq!(report.bytes, 4096);
        assert_eq!(report.sha256.len(), 64);

        let data = std::fs::read(&kf_path).unwrap();
        assert_eq!(data.len(), 4096);
    }
}
