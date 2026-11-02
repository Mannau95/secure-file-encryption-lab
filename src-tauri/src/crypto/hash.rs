use std::fs::File;
use std::io::Read;
use std::path::Path;

use sha2::{Digest, Sha256};

use crate::error::SfelError;

/// Buffer size used for streaming SHA-256 computation (64 KiB).
const HASH_BUFFER_SIZE: usize = 64 * 1024;

/// Computes the cryptographic SHA-256 hash of a file using streaming I/O.
/// Returns a 64-character lowercase hexadecimal string.
pub fn compute_sha256_file(path: &Path) -> Result<String, SfelError> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; HASH_BUFFER_SIZE];

    loop {
        let bytes_read = file.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    let result = hasher.finalize();
    Ok(format!("{:x}", result))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_compute_sha256_empty_file() {
        let temp = NamedTempFile::new().unwrap();
        let hash = compute_sha256_file(temp.path()).unwrap();
        // SHA-256 of empty string
        assert_eq!(
            hash,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn test_compute_sha256_known_string() {
        let mut temp = NamedTempFile::new().unwrap();
        temp.write_all(b"hello world").unwrap();
        temp.flush().unwrap();
        let hash = compute_sha256_file(temp.path()).unwrap();
        // SHA-256 of "hello world"
        assert_eq!(
            hash,
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
    }

    #[test]
    fn test_compute_sha256_non_existent_file() {
        let path = Path::new("non_existent_file_test_sfel.xyz");
        assert!(compute_sha256_file(path).is_err());
    }
}
