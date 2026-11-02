use std::io::{Read, Write};

use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use chacha20poly1305::{ChaCha20Poly1305, Nonce as ChaChaNonce};
use zeroize::Zeroize;

use crate::crypto::aead::{HEADER_SIZE, KEY_LEN, NONCE_LEN, TAG_LEN};
use crate::error::SfelError;
use crate::format::header::CipherAlgorithm;

/// Plaintext chunk size in bytes (1 MiB).
pub const CHUNK_SIZE: usize = 1_048_576;

/// Encrypted chunk size for a full 1 MiB chunk (1 MiB + 16 bytes tag).
pub const ENCRYPTED_CHUNK_SIZE: usize = CHUNK_SIZE + TAG_LEN;

/// Base nonce length in bytes (7 bytes / 56 bits).
pub const BASE_NONCE_LEN: usize = 7;

/// Per-chunk Associated Authenticated Data length in bytes (128 + 4 + 1 = 133 bytes).
pub const CHUNK_AAD_LEN: usize = HEADER_SIZE + 4 + 1;

/// Builds the 12-byte per-chunk nonce:
/// `base_nonce(7) || chunk_index(4 bytes big-endian) || is_last(1 byte)`
pub fn build_chunk_nonce(base_nonce: &[u8; BASE_NONCE_LEN], chunk_index: u32, is_last: bool) -> [u8; NONCE_LEN] {
    let mut nonce = [0u8; NONCE_LEN];
    nonce[0..7].copy_from_slice(base_nonce);
    nonce[7..11].copy_from_slice(&chunk_index.to_be_bytes());
    nonce[11] = if is_last { 0x01 } else { 0x00 };
    nonce
}

/// Builds the 133-byte per-chunk Additional Authenticated Data (AAD):
/// `header(128 bytes) || chunk_index(4 bytes big-endian) || is_last(1 byte)`
pub fn build_chunk_aad(header_bytes: &[u8; HEADER_SIZE], chunk_index: u32, is_last: bool) -> [u8; CHUNK_AAD_LEN] {
    let mut aad = [0u8; CHUNK_AAD_LEN];
    aad[0..HEADER_SIZE].copy_from_slice(header_bytes);
    aad[HEADER_SIZE..HEADER_SIZE + 4].copy_from_slice(&chunk_index.to_be_bytes());
    aad[HEADER_SIZE + 4] = if is_last { 0x01 } else { 0x00 };
    aad
}

/// Calculates the number of chunks for a file of a given size.
pub fn calculate_chunk_count(file_size: u64) -> u32 {
    if file_size == 0 {
        1
    } else {
        ((file_size + (CHUNK_SIZE as u64 - 1)) / (CHUNK_SIZE as u64)) as u32
    }
}

/// Encrypts a single chunk of plaintext with AES-256-GCM.
///
/// Returns `ciphertext || 16-byte tag`.
pub fn encrypt_chunk(
    cipher: &Aes256Gcm,
    base_nonce: &[u8; BASE_NONCE_LEN],
    header_bytes: &[u8; HEADER_SIZE],
    chunk_index: u32,
    is_last: bool,
    plaintext_chunk: &[u8],
) -> Result<Vec<u8>, SfelError> {
    let nonce = build_chunk_nonce(base_nonce, chunk_index, is_last);
    let aad = build_chunk_aad(header_bytes, chunk_index, is_last);
    let gcm_nonce = Nonce::from(nonce);

    let payload = Payload {
        msg: plaintext_chunk,
        aad: &aad,
    };

    cipher
        .encrypt(&gcm_nonce, payload)
        .map_err(|_| SfelError::IntegrityError)
}

