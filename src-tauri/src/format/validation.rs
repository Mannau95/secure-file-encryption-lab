use std::path::Path;

use crate::crypto::aead::SINGLE_MODE_MAX_SIZE;
use crate::error::SfelError;
use crate::format::header::{EncryptionMode, SfelHeader, MAX_NAME_LEN};

/// Minimum allowed Argon2 memory in KiB (8 MiB).
pub const MIN_ARGON2_MEMORY_KIB: u32 = 8_192;

/// Maximum allowed Argon2 memory in KiB (4 GiB).
pub const MAX_ARGON2_MEMORY_KIB: u32 = 4_194_304;

/// Minimum allowed Argon2 iterations (t_cost).
pub const MIN_ARGON2_ITERATIONS: u32 = 1;

/// Maximum allowed Argon2 iterations (t_cost).
pub const MAX_ARGON2_ITERATIONS: u32 = 100;

/// Minimum allowed Argon2 parallelism (p_cost).
pub const MIN_ARGON2_PARALLELISM: u32 = 1;

/// Maximum allowed Argon2 parallelism (p_cost).
pub const MAX_ARGON2_PARALLELISM: u32 = 16;

/// Maximum specification-level filename length (1024 bytes).
pub const MAX_SPEC_NAME_LEN: usize = 1024;

/// Maximum filename length inside the 128-byte fixed header (72 bytes).
pub const MAX_HEADER_NAME_LEN: usize = MAX_NAME_LEN;

/// Maximum supported file size (4 TiB = 4 * 1024^4 bytes).
pub const MAX_FILE_SIZE: u64 = 4 * 1024 * 1024 * 1024 * 1024;

/// Validates that Argon2 memory cost is within [8192, 4194304] KiB.
pub fn validate_argon2_memory(kib: u32) -> Result<(), SfelError> {
    if !(MIN_ARGON2_MEMORY_KIB..=MAX_ARGON2_MEMORY_KIB).contains(&kib) {
        return Err(SfelError::InvalidParameters(format!(
            "Argon2 memory {} KiB outside valid range ({}..={})",
            kib, MIN_ARGON2_MEMORY_KIB, MAX_ARGON2_MEMORY_KIB
        )));
    }
    Ok(())
}

/// Validates that Argon2 iteration count is within [1, 100].
pub fn validate_argon2_iterations(iterations: u32) -> Result<(), SfelError> {
    if !(MIN_ARGON2_ITERATIONS..=MAX_ARGON2_ITERATIONS).contains(&iterations) {
        return Err(SfelError::InvalidParameters(format!(
            "Argon2 iterations {} outside valid range ({}..={})",
            iterations, MIN_ARGON2_ITERATIONS, MAX_ARGON2_ITERATIONS
        )));
    }
    Ok(())
}

/// Validates that Argon2 parallelism is within [1, 16].
pub fn validate_argon2_parallelism(parallelism: u32) -> Result<(), SfelError> {
    if !(MIN_ARGON2_PARALLELISM..=MAX_ARGON2_PARALLELISM).contains(&parallelism) {
        return Err(SfelError::InvalidParameters(format!(
            "Argon2 parallelism {} outside valid range ({}..={})",
            parallelism, MIN_ARGON2_PARALLELISM, MAX_ARGON2_PARALLELISM
        )));
    }
    Ok(())
}

/// Validates all Argon2 parameters together.
pub fn validate_argon2_params(memory: u32, iterations: u32, parallelism: u32) -> Result<(), SfelError> {
    validate_argon2_memory(memory)?;
    validate_argon2_iterations(iterations)?;
    validate_argon2_parallelism(parallelism)?;
    Ok(())
}

/// Validates that a filename byte length is within specification bounds (0..=1024).
pub fn validate_name_length(len: usize) -> Result<(), SfelError> {
    if len > MAX_SPEC_NAME_LEN {
        return Err(SfelError::InvalidParameters(format!(
            "Original name length {} exceeds maximum allowed ({} bytes)",
            len, MAX_SPEC_NAME_LEN
        )));
    }
    Ok(())
}

/// Validates that a filename byte length fits within the 128-byte header (0..=72).
pub fn validate_header_name_length(len: usize) -> Result<(), SfelError> {
    if len > MAX_HEADER_NAME_LEN {
        return Err(SfelError::InvalidParameters(format!(
            "Header original name length {} exceeds maximum header capacity of {} bytes",
            len, MAX_HEADER_NAME_LEN
        )));
    }
    Ok(())
}

/// Validates that a file size is within supported limits (up to 4 TiB).
pub fn validate_file_size(size: u64) -> Result<(), SfelError> {
    if size > MAX_FILE_SIZE {
        return Err(SfelError::InvalidParameters(format!(
            "File size {} exceeds maximum supported 4 TiB limit",
            size
        )));
    }
    Ok(())
}

