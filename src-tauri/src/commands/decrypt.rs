use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use zeroize::Zeroize;

use crate::commands::cancel::{is_cancelled, reset_cancel};
use crate::crypto::aead::{decrypt_single, HEADER_SIZE, TAG_LEN};
use crate::crypto::chunks::{calculate_chunk_count, decrypt_stream};
use crate::crypto::kdf::{derive_key, KdfParams};
use crate::error::SfelError;
use crate::format::header::{EncryptionMode, SfelHeader};
use crate::format::validation::{validate_header, validate_paths, validate_password};
use crate::fs::archive::{extract_folder_tar_atomically, strip_folder_archive_suffix};
use crate::fs::temp::TempFileGuard;

/// Payload emitted during decryption progress updates.
#[derive(Debug, Clone, Serialize)]
pub struct ProgressPayload {
    pub percent: f64,
    pub bytes_processed: u64,
    pub total_bytes: u64,
}

/// Core file decryption engine.
///
/// Decrypts an `.sfel` container file with `password`.
/// Authenticates all ciphertext tags before atomic finalization.
/// Guarantees that on any failure (wrong password, tampered bits, truncation),
/// no partial output is left on disk.
pub fn decrypt_file<P>(
    source_path: &Path,
    password: &str,
    dest_dir: &Path,
    mut progress: P,
) -> Result<PathBuf, SfelError>
where
    P: FnMut(f64, u64, u64),
{
    // 1. Validate inputs
    validate_paths(source_path, dest_dir)?;
    validate_password(password)?;

    // Reset cancellation state before starting
    reset_cancel();

    // 2. Open source file and read container header
    let mut source_file = File::open(source_path)?;
    let file_len = source_file.metadata()?.len();

    if file_len < HEADER_SIZE as u64 {
        return Err(SfelError::TruncatedFile);
    }

    let mut header_bytes = [0u8; HEADER_SIZE];
    source_file.read_exact(&mut header_bytes)?;

    let header = SfelHeader::from_bytes(&header_bytes)?;
    validate_header(&header)?;

    // 3. Verify total container file size consistency
    let expected_file_size = match header.mode {
        EncryptionMode::Single => {
            (HEADER_SIZE as u64)
                .checked_add(header.original_file_size)
                .and_then(|s| s.checked_add(TAG_LEN as u64))
                .ok_or_else(|| SfelError::InvalidParameters("File size overflow".into()))?
        }
        EncryptionMode::Chunked => {
            let total_chunks = calculate_chunk_count(header.original_file_size) as u64;
            (HEADER_SIZE as u64)
                .checked_add(header.original_file_size)
                .and_then(|s| s.checked_add(total_chunks * TAG_LEN as u64))
                .ok_or_else(|| SfelError::InvalidParameters("File size overflow".into()))?
        }
    };

    if file_len < expected_file_size {
        return Err(SfelError::TruncatedFile);
    }
    if file_len > expected_file_size {
        return Err(SfelError::IntegrityError);
    }

    // 4. Derive decryption key using Argon2id
    let kdf_params = KdfParams {
        memory_kib: header.argon2_memory,
        iterations: header.argon2_iterations,
        parallelism: header.argon2_parallelism,
    };
    let key = derive_key(password.as_bytes(), &header.salt, &kdf_params)?;

    // 5. Determine destination path safely (detecting whether container holds a folder archive)
    let is_folder_archive = strip_folder_archive_suffix(&header.original_name);

    let target_name = if let Some(folder_name) = is_folder_archive {
        Path::new(folder_name)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("decrypted_folder")
            .to_string()
    } else if !header.original_name.is_empty() {
        Path::new(&header.original_name)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("decrypted_file")
            .to_string()
    } else {
        source_path
            .file_name()
            .and_then(|s| s.to_str())
            .map(|s| s.trim_end_matches(".sfel"))
            .filter(|s| !s.is_empty())
            .unwrap_or("decrypted_file")
            .to_string()
    };

    let dest_path = dest_dir.join(target_name);
    if dest_path.exists() {
        return Err(SfelError::FileAlreadyExists(dest_path.display().to_string()));
    }

    // 6. Initialize temp file in target directory for crash-resilient atomic write
    let mut temp = TempFileGuard::create_in_same_dir(&dest_path)?;

    // 7. Perform authenticated decryption
    match header.mode {
        EncryptionMode::Single => {
            if is_cancelled() {
                return Err(SfelError::Cancelled);
            }

            let cipher_len = (header.original_file_size as usize) + TAG_LEN;
            let mut cipher_buf = vec![0u8; cipher_len];
            source_file.read_exact(&mut cipher_buf)?;

            let mut plaintext =
                decrypt_single(&key, &header.nonce, &header_bytes, &cipher_buf)?;
            cipher_buf.zeroize();

            if plaintext.len() as u64 != header.original_file_size {
                plaintext.zeroize();
                return Err(SfelError::IntegrityError);
            }

            temp.file_mut()?.write_all(&plaintext)?;
            plaintext.zeroize();

            progress(100.0, header.original_file_size, header.original_file_size);
        }
        EncryptionMode::Chunked => {
            let base_nonce = header.base_nonce();
            decrypt_stream(
                source_file,
                temp.file_mut()?,
                &key,
                &base_nonce,
                &header_bytes,
                header.original_file_size,
                is_cancelled,
                |processed, total| {
                    let percent = if total == 0 {
                        100.0
                    } else {
                        (processed as f64 / total as f64) * 100.0
                    };
                    progress(percent, processed, total);
                },
            )?;
        }
    }

    // 8. Atomically persist temp file (or extract directory archive) once ALL data is authenticated
    if is_folder_archive.is_some() {
        temp.file_mut()?.sync_all()?;
        extract_folder_tar_atomically(temp.path(), &dest_path)?;
        // `temp` drops here and removes the temporary `.tar` file automatically
    } else {
        temp.persist_to(&dest_path)?;
    }

    Ok(dest_path)
}

/// Tauri command handler for file decryption.
#[tauri::command]
pub fn cmd_decrypt(
    app: AppHandle,
    source_path: String,
    mut password: String,
    dest_dir: String,
) -> Result<String, SfelError> {
    let result = decrypt_file(
        Path::new(&source_path),
        &password,
        Path::new(&dest_dir),
        |percent, bytes_processed, total_bytes| {
            let payload = ProgressPayload {
                percent,
                bytes_processed,
                total_bytes,
            };
            let _ = app.emit("decryption-progress", &payload);
            let _ = app.emit("progress", &payload);
        },
    );

    // Zeroize password memory
    password.zeroize();

    result.map(|p| p.display().to_string())
}
