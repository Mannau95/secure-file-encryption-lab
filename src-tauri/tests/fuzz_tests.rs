use std::fs;
use std::io::Cursor;
use tempfile::tempdir;

use sfel_lib::commands::decrypt::decrypt_file_with_options;
use sfel_lib::commands::encrypt::encrypt_file_with_options;
use sfel_lib::crypto::aead::{decrypt_single_with_cipher, encrypt_single_with_cipher};
use sfel_lib::crypto::chunks::{decrypt_stream_with_cipher, encrypt_stream_with_cipher};
use sfel_lib::crypto::kdf::Argon2Profile;
use sfel_lib::format::header::{CipherAlgorithm, EncryptionMode, SfelHeader, HEADER_SIZE, MAGIC};
use sfel_lib::format::validation::validate_header;
use sfel_lib::fs::archive::extract_folder_tar_atomically;

/// Simple deterministic xorshift64 PRNG for reproducible fuzzing in CI
struct XorShift64 {
    state: u64,
}

impl XorShift64 {
    fn new(seed: u64) -> Self {
        Self {
            state: if seed == 0 { 0xCAFE_BABE_DEAD_BEEF } else { seed },
        }
    }

    fn next_u64(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.state = x;
        x
    }

    fn fill_bytes(&mut self, buf: &mut [u8]) {
        for chunk in buf.chunks_mut(8) {
            let val = self.next_u64().to_le_bytes();
            let len = chunk.len();
            chunk.copy_from_slice(&val[..len]);
        }
    }
}

#[test]
fn fuzz_header_parser_5000_random_and_semi_valid_inputs() {
    let mut rng = XorShift64::new(0x5FE1_2026_0001);

    // 1. 2,500 purely random 128-byte buffers
    for _ in 0..2500 {
        let mut buf = [0u8; HEADER_SIZE];
        rng.fill_bytes(&mut buf);
        if let Ok(header) = SfelHeader::from_bytes(&buf) {
            let _ = validate_header(&header);
        }
    }

    // 2. 2,500 semi-valid headers (correct magic + version, mutated fields)
    let base_header = SfelHeader::new_with_cipher(
        EncryptionMode::Single,
        CipherAlgorithm::Aes256Gcm,
        32768,
        2,
        2,
        [0xAA; 16],
        [0xBB; 12],
        1024,
        "valid_name.txt".to_string(),
    );
    let base_bytes = base_header.to_bytes().unwrap();

    for i in 0..2500 {
        let mut mutated = base_bytes;
        let mutations = (rng.next_u64() % 8) + 1;
        for _ in 0..mutations {
            let idx = 4 + (rng.next_u64() as usize % (HEADER_SIZE - 4));
            mutated[idx] = (rng.next_u64() & 0xFF) as u8;
        }

        if i % 5 == 0 {
            mutated[54] = 0xFF;
            mutated[55] = 0xFF; // u16::MAX name length
        } else if i % 7 == 0 {
            // Invalid UTF-8 sequence in filename region (offset 56..128)
            let name_len: u16 = 16;
            mutated[54..56].copy_from_slice(&name_len.to_le_bytes());
            mutated[56] = 0xFF;
            mutated[57] = 0xFE;
            mutated[58] = 0xFD;
        } else if i % 11 == 0 {
            // Valid magic + valid version + valid mode, but u64::MAX file size
            mutated[0..4].copy_from_slice(&MAGIC);
            mutated[4] = 0x01;
            mutated[5] = 0x11; // ChaCha20-Poly1305 Chunked
            mutated[46..54].copy_from_slice(&u64::MAX.to_le_bytes());
        }

        if let Ok(header) = SfelHeader::from_bytes(&mutated) {
            let _ = validate_header(&header);
        }
    }
}

#[test]
fn fuzz_arbitrary_buffer_lengths() {
    let mut rng = XorShift64::new(0x5FE1_2026_0002);

    for len in 0..=(HEADER_SIZE * 2) {
        let mut data = vec![0u8; len];
        rng.fill_bytes(&mut data);
        if len >= 4 && len % 3 == 0 {
            data[0..4].copy_from_slice(&MAGIC);
        }
        let res = SfelHeader::from_bytes(&data);
        if len < HEADER_SIZE {
            assert!(res.is_err(), "Lengths < HEADER_SIZE must always return Err");
        }
    }
}