/// Decrypts a single encrypted chunk with AES-256-GCM and verifies authentication tag.
pub fn decrypt_chunk(
    cipher: &Aes256Gcm,
    base_nonce: &[u8; BASE_NONCE_LEN],
    header_bytes: &[u8; HEADER_SIZE],
    chunk_index: u32,
    is_last: bool,
    ciphertext_and_tag: &[u8],
) -> Result<Vec<u8>, SfelError> {
    if ciphertext_and_tag.len() < TAG_LEN {
        return Err(SfelError::TruncatedFile);
    }

    let nonce = build_chunk_nonce(base_nonce, chunk_index, is_last);
    let aad = build_chunk_aad(header_bytes, chunk_index, is_last);
    let gcm_nonce = Nonce::from(nonce);

    let payload = Payload {
        msg: ciphertext_and_tag,
        aad: &aad,
    };

    cipher
        .decrypt(&gcm_nonce, payload)
        .map_err(|_| SfelError::AuthenticationFailed)
}

/// Streams plaintext from `reader`, encrypts each 1 MiB chunk, and writes to `writer`.
///
/// Periodically checks `check_cancel` between chunks and calls `on_progress` with
/// `(bytes_processed, total_bytes)`.
pub fn encrypt_stream<R: Read, W: Write, C, P>(
    reader: R,
    writer: W,
    key: &[u8; KEY_LEN],
    base_nonce: &[u8; BASE_NONCE_LEN],
    header_bytes: &[u8; HEADER_SIZE],
    total_file_size: u64,
    check_cancel: C,
    on_progress: P,
) -> Result<(), SfelError>
where
    C: Fn() -> bool,
    P: FnMut(u64, u64),
{
    encrypt_stream_with_cipher(
        CipherAlgorithm::Aes256Gcm,
        reader,
        writer,
        key,
        base_nonce,
        header_bytes,
        total_file_size,
        check_cancel,
        on_progress,
    )
}

/// Streams plaintext from `reader`, encrypts each 1 MiB chunk using `algorithm`, and writes to `writer`.
pub fn encrypt_stream_with_cipher<R: Read, W: Write, C, P>(
    algorithm: CipherAlgorithm,
    mut reader: R,
    mut writer: W,
    key: &[u8; KEY_LEN],
    base_nonce: &[u8; BASE_NONCE_LEN],
    header_bytes: &[u8; HEADER_SIZE],
    total_file_size: u64,
    check_cancel: C,
    mut on_progress: P,
) -> Result<(), SfelError>
where
    C: Fn() -> bool,
    P: FnMut(u64, u64),
{
    let aes_cipher = Aes256Gcm::new(key.into());
    let chacha_cipher = ChaCha20Poly1305::new(key.into());
    let total_chunks = calculate_chunk_count(total_file_size);
    let mut chunk_buf = vec![0u8; CHUNK_SIZE];
    let mut bytes_processed = 0u64;

    for chunk_index in 0..total_chunks {
        if check_cancel() {
            chunk_buf.zeroize();
            return Err(SfelError::Cancelled);
        }

        let is_last = chunk_index == total_chunks - 1;
        let mut bytes_read = 0;

        while bytes_read < CHUNK_SIZE {
            let n = reader.read(&mut chunk_buf[bytes_read..])?;
            if n == 0 {
                break;
            }
            bytes_read += n;
        }

        let mut encrypted = match algorithm {
            CipherAlgorithm::Aes256Gcm => encrypt_chunk(
                &aes_cipher,
                base_nonce,
                header_bytes,
                chunk_index,
                is_last,
                &chunk_buf[..bytes_read],
            )?,
            CipherAlgorithm::Chacha20Poly1305 => {
                let nonce = build_chunk_nonce(base_nonce, chunk_index, is_last);
                let aad = build_chunk_aad(header_bytes, chunk_index, is_last);
                let chacha_nonce = ChaChaNonce::from(nonce);
                let payload = Payload {
                    msg: &chunk_buf[..bytes_read],
                    aad: &aad,
                };
                chacha_cipher
                    .encrypt(&chacha_nonce, payload)
                    .map_err(|_| SfelError::IntegrityError)?
            }
        };

        writer.write_all(&encrypted)?;

        bytes_processed += bytes_read as u64;
        on_progress(bytes_processed, total_file_size);

        encrypted.zeroize();
    }

    chunk_buf.zeroize();
    writer.flush()?;
    Ok(())
}

