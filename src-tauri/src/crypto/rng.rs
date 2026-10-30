use rand::TryRngCore;
use rand::rngs::OsRng;

/// Fills the given destination slice with cryptographically secure random bytes
/// retrieved directly from the operating system's CSPRNG (OsRng).
pub fn fill_random(dest: &mut [u8]) {
    OsRng.try_fill_bytes(dest).expect("failed to read from OS CSPRNG");
}

/// Generates a fixed-size array of cryptographically secure random bytes.
pub fn random_bytes<const N: usize>() -> [u8; N] {
    let mut bytes = [0u8; N];
    fill_random(&mut bytes);
    bytes
}

/// Generates a 16-byte random salt for Argon2id key derivation.
pub fn random_salt() -> [u8; 16] {
    random_bytes::<16>()
}

/// Generates a 12-byte (96-bit) random nonce for single-mode AES-256-GCM.
pub fn random_nonce() -> [u8; 12] {
    random_bytes::<12>()
}

/// Generates a 7-byte (56-bit) base nonce for chunked-mode AES-256-GCM.
pub fn random_base_nonce() -> [u8; 7] {
    random_bytes::<7>()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_random_bytes_non_zero() {
        let bytes1 = random_bytes::<32>();
        let bytes2 = random_bytes::<32>();
        assert_ne!(bytes1, [0u8; 32]);
        assert_ne!(bytes1, bytes2);
    }

    #[test]
    fn test_random_salt_length_and_uniqueness() {
        let salt1 = random_salt();
        let salt2 = random_salt();
        assert_eq!(salt1.len(), 16);
        assert_ne!(salt1, salt2);
    }

    #[test]
    fn test_random_nonce_lengths() {
        let nonce = random_nonce();
        assert_eq!(nonce.len(), 12);
        let base_nonce = random_base_nonce();
        assert_eq!(base_nonce.len(), 7);
    }
}
