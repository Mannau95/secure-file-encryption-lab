use std::fs::File;
use std::io::{Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use zeroize::Zeroize;

use crate::commands::cancel::{is_cancelled, reset_cancel};
use crate::crypto::aead::{encrypt_single_with_cipher, SINGLE_MODE_MAX_SIZE};
use crate::crypto::chunks::encrypt_stream_with_cipher;
use crate::crypto::kdf::{combine_password_and_keyfile, derive_key, Argon2Profile};
use crate::crypto::rng::{random_base_nonce, random_nonce, random_salt};
use crate::error::SfelError;
use crate::format::header::{CipherAlgorithm, EncryptionMode, SfelHeader, MAX_NAME_LEN};
use crate::format::validation::{validate_password, validate_source_and_dest};
use crate::fs::archive::{create_folder_tar, make_folder_archive_name};
use crate::fs::temp::TempFileGuard;

/// Payload emitted during encryption progress updates.
#[derive(Debug, Clone, Serialize)]
pub struct ProgressPayload {
    pub percent: f64,
    pub bytes_processed: u64,
    pub total_bytes: u64,
}

/// Core file encryption engine with default (Standard) parameters.
pub fn encrypt_file<P>(
    source_path: &Path,
    password: &str,
    dest_dir: &Path,
    progress: P,
) -> Result<PathBuf, SfelError>
where
    P: FnMut(f64, u64, u64),
{
    encrypt_file_with_profile(source_path, password, dest_dir, None, progress)
}

/// Core file encryption engine with configurable Argon2id profile.
pub fn encrypt_file_with_profile<P>(
    source_path: &Path,
    password: &str,
    dest_dir: &Path,
    profile: Option<Argon2Profile>,
    progress: P,
) -> Result<PathBuf, SfelError>
where
    P: FnMut(f64, u64, u64),
{
    encrypt_file_with_options(source_path, password, dest_dir, profile, None, None, progress)
}

/// Core file encryption engine with configurable Argon2id profile, AEAD cipher algorithm,
/// and optional keyfile path.
pub fn encrypt_file_with_options<P>(
    source_path: &Path,
    password: &str,
    dest_dir: &Path,
    profile: Option<Argon2Profile>,
    cipher: Option<CipherAlgorithm>,
    keyfile_path: Option<&Path>,
    mut progress: P,
) -> Result<PathBuf, SfelError>
where
    P: FnMut(f64, u64, u64),
{
    // 1. Validate inputs (accepts both a regular file and a directory)
    validate_source_and_dest(source_path, dest_dir)?;
    validate_password(password)?;

    let raw_name = source_path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| SfelError::InvalidParameters("Invalid source filename".into()))?
        .to_string();

    let dest_filename = format!("{raw_name}.sfel");
    let dest_path = dest_dir.join(dest_filename);

    if dest_path.exists() {
        return Err(SfelError::FileAlreadyExists(dest_path.display().to_string()));
    }

    // Reset cancellation state before starting
    reset_cancel();

    // 2. Prepare payload source (either direct file or temporary TAR archive for a directory)
    let is_directory = source_path.is_dir();
    let mut temp_tar_guard: Option<TempFileGuard> = None;

    let (mut source_file, total_bytes, original_name) = if is_directory {
        let archive_header_name = make_folder_archive_name(&raw_name, MAX_NAME_LEN);
        let mut tar_guard = TempFileGuard::create_in_same_dir(&dest_path)?;
        create_folder_tar(source_path, tar_guard.file_mut()?)?;
        tar_guard.file_mut()?.flush()?;
        tar_guard.file_mut()?.seek(SeekFrom::Start(0))?;
        let len = tar_guard.file_mut()?.metadata()?.len();
        let read_handle = File::open(tar_guard.path())?;
        temp_tar_guard = Some(tar_guard);
        (read_handle, len, archive_header_name)
    } else {
        let f = File::open(source_path)?;
        let len = f.metadata()?.len();
        (f, len, raw_name)
    };

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

    let kdf_profile = profile.unwrap_or_default();
    let kdf_params = kdf_profile.params();
    let cipher_algo = cipher.unwrap_or_default();

    let header = SfelHeader::new_with_cipher(
        mode,
        cipher_algo,
        kdf_params.memory_kib,
        kdf_params.iterations,
        kdf_params.parallelism,
        salt,
        nonce,
        total_bytes,
        original_name,
    );

    let header_bytes = header.to_bytes()?;

    // 4. Derive encryption key using Argon2id (combining password and optional keyfile)
    let combined_secret = combine_password_and_keyfile(password, keyfile_path)?;
    let key = derive_key(&combined_secret, &salt, &kdf_params)?;

    // 5. Initialize temp file in target directory for atomic write
    let mut temp = TempFileGuard::create_in_same_dir(&dest_path)?;

    // Write 128-byte header
    temp.file_mut()?.write_all(&header_bytes)?;

    // 6. Perform encryption based on selected mode and cipher
    if is_single_mode {
        if is_cancelled() {
            return Err(SfelError::Cancelled);
        }

        let mut plaintext = Vec::with_capacity(total_bytes as usize);
        std::io::Read::read_to_end(&mut source_file, &mut plaintext)?;
        let mut ciphertext =
            encrypt_single_with_cipher(cipher_algo, &key, &nonce, &header_bytes, &plaintext)?;
        plaintext.zeroize();

        temp.file_mut()?.write_all(&ciphertext)?;
        ciphertext.zeroize();
        drop(source_file);

        progress(100.0, total_bytes, total_bytes);
    } else {
        encrypt_stream_with_cipher(
            cipher_algo,
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

    // Clean up temporary TAR archive if source was a directory
    drop(temp_tar_guard);

    // 7. Atomically persist temp file to final destination
    temp.persist_to(&dest_path)?;

    Ok(dest_path)
}

/// Tauri command handler for file encryption with optional Argon2id profile, cipher algorithm, and keyfile.
#[tauri::command]
pub fn cmd_encrypt(
    app: AppHandle,
    source_path: String,
    mut password: String,
    dest_dir: String,
    profile: Option<String>,
    cipher: Option<String>,
    keyfile_path: Option<String>,
) -> Result<String, SfelError> {
    let kdf_profile = Argon2Profile::from_str_opt(profile.as_deref());
    let cipher_algo = CipherAlgorithm::from_str_opt(cipher.as_deref());
    let kf_path = keyfile_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(Path::new);

    let result = encrypt_file_with_options(
        Path::new(&source_path),
        &password,
        Path::new(&dest_dir),
        Some(kdf_profile),
        Some(cipher_algo),
        kf_path,
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
