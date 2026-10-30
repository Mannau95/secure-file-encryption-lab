use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};

use crate::error::SfelError;

/// Maximum file size supported by single-mode encryption (1 MiB).
pub const SINGLE_MODE_MAX_SIZE: u64 = 1_048_576;

/// AES-GCM authentication tag length in bytes (128 bits).
pub const TAG_LEN: usize = 16;

/// AES-GCM nonce length in bytes (96 bits).
pub const NONCE_LEN: usize = 12;

/// AES-256 key length in bytes (256 bits).
pub const KEY_LEN: usize = 32;

/// Fixed SFEL header size in bytes.
pub const HEADER_SIZE: usize = 128;

/// Encrypts plaintext using AES-256-GCM in single mode.
///
/// The entire 128-byte header is bound as Additional Authenticated Data (AAD).
/// Returns `ciphertext || 16-byte authentication tag`.
pub fn encrypt_single(
    key: &[u8; KEY_LEN],
    nonce: &[u8; NONCE_LEN],
    header_bytes: &[u8; HEADER_SIZE],
    plaintext: &[u8],
) -> Result<Vec<u8>, SfelError> {
    let cipher = Aes256Gcm::new(key.into());
    let gcm_nonce = Nonce::from_slice(nonce);

    let payload = Payload {
        msg: plaintext,
        aad: header_bytes,
    };

    cipher
        .encrypt(gcm_nonce, payload)
        .map_err(|_| SfelError::IntegrityError)
}

/// Decrypts ciphertext and verifies the authentication tag using AES-256-GCM in single mode.
///
/// The entire 128-byte header is verified as Additional Authenticated Data (AAD).
/// Returns the decrypted plaintext on success.
pub fn decrypt_single(
    key: &[u8; KEY_LEN],
    nonce: &[u8; NONCE_LEN],
    header_bytes: &[u8; HEADER_SIZE],
    ciphertext_and_tag: &[u8],
) -> Result<Vec<u8>, SfelError> {
    if ciphertext_and_tag.len() < TAG_LEN {
        return Err(SfelError::TruncatedFile);
    }

    let cipher = Aes256Gcm::new(key.into());
    let gcm_nonce = Nonce::from_slice(nonce);

    let payload = Payload {
        msg: ciphertext_and_tag,
        aad: header_bytes,
    };

    cipher
        .decrypt(gcm_nonce, payload)
        .map_err(|_| SfelError::AuthenticationFailed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_single_roundtrip() {
        let key = [0x55u8; 32];
        let nonce = [0xAAu8; 12];
        let header = [0x11u8; 128];
        let plaintext = b"Hello world! Testing AES-256-GCM single mode encryption.";

        let encrypted = encrypt_single(&key, &nonce, &header, plaintext).unwrap();
        assert_eq!(encrypted.len(), plaintext.len() + TAG_LEN);

        let decrypted = decrypt_single(&key, &nonce, &header, &encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_single_empty_plaintext() {
        let key = [0x12u8; 32];
        let nonce = [0x34u8; 12];
        let header = [0x56u8; 128];
        let plaintext = b"";

        let encrypted = encrypt_single(&key, &nonce, &header, plaintext).unwrap();
        assert_eq!(encrypted.len(), TAG_LEN);

        let decrypted = decrypt_single(&key, &nonce, &header, &encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_single_tampered_ciphertext_fails() {
        let key = [0x77u8; 32];
        let nonce = [0x88u8; 12];
        let header = [0x99u8; 128];
        let plaintext = b"Sensitive payload";

        let mut encrypted = encrypt_single(&key, &nonce, &header, plaintext).unwrap();
        // Flip one bit in ciphertext
        encrypted[0] ^= 0x01;

        let result = decrypt_single(&key, &nonce, &header, &encrypted);
        assert_eq!(result, Err(SfelError::AuthenticationFailed));
    }

    #[test]
    fn test_single_tampered_tag_fails() {
        let key = [0x77u8; 32];
        let nonce = [0x88u8; 12];
        let header = [0x99u8; 128];
        let plaintext = b"Sensitive payload";

        let mut encrypted = encrypt_single(&key, &nonce, &header, plaintext).unwrap();
        // Flip bit in authentication tag (last 16 bytes)
        let last_idx = encrypted.len() - 1;
        encrypted[last_idx] ^= 0x01;

        let result = decrypt_single(&key, &nonce, &header, &encrypted);
        assert_eq!(result, Err(SfelError::AuthenticationFailed));
    }

    #[test]
    fn test_single_tampered_header_fails() {
        let key = [0x77u8; 32];
        let nonce = [0x88u8; 12];
        let header = [0x99u8; 128];
        let plaintext = b"Sensitive payload";

        let encrypted = encrypt_single(&key, &nonce, &header, plaintext).unwrap();

        // Alter header bytes (AAD mismatch)
        let mut tampered_header = header;
        tampered_header[0] ^= 0x01;

        let result = decrypt_single(&key, &nonce, &tampered_header, &encrypted);
        assert_eq!(result, Err(SfelError::AuthenticationFailed));
    }

    #[test]
    fn test_single_wrong_key_fails() {
        let key = [0x11u8; 32];
        let wrong_key = [0x22u8; 32];
        let nonce = [0x33u8; 12];
        let header = [0x44u8; 128];
        let plaintext = b"Important secret";

        let encrypted = encrypt_single(&key, &nonce, &header, plaintext).unwrap();
        let result = decrypt_single(&wrong_key, &nonce, &header, &encrypted);
        assert_eq!(result, Err(SfelError::AuthenticationFailed));
    }

    #[test]
    fn test_single_truncated_ciphertext() {
        let key = [0x11u8; 32];
        let nonce = [0x33u8; 12];
        let header = [0x44u8; 128];

        let result = decrypt_single(&key, &nonce, &header, &[0u8; 15]);
        assert_eq!(result, Err(SfelError::TruncatedFile));
    }
}
