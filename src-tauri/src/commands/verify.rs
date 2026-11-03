use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};
use zeroize::Zeroize;

use crate::commands::cancel::{is_cancelled, reset_cancel};
use crate::commands::decrypt::ProgressPayload;
use crate::crypto::aead::{decrypt_single_with_cipher, HEADER_SIZE, TAG_LEN};
use crate::crypto::chunks::{calculate_chunk_count, decrypt_stream_with_cipher};
use crate::crypto::hash::compute_sha256_file;
use crate::crypto::kdf::{combine_password_and_keyfile, derive_key, KdfParams};
use crate::error::SfelError;
use crate::format::header::{CipherAlgorithm, EncryptionMode, SfelHeader, MAGIC};
use crate::format::validation::{validate_header, validate_password};
use crate::fs::archive::strip_folder_archive_suffix;

/// Detailed metadata extracted from an `.sfel` 128-byte binary header without requiring a password.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SfelContainerInspection {
    pub is_sfel_magic: bool,
    pub header_valid: bool,
    pub size_consistent: bool,
    pub expected_container_size: u64,
    pub version: u8,
    pub cipher: String,
    pub mode: String,
    pub total_chunks: u32,
    pub argon2_memory_kib: u32,
    pub argon2_iterations: u32,
    pub argon2_parallelism: u32,
    pub argon2_profile_label: String,
    pub salt_hex: String,
    pub nonce_hex: String,
    pub original_file_size: u64,
    pub original_name: String,
    pub is_folder_archive: bool,
    pub validation_error: Option<String>,
}

/// Result of inspecting any file on disk (SHA-256 + optional `.sfel` header breakdown).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileIntegrityReport {
    pub file_path: String,
    pub file_name: String,
    pub file_size: u64,
    pub sha256: String,
    pub sfel_info: Option<SfelContainerInspection>,
}

/// Result of a full cryptographic dry-run verification of an `.sfel` container (zero disk writes).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SfelDryRunVerifyResult {
    pub authentic: bool,
    pub cipher: String,
    pub mode: String,
    pub chunks_verified: u32,
    pub original_file_size: u64,
    pub original_name: String,
    pub is_folder_archive: bool,
    pub container_sha256: String,
    pub plaintext_sha256: String,
}

/// Streaming writer that hashes all incoming bytes with SHA-256 in memory and discards them
/// without ever writing plaintext to disk.
struct Sha256SinkWriter {
    hasher: Sha256,
    bytes_written: u64,
}

impl Sha256SinkWriter {
    fn new() -> Self {
        Self {
            hasher: Sha256::new(),
            bytes_written: 0,
        }
    }

    fn finalize_hex(self) -> (String, u64) {
        let digest = self.hasher.finalize();
        let mut hex = String::with_capacity(64);
        for b in digest {
            use std::fmt::Write as FmtWrite;
            let _ = write!(&mut hex, "{b:02x}");
        }
        (hex, self.bytes_written)
    }
}

impl Write for Sha256SinkWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.hasher.update(buf);
        self.bytes_written += buf.len() as u64;
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

fn to_hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        use std::fmt::Write as FmtWrite;
        let _ = write!(&mut out, "{b:02x}");
    }
    out
}

fn classify_argon2_profile(mem_kib: u32, iterations: u32, parallelism: u32) -> String {
    match (mem_kib, iterations, parallelism) {
        (32_768, 2, 2) => "Fast (32 MiB, t=2, p=2)".to_string(),
        (65_536, 3, 4) => "Standard (64 MiB, t=3, p=4)".to_string(),
        (262_144, 5, 8) => "Paranoid (256 MiB, t=5, p=8)".to_string(),
        _ => format!("Custom ({} MiB, t={}, p={})", mem_kib / 1024, iterations, parallelism),
    }
}

