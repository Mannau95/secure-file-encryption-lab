use argon2::{Algorithm, Argon2, Params, Version};
use zeroize::Zeroizing;

use crate::error::SfelError;

/// Default Argon2id memory cost in KiB (64 MiB).
pub const DEFAULT_MEMORY_KIB: u32 = 65_536;

/// Default Argon2id iteration count (time cost).
pub const DEFAULT_ITERATIONS: u32 = 3;

/// Default Argon2id parallelism degree (lanes).
pub const DEFAULT_PARALLELISM: u32 = 4;

/// Required salt length in bytes (128 bits).
pub const SALT_LEN: usize = 16;

/// Derived key output length in bytes (256 bits).
pub const KEY_LEN: usize = 32;

/// Configuration parameters for Argon2id key derivation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KdfParams {
    pub memory_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
}

impl Default for KdfParams {
    fn default() -> Self {
        Self {
            memory_kib: DEFAULT_MEMORY_KIB,
            iterations: DEFAULT_ITERATIONS,
            parallelism: DEFAULT_PARALLELISM,
        }
    }
}

/// Derives a 256-bit cryptographic key from a password and salt using Argon2id.
///
/// The returned key is wrapped in `Zeroizing` to ensure memory is wiped securely
/// when dropped.
pub fn derive_key(
    password: &[u8],
    salt: &[u8; SALT_LEN],
    params: &KdfParams,
) -> Result<Zeroizing<[u8; KEY_LEN]>, SfelError> {
    let argon2_params = Params::new(
        params.memory_kib,
        params.iterations,
        params.parallelism,
        Some(KEY_LEN),
    )
    .map_err(|e| SfelError::InvalidParameters(format!("Argon2 params error: {e}")))?;

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, argon2_params);
    let mut key = Zeroizing::new([0u8; KEY_LEN]);

    argon2
        .hash_password_into(password, salt, key.as_mut())
        .map_err(|e| SfelError::InvalidParameters(format!("KDF error: {e}")))?;

    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Fast parameters for testing purposes
    const TEST_PARAMS: KdfParams = KdfParams {
        memory_kib: 8192,
        iterations: 1,
        parallelism: 1,
    };

    #[test]
    fn test_kdf_deterministic() {
        let password = b"correct horse battery staple";
        let salt = [42u8; 16];

        let key1 = derive_key(password, &salt, &TEST_PARAMS).unwrap();
        let key2 = derive_key(password, &salt, &TEST_PARAMS).unwrap();

        assert_eq!(*key1, *key2);
        assert_ne!(*key1, [0u8; 32]);
    }

    #[test]
    fn test_kdf_different_passwords() {
        let salt = [42u8; 16];

        let key1 = derive_key(b"password123", &salt, &TEST_PARAMS).unwrap();
        let key2 = derive_key(b"password124", &salt, &TEST_PARAMS).unwrap();

        assert_ne!(*key1, *key2);
    }

    #[test]
    fn test_kdf_different_salts() {
        let password = b"secure_pass";
        let salt1 = [1u8; 16];
        let salt2 = [2u8; 16];

        let key1 = derive_key(password, &salt1, &TEST_PARAMS).unwrap();
        let key2 = derive_key(password, &salt2, &TEST_PARAMS).unwrap();

        assert_ne!(*key1, *key2);
    }

    #[test]
    fn test_kdf_invalid_params() {
        let invalid_params = KdfParams {
            memory_kib: 1, // too small for Argon2
            iterations: 0,
            parallelism: 0,
        };
        let salt = [0u8; 16];
        let result = derive_key(b"pass", &salt, &invalid_params);
        assert!(result.is_err());
    }
}
