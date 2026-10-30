use sfel_lib::format::header::{EncryptionMode, SfelHeader, HEADER_SIZE};
use sfel_lib::format::validation::{
    validate_argon2_iterations, validate_argon2_memory, validate_argon2_parallelism,
    validate_file_size, validate_header, validate_name_length, MAX_ARGON2_ITERATIONS,
    MAX_ARGON2_MEMORY_KIB, MAX_ARGON2_PARALLELISM, MAX_FILE_SIZE, MAX_SPEC_NAME_LEN,
    MIN_ARGON2_ITERATIONS, MIN_ARGON2_MEMORY_KIB, MIN_ARGON2_PARALLELISM,
};

#[test]
fn test_header_serialization_roundtrip_single_and_chunked() {
    // Single mode header
    let header_single = SfelHeader::new(
        EncryptionMode::Single,
        65536,
        3,
        4,
        [0x11; 16],
        [0x22; 12],
        512,
        "photo.jpg".to_string(),
    );

    let bytes_single = header_single.to_bytes().expect("Serialization failed");
    assert_eq!(bytes_single.len(), HEADER_SIZE);
    let parsed_single = SfelHeader::from_bytes(&bytes_single).expect("Deserialization failed");
    assert_eq!(header_single, parsed_single);

    // Chunked mode header
    let mut header_chunked = SfelHeader::new(
        EncryptionMode::Chunked,
        131072,
        5,
        8,
        [0x33; 16],
        [0; 12],
        50_000_000,
        "database_archive.tar.gz".to_string(),
    );
    header_chunked.set_chunked_nonce(&[1, 2, 3, 4, 5, 6, 7]);

    let bytes_chunked = header_chunked.to_bytes().expect("Serialization failed");
    assert_eq!(bytes_chunked.len(), HEADER_SIZE);
    let parsed_chunked = SfelHeader::from_bytes(&bytes_chunked).expect("Deserialization failed");
    assert_eq!(header_chunked, parsed_chunked);
    assert_eq!(parsed_chunked.base_nonce(), [1, 2, 3, 4, 5, 6, 7]);
    assert_eq!(&parsed_chunked.nonce[7..12], &[0u8; 5]);
}

#[test]
fn test_header_validation_bounds() {
    // Memory bounds (8192..=4194304 KiB)
    assert!(validate_argon2_memory(MIN_ARGON2_MEMORY_KIB).is_ok());
    assert!(validate_argon2_memory(MAX_ARGON2_MEMORY_KIB).is_ok());
    assert!(validate_argon2_memory(MIN_ARGON2_MEMORY_KIB - 1).is_err());
    assert!(validate_argon2_memory(MAX_ARGON2_MEMORY_KIB + 1).is_err());

    // Iterations bounds (1..=100)
    assert!(validate_argon2_iterations(MIN_ARGON2_ITERATIONS).is_ok());
    assert!(validate_argon2_iterations(MAX_ARGON2_ITERATIONS).is_ok());
    assert!(validate_argon2_iterations(0).is_err());
    assert!(validate_argon2_iterations(101).is_err());

    // Parallelism bounds (1..=16)
    assert!(validate_argon2_parallelism(MIN_ARGON2_PARALLELISM).is_ok());
    assert!(validate_argon2_parallelism(MAX_ARGON2_PARALLELISM).is_ok());
    assert!(validate_argon2_parallelism(0).is_err());
    assert!(validate_argon2_parallelism(17).is_err());

    // Name length bounds (0..=1024)
    assert!(validate_name_length(0).is_ok());
    assert!(validate_name_length(MAX_SPEC_NAME_LEN).is_ok());
    assert!(validate_name_length(MAX_SPEC_NAME_LEN + 1).is_err());

    // File size bounds (up to 4 TiB)
    assert!(validate_file_size(0).is_ok());
    assert!(validate_file_size(MAX_FILE_SIZE).is_ok());
    assert!(validate_file_size(MAX_FILE_SIZE + 1).is_err());
}

#[test]
fn test_header_structural_validation() {
    let mut header = SfelHeader::new(
        EncryptionMode::Single,
        65536,
        3,
        4,
        [0xAA; 16],
        [0xBB; 12],
        1000,
        "valid.txt".to_string(),
    );
    assert!(validate_header(&header).is_ok());

    // Invalid memory in header
    header.argon2_memory = 1000;
    assert!(validate_header(&header).is_err());
    header.argon2_memory = 65536;

    // Single mode exceeding 1 MiB
    header.original_file_size = 1_048_577;
    assert!(validate_header(&header).is_err());
    header.original_file_size = 1000;

    // Chunked mode with corrupted nonce padding
    header.mode = EncryptionMode::Chunked;
    header.nonce[11] = 0x01; // Non-zero padding byte
    assert!(validate_header(&header).is_err());
}
