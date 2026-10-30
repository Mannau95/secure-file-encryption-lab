use sfel_lib::crypto::aead::{decrypt_single, encrypt_single};
use sfel_lib::crypto::kdf::{derive_key, KdfParams};
use sfel_lib::crypto::rng::{random_nonce, random_salt};

#[test]
fn test_kdf_consistency_and_determinism() {
    let password = b"P@ssw0rd!Secure2026";
    let salt = [0x5Au8; 16];
    let params = KdfParams {
        memory_kib: 8192,
        iterations: 2,
        parallelism: 2,
    };

    let key1 = derive_key(password, &salt, &params).expect("KDF derivation 1 failed");
    let key2 = derive_key(password, &salt, &params).expect("KDF derivation 2 failed");

    assert_eq!(*key1, *key2, "Argon2id output must be strictly deterministic");
    assert_ne!(*key1, [0u8; 32], "Derived key must not be zeroes");

    // Changing salt changes output
    let mut other_salt = salt;
    other_salt[0] ^= 0xFF;
    let key3 = derive_key(password, &other_salt, &params).expect("KDF derivation 3 failed");
    assert_ne!(*key1, *key3, "Different salt must produce different key");

    // Changing password changes output
    let key4 = derive_key(b"DifferentPassword", &salt, &params).expect("KDF derivation 4 failed");
    assert_ne!(*key1, *key4, "Different password must produce different key");
}

#[test]
fn test_encrypt_decrypt_roundtrip_single_mode() {
    let salt = random_salt();
    let nonce = random_nonce();
    let params = KdfParams {
        memory_kib: 8192,
        iterations: 1,
        parallelism: 1,
    };
    let key = derive_key(b"test_single_key", &salt, &params).unwrap();

    let header = [0x7Eu8; 128];
    let test_messages: &[&[u8]] = &[
        b"",
        b"A",
        b"Short message",
        &[0xAA; 1024],
        &[0xBB; 1_048_576], // Exactly 1 MiB
    ];

    for &msg in test_messages {
        let encrypted = encrypt_single(&key, &nonce, &header, msg)
            .expect("Encryption failed");
        assert_eq!(encrypted.len(), msg.len() + 16);

        let decrypted = decrypt_single(&key, &nonce, &header, &encrypted)
            .expect("Decryption failed");
        assert_eq!(decrypted, msg, "Decrypted message must match original plaintext");
    }
}
