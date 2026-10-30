use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use zeroize::Zeroize;

use crate::commands::cancel::{is_cancelled, reset_cancel};
use crate::crypto::aead::{encrypt_single, SINGLE_MODE_MAX_SIZE};
use crate::crypto::chunks::encrypt_stream;
use crate::crypto::kdf::{derive_key, KdfParams, DEFAULT_ITERATIONS, DEFAULT_MEMORY_KIB, DEFAULT_PARALLELISM};
use crate::crypto::rng::{random_base_nonce, random_nonce, random_salt};
use crate::error::SfelError;
use crate::format::header::{EncryptionMode, SfelHeader};
use crate::format::validation::{validate_paths, validate_password};
use crate::fs::temp::TempFileGuard;

/// Payload emitted during encryption progress updates.
#[derive(Debug, Clone, Serialize)]
pub struct ProgressPayload {
    pub percent: f64,
    pub bytes_processed: u64,
    pub total_bytes: u64,
}

/// Core file encryption engine.
///
/// Encrypts `source_path` with `password` using AES-256-GCM and Argon2id.
/// Automatically selects single-shot mode (<= 1 MiB) or chunked streaming mode (> 1 MiB).
/// Emits progress through the `progress` callback.
pub fn encrypt_file<P>(
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

    // 2. Prepare file metadata
    let source_file = File::open(source_path)?;
    let total_bytes = source_file.metadata()?.len();

    let original_name = source_path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| SfelError::InvalidParameters("Invalid source filename".into()))?
        .to_string();

    let dest_filename = format!("{original_name}.sfel");
    let dest_path = dest_dir.join(dest_filename);

    if dest_path.exists() {
        return Err(SfelError::FileAlreadyExists(dest_path.display().to_string()));
    }

    // Reset cancellation state before starting
    reset_cancel();

    // 3. Setup cryptographic parameters
    let salt = random_salt();
    let is_single_mode = total_bytes <= SINGLE_MODE_MAX_SIZE;

    let (mode, nonce, base_nonce) = if is_single_mode {
        (EncryptionMode::Single, random_nonce(), [0u8; 7])
    } else {
        let base = random_base_nonce();
        let mut n = [0u8; 12];
        n[..7].copy_from_slice(&base);
        (EncryptionMode::Chunked, n, base)
    };

    let header = SfelHeader::new(
        mode,
        DEFAULT_MEMORY_KIB,
        DEFAULT_ITERATIONS,
        DEFAULT_PARALLELISM,
        salt,
        nonce,
        total_bytes,
        original_name,
    );

    let header_bytes = header.to_bytes()?;

    // 4. Derive encryption key using Argon2id
    let kdf_params = KdfParams {
        memory_kib: header.argon2_memory,
        iterations: header.argon2_iterations,
        parallelism: header.argon2_parallelism,
    };
    let key = derive_key(password.as_bytes(), &salt, &kdf_params)?;

    // 5. Initialize temp file in target directory for atomic write
    let mut temp = TempFileGuard::create_in_same_dir(&dest_path)?;

    // Write 128-byte header
    temp.file_mut()?.write_all(&header_bytes)?;

    // 6. Perform encryption based on selected mode
    if is_single_mode {
        if is_cancelled() {
            return Err(SfelError::Cancelled);
        }

        let mut plaintext = std::fs::read(source_path)?;
        let mut ciphertext = encrypt_single(&key, &nonce, &header_bytes, &plaintext)?;
        plaintext.zeroize();

        temp.file_mut()?.write_all(&ciphertext)?;
        ciphertext.zeroize();

        progress(100.0, total_bytes, total_bytes);
    } else {
        encrypt_stream(
            source_file,
            temp.file_mut()?,
            &key,
            &base_nonce,
            &header_bytes,
            total_bytes,
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

    // 7. Atomically persist temp file to final destination
    temp.persist_to(&dest_path)?;

    Ok(dest_path)
}

/// Tauri command handler for file encryption.
#[tauri::command]
pub fn cmd_encrypt(
    app: AppHandle,
    source_path: String,
    mut password: String,
    dest_dir: String,
) -> Result<String, SfelError> {
    let result = encrypt_file(
        Path::new(&source_path),
        &password,
        Path::new(&dest_dir),
        |percent, bytes_processed, total_bytes| {
            let payload = ProgressPayload {
                percent,
                bytes_processed,
                total_bytes,
            };
            let _ = app.emit("encryption-progress", &payload);
            let _ = app.emit("progress", &payload);
        },
    );

    // Zeroize password memory
    password.zeroize();

    result.map(|p| p.display().to_string())
}
