use std::fs;
use tempfile::tempdir;

use sfel_lib::commands::decrypt::decrypt_file;
use sfel_lib::commands::encrypt::encrypt_file;

fn run_roundtrip_test(filename: &str, data: &[u8], password: &str) {
    let temp = tempdir().expect("Failed to create temporary directory");
    let source_dir = temp.path().join("source");
    let enc_dir = temp.path().join("encrypted");
    let dec_dir = temp.path().join("decrypted");

    fs::create_dir(&source_dir).unwrap();
    fs::create_dir(&enc_dir).unwrap();
    fs::create_dir(&dec_dir).unwrap();

    let source_file = source_dir.join(filename);
    fs::write(&source_file, data).expect("Failed to write source test file");

    // Encrypt
    let enc_path = encrypt_file(&source_file, password, &enc_dir, |_, _, _| {})
        .expect("Encryption failed");
    assert!(enc_path.exists());

    // Decrypt
    let dec_path = decrypt_file(&enc_path, password, &dec_dir, |_, _, _| {})
        .expect("Decryption failed");
    assert!(dec_path.exists());

    // Verify filename and contents
    assert_eq!(
        dec_path.file_name().unwrap().to_str().unwrap(),
        filename,
        "Decrypted filename must match original"
    );

    let decrypted_data = fs::read(&dec_path).expect("Failed to read decrypted output");
    assert_eq!(decrypted_data, data, "Decrypted data must match original source data");
}

#[test]
fn test_roundtrip_empty_file() {
    run_roundtrip_test("empty.dat", b"", "test_pass_empty");
}

#[test]
fn test_roundtrip_1_byte() {
    run_roundtrip_test("one_byte.bin", b"X", "test_pass_1b");
}

#[test]
fn test_roundtrip_1_kib() {
    let data = vec![0x7A; 1024];
    run_roundtrip_test("one_kib.bin", &data, "test_pass_1kib");
}

#[test]
fn test_roundtrip_exactly_1_mib() {
    // Exact single mode boundary (1_048_576 bytes)
    let data = vec![0x3C; 1_048_576];
    run_roundtrip_test("exact_1mib.bin", &data, "test_pass_exact_1mib");
}

#[test]
fn test_roundtrip_1_mib_plus_1() {
    // Triggers chunked mode (1_048_577 bytes -> 2 chunks)
    let data = vec![0x9E; 1_048_577];
    run_roundtrip_test("chunked_boundary.bin", &data, "test_pass_1mib_plus_1");
}

#[test]
fn test_roundtrip_5_mib() {
    // Multiple chunks in chunked mode (5 MiB = 5_242_880 bytes)
    let mut data = Vec::with_capacity(5 * 1024 * 1024);
    for i in 0..(5 * 1024 * 1024) {
        data.push((i % 251) as u8);
    }
    run_roundtrip_test("five_mib.bin", &data, "test_pass_5mib");
}

#[test]
fn test_roundtrip_unicode_filenames() {
    let unicode_names = [
        "文档_test.txt",
        "🔒secure.dat",
        "español_archivo.bin",
        "русский_текст.md",
    ];

    for name in unicode_names {
        let content = format!("Content for file {}", name);
        run_roundtrip_test(name, content.as_bytes(), "unicode_pass");
    }
}


#[test]
fn test_roundtrip_folder_archive() {
    use sfel_lib::commands::encrypt::encrypt_file_with_profile;
    use sfel_lib::crypto::kdf::Argon2Profile;

    let temp = tempdir().expect("Failed to create temporary directory");
    let source_folder = temp.path().join("ConfidentialProject");
    let nested_dir = source_folder.join("docs").join("2026");
    let enc_dir = temp.path().join("encrypted");
    let dec_dir = temp.path().join("decrypted");

    fs::create_dir_all(&nested_dir).unwrap();
    fs::create_dir(&enc_dir).unwrap();
    fs::create_dir(&dec_dir).unwrap();

    fs::write(source_folder.join("summary.txt"), b"Top secret summary").unwrap();
    fs::write(nested_dir.join("report.bin"), &[0xDE, 0xAD, 0xBE, 0xEF]).unwrap();

    let enc_path = encrypt_file_with_profile(
        &source_folder,
        "folder_master_pass",
        &enc_dir,
        Some(Argon2Profile::Fast),
        |_, _, _| {},
    )
    .expect("Folder encryption failed");

    assert!(enc_path.exists());
    assert_eq!(
        enc_path.file_name().unwrap().to_str().unwrap(),
        "ConfidentialProject.sfel"
    );

    let dec_path = decrypt_file(&enc_path, "folder_master_pass", &dec_dir, |_, _, _| {})
        .expect("Folder decryption failed");

    assert!(dec_path.is_dir());
    assert_eq!(
        dec_path.file_name().unwrap().to_str().unwrap(),
        "ConfidentialProject"
    );
    assert_eq!(
        fs::read(dec_path.join("summary.txt")).unwrap(),
        b"Top secret summary"
    );
    assert_eq!(
        fs::read(dec_path.join("docs").join("2026").join("report.bin")).unwrap(),
        &[0xDE, 0xAD, 0xBE, 0xEF]
    );
}


#[test]
fn test_roundtrip_chacha20_and_keyfile() {
    use sfel_lib::commands::decrypt::decrypt_file_with_options;
    use sfel_lib::commands::encrypt::encrypt_file_with_options;
    use sfel_lib::commands::keyfile::generate_keyfile;
    use sfel_lib::crypto::kdf::Argon2Profile;
    use sfel_lib::format::header::CipherAlgorithm;

    let temp = tempdir().expect("Failed to create temporary directory");
    let source_dir = temp.path().join("source");
    let enc_dir = temp.path().join("encrypted");
    let dec_dir = temp.path().join("decrypted");

    fs::create_dir(&source_dir).unwrap();
    fs::create_dir(&enc_dir).unwrap();
    fs::create_dir(&dec_dir).unwrap();

    // Generate a 4096-byte CSPRNG keyfile
    let keyfile_path = temp.path().join("secret.sfel.key");
    generate_keyfile(&keyfile_path).expect("Keyfile generation failed");

    // 1.5 MiB payload to exercise chunked mode with ChaCha20-Poly1305 + Keyfile
    let payload = vec![0x5Au8; 1_572_864];
    let source_file = source_dir.join("chacha_keyfile_test.bin");
    fs::write(&source_file, &payload).unwrap();

    let enc_path = encrypt_file_with_options(
        &source_file,
        "multi_factor_pass",
        &enc_dir,
        Some(Argon2Profile::Fast),
        Some(CipherAlgorithm::Chacha20Poly1305),
        Some(&keyfile_path),
        |_, _, _| {},
    )
    .expect("ChaCha20 + Keyfile encryption failed");

    // Attempting decryption WITHOUT keyfile must fail authentication
    let wrong_res = decrypt_file_with_options(
        &enc_path,
        "multi_factor_pass",
        &dec_dir,
        None,
        |_, _, _| {},
    );
    assert!(wrong_res.is_err(), "Decryption without keyfile must fail");

    // Decrypting WITH matching password + keyfile must succeed
    let dec_path = decrypt_file_with_options(
        &enc_path,
        "multi_factor_pass",
        &dec_dir,
        Some(&keyfile_path),
        |_, _, _| {},
    )
    .expect("ChaCha20 + Keyfile decryption failed");

    let restored = fs::read(&dec_path).unwrap();
    assert_eq!(restored, payload);
}
