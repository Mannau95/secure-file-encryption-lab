use std::fs;
use tempfile::tempdir;

use sfel_lib::commands::decrypt::decrypt_file;
use sfel_lib::commands::encrypt::encrypt_file;
use sfel_lib::crypto::chunks::ENCRYPTED_CHUNK_SIZE;
use sfel_lib::error::SfelError;
use sfel_lib::format::header::HEADER_SIZE;

#[test]
fn test_wrong_password_rejected() {
    let temp = tempdir().unwrap();
    let src = temp.path().join("secret.txt");
    let enc_dir = temp.path().join("enc");
    let dec_dir = temp.path().join("dec");
    fs::create_dir(&enc_dir).unwrap();
    fs::create_dir(&dec_dir).unwrap();

    fs::write(&src, b"Top secret data").unwrap();

    let enc_path = encrypt_file(&src, "correct_pass_123", &enc_dir, |_, _, _| {}).unwrap();

    let result = decrypt_file(&enc_path, "wrong_pass_456", &dec_dir, |_, _, _| {});
    assert_eq!(result.err(), Some(SfelError::AuthenticationFailed));
}

#[test]
fn test_header_corruption_detected() {
    let temp = tempdir().unwrap();
    let src = temp.path().join("data.txt");
    let enc_dir = temp.path().join("enc");
    let dec_dir = temp.path().join("dec");
    fs::create_dir(&enc_dir).unwrap();
    fs::create_dir(&dec_dir).unwrap();

    fs::write(&src, b"Sensitive financial records").unwrap();
    let enc_path = encrypt_file(&src, "strong_pass", &enc_dir, |_, _, _| {}).unwrap();

    let mut enc_bytes = fs::read(&enc_path).unwrap();

    // Corrupt magic bytes
    enc_bytes[0] ^= 0x55;
    fs::write(&enc_path, &enc_bytes).unwrap();
    let res_magic = decrypt_file(&enc_path, "strong_pass", &dec_dir, |_, _, _| {});
    assert_eq!(res_magic.err(), Some(SfelError::InvalidFormat));

    // Restore magic and corrupt salt (offset 18)
    enc_bytes[0] ^= 0x55;
    enc_bytes[18] ^= 0x01;
    fs::write(&enc_path, &enc_bytes).unwrap();
    let res_salt = decrypt_file(&enc_path, "strong_pass", &dec_dir, |_, _, _| {});
    assert_eq!(res_salt.err(), Some(SfelError::AuthenticationFailed));
}

#[test]
fn test_chunk_corruption_detected() {
    let temp = tempdir().unwrap();
    let src = temp.path().join("multi_chunk.bin");
    let enc_dir = temp.path().join("enc");
    let dec_dir = temp.path().join("dec");
    fs::create_dir(&enc_dir).unwrap();
    fs::create_dir(&dec_dir).unwrap();

    // 2 MiB file: 2 chunks
    let data = vec![0xEE; 2 * 1024 * 1024];
    fs::write(&src, &data).unwrap();

    let enc_path = encrypt_file(&src, "multi_pass", &enc_dir, |_, _, _| {}).unwrap();

    let mut enc_bytes = fs::read(&enc_path).unwrap();
    // Flip bit in the second chunk ciphertext (after header + chunk 0)
    let chunk1_offset = HEADER_SIZE + ENCRYPTED_CHUNK_SIZE + 50;
    enc_bytes[chunk1_offset] ^= 0x01;
    fs::write(&enc_path, &enc_bytes).unwrap();

    let result = decrypt_file(&enc_path, "multi_pass", &dec_dir, |_, _, _| {});
    assert_eq!(result.err(), Some(SfelError::AuthenticationFailed));
}