/// Computes a file's SHA-256 fingerprint and, if it is an `.sfel` container (by magic bytes or `.sfel` extension),
/// parses and validates its 128-byte binary header without needing the password.
pub fn inspect_file_integrity(path: &Path) -> Result<FileIntegrityReport, SfelError> {
    if !path.exists() || !path.is_file() {
        return Err(SfelError::InvalidParameters(format!(
            "File does not exist: {}",
            path.display()
        )));
    }

    let metadata = path.metadata()?;
    let file_size = metadata.len();
    let file_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();

    let sha256 = compute_sha256_file(path)?;

    // Check if file starts with "SFEL" magic or has .sfel extension
    let has_sfel_ext = file_name.to_ascii_lowercase().ends_with(".sfel");
    let mut file = File::open(path)?;
    let mut prefix = [0u8; HEADER_SIZE];
    let bytes_read = file.read(&mut prefix)?;
    let starts_with_magic = bytes_read >= 4 && prefix[0..4] == MAGIC;

    let sfel_info = if starts_with_magic || has_sfel_ext {
        if bytes_read < HEADER_SIZE {
            Some(SfelContainerInspection {
                is_sfel_magic: starts_with_magic,
                header_valid: false,
                size_consistent: false,
                expected_container_size: HEADER_SIZE as u64,
                version: if bytes_read >= 5 { prefix[4] } else { 0 },
                cipher: "Unknown".to_string(),
                mode: "Unknown".to_string(),
                total_chunks: 0,
                argon2_memory_kib: 0,
                argon2_iterations: 0,
                argon2_parallelism: 0,
                argon2_profile_label: "Unknown".to_string(),
                salt_hex: String::new(),
                nonce_hex: String::new(),
                original_file_size: 0,
                original_name: String::new(),
                is_folder_archive: false,
                validation_error: Some("Truncated file: shorter than 128-byte SFEL header".to_string()),
            })
        } else {
            match SfelHeader::from_bytes(&prefix) {
                Ok(header) => {
                    let validation_res = validate_header(&header);
                    let total_chunks = match header.mode {
                        EncryptionMode::Single => 1,
                        EncryptionMode::Chunked => calculate_chunk_count(header.original_file_size),
                    };
                    let expected_size = match header.mode {
                        EncryptionMode::Single => (HEADER_SIZE as u64)
                            .saturating_add(header.original_file_size)
                            .saturating_add(TAG_LEN as u64),
                        EncryptionMode::Chunked => (HEADER_SIZE as u64)
                            .saturating_add(header.original_file_size)
                            .saturating_add((total_chunks as u64) * (TAG_LEN as u64)),
                    };
                    let size_consistent = file_size == expected_size;
                    let validation_error = if let Err(e) = &validation_res {
                        Some(e.to_string())
                    } else if !size_consistent {
                        Some(format!(
                            "Container size mismatch: actual {} bytes vs expected {} bytes",
                            file_size, expected_size
                        ))
                    } else {
                        None
                    };

                    let is_folder_archive = strip_folder_archive_suffix(&header.original_name).is_some();
                    let display_name = strip_folder_archive_suffix(&header.original_name)
                        .unwrap_or(&header.original_name)
                        .to_string();

                    Some(SfelContainerInspection {
                        is_sfel_magic: true,
                        header_valid: validation_res.is_ok(),
                        size_consistent,
                        expected_container_size: expected_size,
                        version: header.version,
                        cipher: match header.cipher {
                            CipherAlgorithm::Aes256Gcm => "AES-256-GCM".to_string(),
                            CipherAlgorithm::Chacha20Poly1305 => "ChaCha20-Poly1305".to_string(),
                        },
                        mode: match header.mode {
                            EncryptionMode::Single => "Single (<= 1 MiB)".to_string(),
                            EncryptionMode::Chunked => "Chunked (1 MiB blocks)".to_string(),
                        },
                        total_chunks,
                        argon2_memory_kib: header.argon2_memory,
                        argon2_iterations: header.argon2_iterations,
                        argon2_parallelism: header.argon2_parallelism,
                        argon2_profile_label: classify_argon2_profile(
                            header.argon2_memory,
                            header.argon2_iterations,
                            header.argon2_parallelism,
                        ),
                        salt_hex: to_hex(&header.salt),
                        nonce_hex: to_hex(&header.nonce),
                        original_file_size: header.original_file_size,
                        original_name: display_name,
                        is_folder_archive,
                        validation_error,
                    })
                }
                Err(err) => Some(SfelContainerInspection {
                    is_sfel_magic: starts_with_magic,
                    header_valid: false,
                    size_consistent: false,
                    expected_container_size: 0,
                    version: prefix[4],
                    cipher: "Invalid".to_string(),
                    mode: "Invalid".to_string(),
                    total_chunks: 0,
                    argon2_memory_kib: 0,
                    argon2_iterations: 0,
                    argon2_parallelism: 0,
                    argon2_profile_label: "Invalid".to_string(),
                    salt_hex: String::new(),
                    nonce_hex: String::new(),
                    original_file_size: 0,
                    original_name: String::new(),
                    is_folder_archive: false,
                    validation_error: Some(err.to_string()),
                }),
            }
        }
    } else {
        None
    };

    Ok(FileIntegrityReport {
        file_path: path.display().to_string(),
        file_name,
        file_size,
        sha256,
        sfel_info,
    })
}