/// Validates that an input password meets basic operational requirements.
pub fn validate_password(password: &str) -> Result<(), SfelError> {
    if password.is_empty() {
        return Err(SfelError::InvalidParameters(
            "Password cannot be empty".to_string(),
        ));
    }
    Ok(())
}

/// Validates all fields of an `SfelHeader` against container constraints.
pub fn validate_header(header: &SfelHeader) -> Result<(), SfelError> {
    validate_argon2_params(
        header.argon2_memory,
        header.argon2_iterations,
        header.argon2_parallelism,
    )?;
    validate_file_size(header.original_file_size)?;
    validate_header_name_length(header.original_name.as_bytes().len())?;

    match header.mode {
        EncryptionMode::Single => {
            if header.original_file_size > SINGLE_MODE_MAX_SIZE {
                return Err(SfelError::InvalidParameters(format!(
                    "Single mode file size {} exceeds maximum 1 MiB limit",
                    header.original_file_size
                )));
            }
        }
        EncryptionMode::Chunked => {
            if &header.nonce[7..12] != &[0u8; 5] {
                return Err(SfelError::InvalidFormat);
            }
        }
    }

    Ok(())
}

/// Validates source file and destination directory paths.
pub fn validate_paths(source_path: &Path, dest_dir: &Path) -> Result<(), SfelError> {
    if !source_path.exists() {
        return Err(SfelError::FileNotFound(source_path.display().to_string()));
    }
    if !source_path.is_file() {
        return Err(SfelError::InvalidParameters(format!(
            "Source path '{}' is not a regular file",
            source_path.display()
        )));
    }
    if !dest_dir.exists() {
        return Err(SfelError::FileNotFound(dest_dir.display().to_string()));
    }
    if !dest_dir.is_dir() {
        return Err(SfelError::InvalidParameters(format!(
            "Destination path '{}' is not a directory",
            dest_dir.display()
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_params_pass() {
        assert!(validate_argon2_memory(65536).is_ok());
        assert!(validate_argon2_iterations(3).is_ok());
        assert!(validate_argon2_parallelism(4).is_ok());
        assert!(validate_name_length(100).is_ok());
        assert!(validate_file_size(10_000).is_ok());
    }

    #[test]
    fn test_argon2_memory_bounds() {
        assert!(validate_argon2_memory(MIN_ARGON2_MEMORY_KIB).is_ok());
        assert!(validate_argon2_memory(MAX_ARGON2_MEMORY_KIB).is_ok());
        assert!(validate_argon2_memory(MIN_ARGON2_MEMORY_KIB - 1).is_err());
        assert!(validate_argon2_memory(MAX_ARGON2_MEMORY_KIB + 1).is_err());
    }

    #[test]
    fn test_argon2_iterations_bounds() {
        assert!(validate_argon2_iterations(MIN_ARGON2_ITERATIONS).is_ok());
        assert!(validate_argon2_iterations(MAX_ARGON2_ITERATIONS).is_ok());
        assert!(validate_argon2_iterations(0).is_err());
        assert!(validate_argon2_iterations(101).is_err());
    }

    #[test]
    fn test_argon2_parallelism_bounds() {
        assert!(validate_argon2_parallelism(MIN_ARGON2_PARALLELISM).is_ok());
        assert!(validate_argon2_parallelism(MAX_ARGON2_PARALLELISM).is_ok());
        assert!(validate_argon2_parallelism(0).is_err());
        assert!(validate_argon2_parallelism(17).is_err());
    }

    #[test]
    fn test_name_length_bounds() {
        assert!(validate_name_length(0).is_ok());
        assert!(validate_name_length(1024).is_ok());
        assert!(validate_name_length(1025).is_err());
        assert!(validate_header_name_length(72).is_ok());
        assert!(validate_header_name_length(73).is_err());
    }

    #[test]
    fn test_file_size_bounds() {
        assert!(validate_file_size(0).is_ok());
        assert!(validate_file_size(MAX_FILE_SIZE).is_ok());
        assert!(validate_file_size(MAX_FILE_SIZE + 1).is_err());
    }

    #[test]
    fn test_validate_header() {
        let mut header = SfelHeader::new(
            EncryptionMode::Single,
            65536,
            3,
            4,
            [0; 16],
            [0; 12],
            500,
            "test.txt".to_string(),
        );
        assert!(validate_header(&header).is_ok());

        // Single mode size > 1 MiB should fail
        header.original_file_size = SINGLE_MODE_MAX_SIZE + 1;
        assert!(validate_header(&header).is_err());

        // Chunked mode with non-zero padding in nonce should fail
        header.mode = EncryptionMode::Chunked;
        header.nonce[10] = 0xFF;
        assert!(validate_header(&header).is_err());
    }
}
