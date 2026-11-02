use std::fs::{self, File};
use std::path::{Component, Path, PathBuf};
use uuid::Uuid;

use crate::error::SfelError;

/// Suffix embedded into the SFEL header `original_name` when a directory is archived
/// into a `.sfel` container. During decryption, detecting this suffix triggers automatic
/// directory extraction instead of leaving a raw archive file on disk.
pub const FOLDER_ARCHIVE_SUFFIX: &str = ".sfel-folder.tar";

/// Returns `true` if the header `original_name` indicates a packed directory archive
/// and returns the restored folder name with the suffix stripped.
pub fn strip_folder_archive_suffix(original_name: &str) -> Option<&str> {
    original_name
        .strip_suffix(FOLDER_ARCHIVE_SUFFIX)
        .filter(|name| !name.is_empty())
}

/// Formats the header `original_name` for a directory, ensuring it fits within
/// `max_bytes` (e.g. `MAX_NAME_LEN` = 72 bytes in SFEL v1 header).
pub fn make_folder_archive_name(folder_name: &str, max_bytes: usize) -> String {
    let max_stem_bytes = max_bytes.saturating_sub(FOLDER_ARCHIVE_SUFFIX.len());
    let mut stem = folder_name;
    while stem.len() > max_stem_bytes {
        let mut idx = stem.len() - 1;
        while !stem.is_char_boundary(idx) {
            idx -= 1;
        }
        stem = &stem[..idx];
    }
    if stem.is_empty() {
        stem = "folder";
    }
    format!("{stem}{FOLDER_ARCHIVE_SUFFIX}")
}

/// Packs an entire directory recursively into a temporary TAR file located at `tar_file_path`.
/// Does not follow symlinks (`follow_symlinks(false)`) to prevent directory escape loops.
pub fn create_folder_tar(source_dir: &Path, tar_file: &mut File) -> Result<(), SfelError> {
    if !source_dir.is_dir() {
        return Err(SfelError::InvalidParameters(format!(
            "Source path '{}' is not a directory",
            source_dir.display()
        )));
    }

    let mut builder = tar::Builder::new(tar_file);
    builder.follow_symlinks(false);
    builder.append_dir_all(".", source_dir)?;
    builder.finish()?;
    Ok(())
}

/// Safely extracts a verified TAR archive (`tar_file_path`) into `final_dest_dir` atomically.
///
/// Security guarantees:
/// - Rejects any entry containing `..` (`Component::ParentDir`), absolute roots, or Windows prefixes
///   (Zip-Slip / Tar-Slip protection).
/// - Rejects symlink and hardlink entries so an archive cannot plant links pointing outside the target directory.
/// - Extracts into a sibling temporary directory first and renames to `final_dest_dir` only after
///   all entries are cleanly extracted. If anything fails, the temporary directory is removed.
pub fn extract_folder_tar_atomically(
    tar_file_path: &Path,
    final_dest_dir: &Path,
) -> Result<(), SfelError> {
    if final_dest_dir.exists() {
        return Err(SfelError::FileAlreadyExists(
            final_dest_dir.display().to_string(),
        ));
    }

    let parent = final_dest_dir.parent().unwrap_or_else(|| Path::new("."));
    let stem = final_dest_dir
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("folder");
    let temp_dir_path = parent.join(format!(".{stem}.{}.tmp_dir", Uuid::new_v4()));

    fs::create_dir_all(&temp_dir_path)?;

    let extract_result = (|| -> Result<(), SfelError> {
        let file = File::open(tar_file_path)?;
        let mut archive = tar::Archive::new(file);

        for entry_res in archive.entries()? {
            let mut entry = entry_res?;
            let entry_type = entry.header().entry_type();

            // Disallow symlinks, hardlinks, and device nodes for security
            if entry_type.is_symlink()
                || entry_type.is_hard_link()
                || entry_type.is_block_special()
                || entry_type.is_character_special()
                || entry_type.is_fifo()
            {
                return Err(SfelError::IntegrityError);
            }

            let entry_path = entry.path()?;
            let mut clean_rel = PathBuf::new();

            for comp in entry_path.components() {
                match comp {
                    Component::CurDir => {}
                    Component::Normal(part) => clean_rel.push(part),
                    Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                        return Err(SfelError::IntegrityError);
                    }
                }
            }

            if clean_rel.as_os_str().is_empty() {
                continue;
            }

            let target_entry_path = temp_dir_path.join(&clean_rel);
            if entry_type.is_dir() {
                fs::create_dir_all(&target_entry_path)?;
            } else if entry_type.is_file() {
                if let Some(p) = target_entry_path.parent() {
                    fs::create_dir_all(p)?;
                }
                entry.unpack(&target_entry_path)?;
            }
        }

        Ok(())
    })();

    if let Err(err) = extract_result {
        let _ = fs::remove_dir_all(&temp_dir_path);
        return Err(err);
    }

    if let Err(err) = fs::rename(&temp_dir_path, final_dest_dir) {
        let _ = fs::remove_dir_all(&temp_dir_path);
        return Err(SfelError::from(err));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    #[test]
    fn test_folder_archive_name_helpers() {
        let name = make_folder_archive_name("MySecretDocs", 72);
        assert_eq!(name, "MySecretDocs.sfel-folder.tar");
        assert_eq!(strip_folder_archive_suffix(&name), Some("MySecretDocs"));
        assert_eq!(strip_folder_archive_suffix("regular_file.tar"), None);

        // Long folder name truncation within 72-byte limit
        let very_long = "a".repeat(100);
        let capped = make_folder_archive_name(&very_long, 72);
        assert!(capped.len() <= 72);
        assert!(strip_folder_archive_suffix(&capped).is_some());
    }

    #[test]
    fn test_tar_create_and_extract_roundtrip() {
        let tmp = TempDir::new().unwrap();
        let src_dir = tmp.path().join("project_folder");
        let sub_dir = src_dir.join("nested").join("deep");
        fs::create_dir_all(&sub_dir).unwrap();

        fs::write(src_dir.join("readme.txt"), b"Root file content").unwrap();
        fs::write(sub_dir.join("secret.bin"), &[1u8, 2, 3, 4, 5, 255]).unwrap();

        let tar_path = tmp.path().join("archive.tar");
        {
            let mut tar_file = File::create(&tar_path).unwrap();
            create_folder_tar(&src_dir, &mut tar_file).unwrap();
            tar_file.flush().unwrap();
        }

        let restored_dir = tmp.path().join("restored_project_folder");
        extract_folder_tar_atomically(&tar_path, &restored_dir).unwrap();

        assert!(restored_dir.is_dir());
        assert_eq!(
            fs::read(restored_dir.join("readme.txt")).unwrap(),
            b"Root file content"
        );
        assert_eq!(
            fs::read(restored_dir.join("nested").join("deep").join("secret.bin")).unwrap(),
            &[1u8, 2, 3, 4, 5, 255]
        );
    }
}