#[test]
fn fuzz_aead_and_chunk_streams_500_mutations() {
    let mut rng = XorShift64::new(0x5FE1_2026_0005);
    let key = [0x42u8; 32];
    let nonce = [0x24u8; 12];
    let base_nonce = [0x11u8; 7];
    let aad = [0x99u8; HEADER_SIZE];

    let mut plaintext = vec![0u8; 8192];
    rng.fill_bytes(&mut plaintext);

    for cipher in [CipherAlgorithm::Aes256Gcm, CipherAlgorithm::Chacha20Poly1305] {
        // 1. 250 single-shot AEAD mutations per cipher
        let valid_ct =
            encrypt_single_with_cipher(cipher, &key, &nonce, &aad, &plaintext).unwrap();
        for _ in 0..250 {
            let mut bad_ct = valid_ct.clone();
            let pos = rng.next_u64() as usize % bad_ct.len();
            bad_ct[pos] ^= 1u8 << (rng.next_u64() % 8);
            assert!(decrypt_single_with_cipher(cipher, &key, &nonce, &aad, &bad_ct).is_err());
        }

        // 2. Stream chunked mutations (truncated / bit-flipped / empty streams)
        let mut enc_stream = Vec::new();
        encrypt_stream_with_cipher(
            cipher,
            Cursor::new(&plaintext),
            &mut enc_stream,
            &key,
            &base_nonce,
            &aad,
            plaintext.len() as u64,
            || false,
            |_, _| {},
        )
        .unwrap();

        for trial in 0..50 {
            let mut bad_stream = enc_stream.clone();
            if trial % 2 == 0 {
                let pos = rng.next_u64() as usize % bad_stream.len();
                bad_stream[pos] ^= 1u8 << (rng.next_u64() % 8);
            } else {
                let trunc_len = rng.next_u64() as usize % bad_stream.len();
                bad_stream.truncate(trunc_len);
            }
            let mut out = Vec::new();
            let res = decrypt_stream_with_cipher(
                cipher,
                Cursor::new(&bad_stream),
                &mut out,
                &key,
                &base_nonce,
                &aad,
                bad_stream.len() as u64,
                || false,
                |_, _| {},
            );
            assert!(res.is_err());
        }
    }
}

#[test]
fn fuzz_end_to_end_decryptor_mutations_never_panic_or_leak_temp_files() {
    let mut rng = XorShift64::new(0x5FE1_2026_0003);
    let temp = tempdir().unwrap();
    let src = temp.path().join("fuzz_payload.bin");
    let enc_dir = temp.path().join("enc");
    let dec_dir = temp.path().join("dec");
    fs::create_dir(&enc_dir).unwrap();
    fs::create_dir(&dec_dir).unwrap();

    let mut payload = vec![0u8; 4096];
    rng.fill_bytes(&mut payload);
    fs::write(&src, &payload).unwrap();

    for cipher in [CipherAlgorithm::Aes256Gcm, CipherAlgorithm::Chacha20Poly1305] {
        let enc_path = encrypt_file_with_options(
            &src,
            "fuzz_pass_2026",
            &enc_dir,
            Some(Argon2Profile::Fast),
            Some(cipher),
            None,
            |_, _, _| {},
        )
        .unwrap();

        let valid_ciphertext = fs::read(&enc_path).unwrap();
        fs::remove_file(&enc_path).unwrap();

        for trial in 0..4 {
            let mut corrupted = valid_ciphertext.clone();
            match trial {
                0 => {
                    // Flip bit in ciphertext payload
                    corrupted[HEADER_SIZE + 10] ^= 0x01;
                }
                1 => {
                    // Truncate mid-file
                    corrupted.truncate(HEADER_SIZE + 32);
                }
                2 => {
                    // Corrupt Argon2 parameters to out-of-bounds values so KDF DoS protection triggers immediately
                    corrupted[6..10].copy_from_slice(&u32::MAX.to_le_bytes());
                }
                _ => {
                    // Flip byte in the final 16-byte AEAD authentication tag
                    let tag_idx = corrupted.len() - 1;
                    corrupted[tag_idx] ^= 0x80;
                }
            }

            let mutated_path = enc_dir.join(format!("mutated_{trial}.sfel"));
            fs::write(&mutated_path, &corrupted).unwrap();

            let res = decrypt_file_with_options(
                &mutated_path,
                "fuzz_pass_2026",
                &dec_dir,
                None,
                |_, _, _| {},
            );
            assert!(
                res.is_err(),
                "Mutated file (trial {trial}) must fail authentication or format validation"
            );

            // Ensure zero leftover files or temp guards in dec_dir
            let remaining: Vec<_> = fs::read_dir(&dec_dir).unwrap().collect();
            assert!(
                remaining.is_empty(),
                "Output directory must remain completely clean after failed fuzz trial {trial}"
            );
        }
    }
}

#[test]
fn fuzz_malformed_tar_archive_extraction_cleanup() {
    let mut rng = XorShift64::new(0x5FE1_2026_0004);
    let temp = tempdir().unwrap();
    let archive_dir = temp.path().join("archives");
    let extract_dir = temp.path().join("extract");
    fs::create_dir(&archive_dir).unwrap();
    fs::create_dir(&extract_dir).unwrap();

    for i in 0..20 {
        let len = (rng.next_u64() as usize % 4096) + 512;
        let mut garbage_tar = vec![0u8; len];
        rng.fill_bytes(&mut garbage_tar);
        let tar_path = archive_dir.join(format!("bad_{i}.tar"));
        fs::write(&tar_path, &garbage_tar).unwrap();

        let target_folder = extract_dir.join(format!("out_folder_{i}"));
        let res = extract_folder_tar_atomically(&tar_path, &target_folder);
        if res.is_err() {
            assert!(!target_folder.exists());
        }
    }
}
