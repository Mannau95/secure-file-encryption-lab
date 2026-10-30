use std::io::Write;
use std::path::Path;

use crate::error::SfelError;
use crate::fs::temp::TempFileGuard;

/// Atomically writes a byte buffer to the specified destination path.
///
/// Writes to a temporary file in the same directory, fsyncs data to disk,
/// and performs an atomic rename to `dest_path`. If an error occurs,
/// the temporary file is deleted automatically and the destination remains untouched.
pub fn atomic_write_bytes(dest_path: &Path, data: &[u8]) -> Result<(), SfelError> {
    let mut temp = TempFileGuard::create_in_same_dir(dest_path)?;
    temp.file_mut()?.write_all(data)?;
    temp.persist_to(dest_path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn test_atomic_write_bytes_success() {
        let dest = std::env::temp_dir().join(format!("atomic_test_{}.dat", Uuid::new_v4()));
        let payload = b"Cryptographic security verification test";

        atomic_write_bytes(&dest, payload).unwrap();
        assert!(dest.exists());

        let read_back = std::fs::read(&dest).unwrap();
        assert_eq!(read_back, payload);

        let _ = std::fs::remove_file(&dest);
    }
}
