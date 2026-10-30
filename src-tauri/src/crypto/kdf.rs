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

/// Configurable Argon2id security profiles for encryption.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Argon2Profile {
    /// Fast / Low-Resource profile: 32 MiB, 2 iterations, 2 lanes.
    Fast,
    /// Standard profile (default): 64 MiB, 3 iterations, 4 lanes.
    Standard,
    /// Paranoid / High-Security profile: 256 MiB, 5 iterations, 8 lanes.
    Paranoid,
}

impl Argon2Profile {
    pub fn params(&self) -> KdfParams {
        match self {
            Argon2Profile::Fast => KdfParams {
                memory_kib: 32_768,
                iterations: 2,
                parallelism: 2,
            },
            Argon2Profile::Standard => KdfParams {
                memory_kib: DEFAULT_MEMORY_KIB,
                iterations: DEFAULT_ITERATIONS,
                parallelism: DEFAULT_PARALLELISM,
            },
            Argon2Profile::Paranoid => KdfParams {
                memory_kib: 262_144,
                iterations: 5,
                parallelism: 8,
            },
        }
    }

    pub fn from_str_opt(s: Option<&str>) -> Self {
        match s.map(|v| v.to_ascii_lowercase()).as_deref() {
            Some("fast") => Argon2Profile::Fast,
            Some("paranoid") => Argon2Profile::Paranoid,
            _ => Argon2Profile::Standard,
        }
    }
}

impl Default for Argon2Profile {
    fn default() -> Self {
        Argon2Profile::Standard
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

    #[test]
    fn test_argon2_profiles() {
        assert_eq!(Argon2Profile::from_str_opt(Some("fast")), Argon2Profile::Fast);
        assert_eq!(Argon2Profile::from_str_opt(Some("standard")), Argon2Profile::Standard);
        assert_eq!(Argon2Profile::from_str_opt(Some("paranoid")), Argon2Profile::Paranoid);
        assert_eq!(Argon2Profile::from_str_opt(None), Argon2Profile::Standard);
        assert_eq!(Argon2Profile::from_str_opt(Some("unknown")), Argon2Profile::Standard);

        let fast_params = Argon2Profile::Fast.params();
        assert_eq!(fast_params.memory_kib, 32_768);
        assert_eq!(fast_params.iterations, 2);

        let standard_params = Argon2Profile::Standard.params();
        assert_eq!(standard_params.memory_kib, 65_536);
        assert_eq!(standard_params.iterations, 3);

        let paranoid_params = Argon2Profile::Paranoid.params();
        assert_eq!(paranoid_params.memory_kib, 262_144);
        assert_eq!(paranoid_params.iterations, 5);
    }
}