/// Performs a full cryptographic verification of an `.sfel` container in memory (dry-run)
/// without writing any decrypted output to disk, and returns the SHA-256 of the verified plaintext.
pub fn verify_sfel_container_dry_run<P>(
    source_path: &Path,
    password: &str,
    keyfile_path: Option<&Path>,
    mut progress: P,
) -> Result<SfelDryRunVerifyResult, SfelError>
where
    P: FnMut(f64, u64, u64),
{
    if !source_path.exists() || !source_path.is_file() {
        return Err(SfelError::InvalidParameters(format!(
            "Source file does not exist: {}",
            source_path.display()
        )));
    }
    validate_password(password)?;
    reset_cancel();

    let container_sha256 = compute_sha256_file(source_path)?;

    let mut source_file = File::open(source_path)?;
    let file_len = source_file.metadata()?.len();
    if file_len < HEADER_SIZE as u64 {
        return Err(SfelError::TruncatedFile);
    }

    let mut header_bytes = [0u8; HEADER_SIZE];
    source_file.read_exact(&mut header_bytes)?;

    let header = SfelHeader::from_bytes(&header_bytes)?;
    validate_header(&header)?;

    let total_chunks = match header.mode {
        EncryptionMode::Single => 1,
        EncryptionMode::Chunked => calculate_chunk_count(header.original_file_size),
    };

    let expected_file_size = match header.mode {
        EncryptionMode::Single => (HEADER_SIZE as u64)
            .checked_add(header.original_file_size)
            .and_then(|s| s.checked_add(TAG_LEN as u64))
            .ok_or_else(|| SfelError::InvalidParameters("File size overflow".into()))?,
        EncryptionMode::Chunked => (HEADER_SIZE as u64)
            .checked_add(header.original_file_size)
            .and_then(|s| s.checked_add((total_chunks as u64) * (TAG_LEN as u64)))
            .ok_or_else(|| SfelError::InvalidParameters("File size overflow".into()))?,
    };

    if file_len < expected_file_size {
        return Err(SfelError::TruncatedFile);
    }
    if file_len > expected_file_size {
        return Err(SfelError::IntegrityError);
    }

    let kdf_params = KdfParams {
        memory_kib: header.argon2_memory,
        iterations: header.argon2_iterations,
        parallelism: header.argon2_parallelism,
    };
    let combined_secret = combine_password_and_keyfile(password, keyfile_path)?;
    let key = derive_key(&combined_secret, &header.salt, &kdf_params)?;

    let mut sink = Sha256SinkWriter::new();

    match header.mode {
        EncryptionMode::Single => {
            if is_cancelled() {
                return Err(SfelError::Cancelled);
            }
            let cipher_len = (header.original_file_size as usize) + TAG_LEN;
            let mut cipher_buf = vec![0u8; cipher_len];
            source_file.read_exact(&mut cipher_buf)?;

            let mut plaintext = decrypt_single_with_cipher(
                header.cipher,
                &key,
                &header.nonce,
                &header_bytes,
                &cipher_buf,
            )?;
            cipher_buf.zeroize();

            if plaintext.len() as u64 != header.original_file_size {
                plaintext.zeroize();
                return Err(SfelError::IntegrityError);
            }

            sink.write_all(&plaintext)?;
            plaintext.zeroize();
            progress(100.0, header.original_file_size, header.original_file_size);
        }
        EncryptionMode::Chunked => {
            let base_nonce = header.base_nonce();
            decrypt_stream_with_cipher(
                header.cipher,
                source_file,
                &mut sink,
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

    let (plaintext_sha256, verified_bytes) = sink.finalize_hex();
    if verified_bytes != header.original_file_size {
        return Err(SfelError::IntegrityError);
    }

    let is_folder_archive = strip_folder_archive_suffix(&header.original_name).is_some();
    let display_name = strip_folder_archive_suffix(&header.original_name)
        .unwrap_or(&header.original_name)
        .to_string();

    Ok(SfelDryRunVerifyResult {
        authentic: true,
        cipher: match header.cipher {
            CipherAlgorithm::Aes256Gcm => "AES-256-GCM".to_string(),
            CipherAlgorithm::Chacha20Poly1305 => "ChaCha20-Poly1305".to_string(),
        },
        mode: match header.mode {
            EncryptionMode::Single => "Single".to_string(),
            EncryptionMode::Chunked => "Chunked".to_string(),
        },
        chunks_verified: total_chunks,
        original_file_size: header.original_file_size,
        original_name: display_name,
        is_folder_archive,
        container_sha256,
        plaintext_sha256,
    })
}

/// Tauri command: inspects a file's SHA-256 and optional `.sfel` binary header without a password.
#[tauri::command]
pub fn cmd_inspect_file_integrity(path: String) -> Result<FileIntegrityReport, SfelError> {
    inspect_file_integrity(Path::new(&path))
}

/// Tauri command: performs a full dry-run cryptographic verification of an `.sfel` container.
#[tauri::command]
pub fn cmd_verify_sfel_container(
    app: AppHandle,
    source_path: String,
    mut password: String,
    keyfile_path: Option<String>,
) -> Result<SfelDryRunVerifyResult, SfelError> {
    let kf_path = keyfile_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(Path::new);

    let result = verify_sfel_container_dry_run(
        Path::new(&source_path),
        &password,
        kf_path,
        |percent, bytes_processed, total_bytes| {
            let payload = ProgressPayload {
                percent,
                bytes_processed,
                total_bytes,
            };
            let _ = app.emit("verify-progress", &payload);
        },
    );

    password.zeroize();
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::encrypt::encrypt_file_with_options;
    use crate::crypto::kdf::Argon2Profile;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_inspect_and_dry_run_verify_sfel_container() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("contract.pdf");
        let enc_dir = dir.path().join("enc");
        fs::create_dir(&enc_dir).unwrap();
        fs::write(&src, b"Confidential contract payload for dry-run verification").unwrap();

        let original_sha = compute_sha256_file(&src).unwrap();

        let enc_path = encrypt_file_with_options(
            &src,
            "verify_pass_123",
            &enc_dir,
            Some(Argon2Profile::Fast),
            Some(CipherAlgorithm::Chacha20Poly1305),
            None,
            |_, _, _| {},
        )
        .unwrap();

        // 1. Inspect without password
        let report = inspect_file_integrity(&enc_path).unwrap();
        let sfel = report.sfel_info.expect("Should detect SFEL header");
        assert!(sfel.is_sfel_magic);
        assert!(sfel.header_valid);
        assert!(sfel.size_consistent);
        assert_eq!(sfel.cipher, "ChaCha20-Poly1305");
        assert_eq!(sfel.original_name, "contract.pdf");

        // 2. Dry-run verify with correct password -> matches original plaintext SHA-256 without writing to disk
        let dry_run = verify_sfel_container_dry_run(&enc_path, "verify_pass_123", None, |_, _, _| {}).unwrap();
        assert!(dry_run.authentic);
        assert_eq!(dry_run.plaintext_sha256, original_sha);
        assert_eq!(dry_run.container_sha256, report.sha256);

        // 3. Dry-run verify with wrong password -> fails with AuthenticationFailed
        let bad_res = verify_sfel_container_dry_run(&enc_path, "wrong_password", None, |_, _, _| {});
        assert_eq!(bad_res.err(), Some(SfelError::AuthenticationFailed));
    }
}
