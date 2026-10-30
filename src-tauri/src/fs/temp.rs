use std::fs::{File, OpenOptions};
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::error::SfelError;

/// Guard struct for managing temporary files during atomic write operations.
///
/// Ensures the temp file is created in the same directory as the target destination
/// (enabling atomic cross-directory-safe rename on the same filesystem).
/// If dropped before `persist_to` is successfully executed, the temporary file is
/// automatically deleted from disk.
pub struct TempFileGuard {
    path: PathBuf,
    file: Option<File>,
    persisted: bool,
}

impl TempFileGuard {
    /// Creates a temporary file in the parent directory of `target_path`.
    pub fn create_in_same_dir(target_path: &Path) -> Result<Self, SfelError> {
        let parent = target_path.parent().unwrap_or_else(|| Path::new("."));
        let stem = target_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("sfel");
        let temp_name = format!(".{}.{}.tmp", stem, Uuid::new_v4());
        let path = parent.join(temp_name);

        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create_new(true)
            .open(&path)?;

        Ok(Self {
            path,
            file: Some(file),
            persisted: false,
        })
    }

    /// Provides mutable reference to the open temporary file handle.
    pub fn file_mut(&mut self) -> Result<&mut File, SfelError> {
        self.file
            .as_mut()
            .ok_or_else(|| SfelError::IoError("Temporary file handle is already closed".into()))
    }

    /// Returns the filesystem path of the temporary file.
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Syncs data to disk, closes the file handle, and atomically renames the temp file
    /// to the specified `target_path`.
    pub fn persist_to(mut self, target_path: &Path) -> Result<(), SfelError> {
        // Sync and flush before closing
        if let Some(file) = self.file.take() {
            file.sync_all()?;
            drop(file); // Ensure handle is closed on Windows before renaming
        }

        // If target file already exists, remove it first on platforms where rename does not overwrite
        if target_path.exists() {
            let _ = std::fs::remove_file(target_path);
        }

        std::fs::rename(&self.path, target_path)?;
        self.persisted = true;
        Ok(())
    }
}

impl Drop for TempFileGuard {
    fn drop(&mut self) {
        if !self.persisted {
            // Explicitly close handle before attempting removal on Windows
            self.file.take();
            let _ = std::fs::remove_file(&self.path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_temp_file_cleanup_on_drop() {
        let target = std::env::temp_dir().join(format!("test_target_{}.txt", Uuid::new_v4()));
        let temp_path;
        {
            let mut guard = TempFileGuard::create_in_same_dir(&target).unwrap();
            temp_path = guard.path().to_path_buf();
            assert!(temp_path.exists());
            guard.file_mut().unwrap().write_all(b"test data").unwrap();
            // Drop without persist_to
        }
        assert!(!temp_path.exists());
    }

    #[test]
    fn test_temp_file_persist() {
        let target = std::env::temp_dir().join(format!("test_persist_{}.txt", Uuid::new_v4()));
        {
            let mut guard = TempFileGuard::create_in_same_dir(&target).unwrap();
            let temp_path = guard.path().to_path_buf();
            guard.file_mut().unwrap().write_all(b"persisted data").unwrap();
            guard.persist_to(&target).unwrap();
            assert!(!temp_path.exists());
            assert!(target.exists());
        }
        let content = std::fs::read(&target).unwrap();
        assert_eq!(content, b"persisted data");
        let _ = std::fs::remove_file(&target);
    }
}