#[test]
fn test_truncation_detected() {
    let temp = tempdir().unwrap();
    let src = temp.path().join("trunc_test.bin");
    let enc_dir = temp.path().join("enc");
    let dec_dir = temp.path().join("dec");
    fs::create_dir(&enc_dir).unwrap();
    fs::create_dir(&dec_dir).unwrap();

    fs::write(&src, b"Critical database dump").unwrap();
    let enc_path = encrypt_file(&src, "pass_trunc", &enc_dir, |_, _, _| {}).unwrap();

    let mut enc_bytes = fs::read(&enc_path).unwrap();

    // Truncate to less than header
    let truncated_header = &enc_bytes[..64];
    let trunc_path = enc_dir.join("short_header.sfel");
    fs::write(&trunc_path, truncated_header).unwrap();
    let res1 = decrypt_file(&trunc_path, "pass_trunc", &dec_dir, |_, _, _| {});
    assert_eq!(res1.err(), Some(SfelError::TruncatedFile));

    // Truncate last 8 bytes of ciphertext/tag
    enc_bytes.truncate(enc_bytes.len() - 8);
    let trunc_data_path = enc_dir.join("short_payload.sfel");
    fs::write(&trunc_data_path, &enc_bytes).unwrap();
    let res2 = decrypt_file(&trunc_data_path, "pass_trunc", &dec_dir, |_, _, _| {});
    assert_eq!(res2.err(), Some(SfelError::TruncatedFile));
}

#[test]
fn test_chunk_reorder_detected() {
    let temp = tempdir().unwrap();
    let src = temp.path().join("chunk_order.bin");
    let enc_dir = temp.path().join("enc");
    let dec_dir = temp.path().join("dec");
    fs::create_dir(&enc_dir).unwrap();
    fs::create_dir(&dec_dir).unwrap();

    // 2 MiB file: 2 chunks
    let data = vec![0x17; 2 * 1024 * 1024];
    fs::write(&src, &data).unwrap();

    let enc_path = encrypt_file(&src, "order_pass", &enc_dir, |_, _, _| {}).unwrap();
    let enc_bytes = fs::read(&enc_path).unwrap();

    let header = &enc_bytes[..HEADER_SIZE];
    let chunk0 = &enc_bytes[HEADER_SIZE..HEADER_SIZE + ENCRYPTED_CHUNK_SIZE];
    let chunk1 = &enc_bytes[HEADER_SIZE + ENCRYPTED_CHUNK_SIZE..];

    // Reorder chunks: header || chunk1 || chunk0
    let mut swapped = Vec::new();
    swapped.extend_from_slice(header);
    swapped.extend_from_slice(chunk1);
    swapped.extend_from_slice(chunk0);

    let swapped_path = enc_dir.join("swapped.sfel");
    fs::write(&swapped_path, &swapped).unwrap();

    let result = decrypt_file(&swapped_path, "order_pass", &dec_dir, |_, _, _| {});
    assert_eq!(result.err(), Some(SfelError::AuthenticationFailed));
}

#[test]
fn test_no_partial_output_on_failure() {
    let temp = tempdir().unwrap();
    let src = temp.path().join("important_file.txt");
    let enc_dir = temp.path().join("enc");
    let dec_dir = temp.path().join("dec");
    fs::create_dir(&enc_dir).unwrap();
    fs::create_dir(&dec_dir).unwrap();

    fs::write(&src, b"Original uncorrupted content").unwrap();
    let enc_path = encrypt_file(&src, "secret_key", &enc_dir, |_, _, _| {}).unwrap();

    // Intentionally attempt decryption with wrong password
    let expected_target = dec_dir.join("important_file.txt");
    let result = decrypt_file(&enc_path, "wrong_key", &dec_dir, |_, _, _| {});
    assert!(result.is_err());

    // CRITICAL: Final output file must NOT exist
    assert!(
        !expected_target.exists(),
        "Target file must not be created on failed decryption"
    );

    // CRITICAL: No temp files must remain in dec_dir
    let remaining_entries: Vec<_> = fs::read_dir(&dec_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .collect();
    assert!(
        remaining_entries.is_empty(),
        "No leftover temporary files must exist after failure"
    );
}