/// Streams ciphertext from `reader`, decrypts each chunk verifying its tag,
/// and writes verified plaintext to `writer`.
pub fn decrypt_stream<R: Read, W: Write, C, P>(
    reader: R,
    writer: W,
    key: &[u8; KEY_LEN],
    base_nonce: &[u8; BASE_NONCE_LEN],
    header_bytes: &[u8; HEADER_SIZE],
    total_file_size: u64,
    check_cancel: C,
    on_progress: P,
) -> Result<(), SfelError>
where
    C: Fn() -> bool,
    P: FnMut(u64, u64),
{
    decrypt_stream_with_cipher(
        CipherAlgorithm::Aes256Gcm,
        reader,
        writer,
        key,
        base_nonce,
        header_bytes,
        total_file_size,
        check_cancel,
        on_progress,
    )
}

/// Streams ciphertext from `reader`, decrypts each chunk using `algorithm` verifying its tag,
/// and writes verified plaintext to `writer`.
pub fn decrypt_stream_with_cipher<R: Read, W: Write, C, P>(
    algorithm: CipherAlgorithm,
    mut reader: R,
    mut writer: W,
    key: &[u8; KEY_LEN],
    base_nonce: &[u8; BASE_NONCE_LEN],
    header_bytes: &[u8; HEADER_SIZE],
    total_file_size: u64,
    check_cancel: C,
    mut on_progress: P,
) -> Result<(), SfelError>
where
    C: Fn() -> bool,
    P: FnMut(u64, u64),
{
    let aes_cipher = Aes256Gcm::new(key.into());
    let chacha_cipher = ChaCha20Poly1305::new(key.into());
    let total_chunks = calculate_chunk_count(total_file_size);
    let mut bytes_processed = 0u64;

    for chunk_index in 0..total_chunks {
        if check_cancel() {
            return Err(SfelError::Cancelled);
        }

        let is_last = chunk_index == total_chunks - 1;
        let expected_plaintext_len = if is_last {
            (total_file_size - (chunk_index as u64 * CHUNK_SIZE as u64)) as usize
        } else {
            CHUNK_SIZE
        };
        let expected_cipher_len = expected_plaintext_len + TAG_LEN;

        let mut cipher_buf = vec![0u8; expected_cipher_len];
        match reader.read_exact(&mut cipher_buf) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => {
                cipher_buf.zeroize();
                return Err(SfelError::TruncatedFile);
            }
            Err(e) => {
                cipher_buf.zeroize();
                return Err(e.into());
            }
        }

        let mut plaintext = match algorithm {
            CipherAlgorithm::Aes256Gcm => decrypt_chunk(
                &aes_cipher,
                base_nonce,
                header_bytes,
                chunk_index,
                is_last,
                &cipher_buf,
            )?,
            CipherAlgorithm::Chacha20Poly1305 => {
                if cipher_buf.len() < TAG_LEN {
                    cipher_buf.zeroize();
                    return Err(SfelError::TruncatedFile);
                }
                let nonce = build_chunk_nonce(base_nonce, chunk_index, is_last);
                let aad = build_chunk_aad(header_bytes, chunk_index, is_last);
                let chacha_nonce = ChaChaNonce::from(nonce);
                let payload = Payload {
                    msg: &cipher_buf,
                    aad: &aad,
                };
                chacha_cipher
                    .decrypt(&chacha_nonce, payload)
                    .map_err(|_| SfelError::AuthenticationFailed)?
            }
        };

        cipher_buf.zeroize();

        if plaintext.len() != expected_plaintext_len {
            plaintext.zeroize();
            return Err(SfelError::IntegrityError);
        }

        writer.write_all(&plaintext)?;
        plaintext.zeroize();

        bytes_processed += expected_plaintext_len as u64;
        on_progress(bytes_processed, total_file_size);
    }

    // Verify there is no trailing unauthenticated data
    let mut trailing = [0u8; 1];
    if reader.read(&mut trailing)? != 0 {
        return Err(SfelError::IntegrityError);
    }

    writer.flush()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn test_chunk_nonce_and_aad_construction() {
        let base_nonce = [1, 2, 3, 4, 5, 6, 7];
        let header = [0x55; 128];

        let nonce0 = build_chunk_nonce(&base_nonce, 0, false);
        assert_eq!(&nonce0[0..7], &base_nonce);
        assert_eq!(&nonce0[7..11], &[0, 0, 0, 0]);
        assert_eq!(nonce0[11], 0x00);

        let nonce_last = build_chunk_nonce(&base_nonce, 5, true);
        assert_eq!(&nonce_last[7..11], &[0, 0, 0, 5]);
        assert_eq!(nonce_last[11], 0x01);

        let aad = build_chunk_aad(&header, 5, true);
        assert_eq!(&aad[0..128], &header);
        assert_eq!(&aad[128..132], &[0, 0, 0, 5]);
        assert_eq!(aad[132], 0x01);
    }

    #[test]
    fn test_chunk_stream_roundtrip() {
        let key = [0x33u8; 32];
        let base_nonce = [0x44u8; 7];
        let header = [0x55u8; 128];

        // 2.5 MiB of test data to trigger multiple chunks
        let data = vec![0x42u8; (2.5 * 1024.0 * 1024.0) as usize];
        let total_size = data.len() as u64;

        let mut encrypted_out = Vec::new();
        encrypt_stream(
            Cursor::new(&data),
            &mut encrypted_out,
            &key,
            &base_nonce,
            &header,
            total_size,
            || false,
            |_, _| {},
        )
        .unwrap();

        // 3 chunks: 2 full (1 MiB + 16B) and 1 half (0.5 MiB + 16B)
        let expected_enc_len = total_size as usize + (3 * TAG_LEN);
        assert_eq!(encrypted_out.len(), expected_enc_len);

        let mut decrypted_out = Vec::new();
        decrypt_stream(
            Cursor::new(&encrypted_out),
            &mut decrypted_out,
            &key,
            &base_nonce,
            &header,
            total_size,
            || false,
            |_, _| {},
        )
        .unwrap();

        assert_eq!(decrypted_out, data);
    }

    #[test]
    fn test_chunk_reorder_detected() {
        let key = [0x33u8; 32];
        let base_nonce = [0x44u8; 7];
        let header = [0x55u8; 128];

        // 2 MiB: 2 chunks
        let data = vec![0xAAu8; 2 * CHUNK_SIZE];
        let total_size = data.len() as u64;

        let mut encrypted_out = Vec::new();
        encrypt_stream(
            Cursor::new(&data),
            &mut encrypted_out,
            &key,
            &base_nonce,
            &header,
            total_size,
            || false,
            |_, _| {},
        )
        .unwrap();

        // Swap chunk 0 and chunk 1
        let chunk0 = encrypted_out[..ENCRYPTED_CHUNK_SIZE].to_vec();
        let chunk1 = encrypted_out[ENCRYPTED_CHUNK_SIZE..].to_vec();
        let mut swapped = Vec::new();
        swapped.extend_from_slice(&chunk1);
        swapped.extend_from_slice(&chunk0);

        let mut decrypted_out = Vec::new();
        let result = decrypt_stream(
            Cursor::new(&swapped),
            &mut decrypted_out,
            &key,
            &base_nonce,
            &header,
            total_size,
            || false,
            |_, _| {},
        );

        assert_eq!(result, Err(SfelError::AuthenticationFailed));
    }
}
