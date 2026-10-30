use crate::error::SfelError;

/// Exact fixed size of the SFEL v1 binary file header (128 bytes).
pub const HEADER_SIZE: usize = 128;

/// 4-byte magic signature "SFEL" (0x5346454C).
pub const MAGIC: [u8; 4] = *b"SFEL";

/// Current supported SFEL container format version.
pub const CURRENT_VERSION: u8 = 1;

/// Maximum length in bytes for original filename stored in the 128-byte header (128 - 56 = 72).
pub const MAX_NAME_LEN: usize = 72;

/// Operating mode of encryption for the file container.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum EncryptionMode {
    /// Single-shot AEAD encryption for files <= 1 MiB.
    Single = 0x00,
    /// Chunked streaming AEAD encryption for files > 1 MiB.
    Chunked = 0x01,
}

impl TryFrom<u8> for EncryptionMode {
    type Error = SfelError;

    fn try_from(val: u8) -> Result<Self, Self::Error> {
        match val {
            0x00 => Ok(EncryptionMode::Single),
            0x01 => Ok(EncryptionMode::Chunked),
            _ => Err(SfelError::InvalidFormat),
        }
    }
}

/// Structured representation of the 128-byte SFEL v1 header.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SfelHeader {
    pub version: u8,
    pub mode: EncryptionMode,
    pub argon2_memory: u32,
    pub argon2_iterations: u32,
    pub argon2_parallelism: u32,
    pub salt: [u8; 16],
    pub nonce: [u8; 12],
    pub original_file_size: u64,
    pub original_name: String,
}

impl SfelHeader {
    /// Creates a new SFEL header instance.
    pub fn new(
        mode: EncryptionMode,
        argon2_memory: u32,
        argon2_iterations: u32,
        argon2_parallelism: u32,
        salt: [u8; 16],
        nonce: [u8; 12],
        original_file_size: u64,
        original_name: String,
    ) -> Self {
        Self {
            version: CURRENT_VERSION,
            mode,
            argon2_memory,
            argon2_iterations,
            argon2_parallelism,
            salt,
            nonce,
            original_file_size,
            original_name,
        }
    }

    /// Extracts the 7-byte base nonce used in chunked encryption mode.
    pub fn base_nonce(&self) -> [u8; 7] {
        let mut base = [0u8; 7];
        base.copy_from_slice(&self.nonce[..7]);
        base
    }

    /// Sets the 12-byte nonce field for chunked mode from a 7-byte base nonce,
    /// zero-filling the remaining 5 padding bytes.
    pub fn set_chunked_nonce(&mut self, base_nonce: &[u8; 7]) {
        self.nonce[..7].copy_from_slice(base_nonce);
        self.nonce[7..].fill(0);
    }

    /// Serializes the header into an exact 128-byte array.
    pub fn to_bytes(&self) -> Result<[u8; HEADER_SIZE], SfelError> {
        let name_bytes = self.original_name.as_bytes();
        if name_bytes.len() > MAX_NAME_LEN {
            return Err(SfelError::InvalidParameters(format!(
                "Original name length {} exceeds maximum header capacity of {} bytes",
                name_bytes.len(),
                MAX_NAME_LEN
            )));
        }

        let mut buf = [0u8; HEADER_SIZE];

        // 0..4: Magic "SFEL"
        buf[0..4].copy_from_slice(&MAGIC);

        // 4: Version (0x01)
        buf[4] = self.version;

        // 5: Mode (0x00 single, 0x01 chunked)
        buf[5] = self.mode as u8;

        // 6..10: Argon2 memory (KiB) big-endian u32
        buf[6..10].copy_from_slice(&self.argon2_memory.to_be_bytes());

        // 10..14: Argon2 iterations big-endian u32
        buf[10..14].copy_from_slice(&self.argon2_iterations.to_be_bytes());

        // 14..18: Argon2 parallelism big-endian u32
        buf[14..18].copy_from_slice(&self.argon2_parallelism.to_be_bytes());

        // 18..34: Salt 16 bytes
        buf[18..34].copy_from_slice(&self.salt);

        // 34..46: Nonce 12 bytes
        buf[34..46].copy_from_slice(&self.nonce);

        // 46..54: Original file size big-endian u64
        buf[46..54].copy_from_slice(&self.original_file_size.to_be_bytes());

        // 54..56: Original name length big-endian u16
        buf[54..56].copy_from_slice(&(name_bytes.len() as u16).to_be_bytes());

        // 56..56+N: Original name UTF-8 bytes
        buf[56..56 + name_bytes.len()].copy_from_slice(name_bytes);

        // 56+N..128: Zero padding (already 0s from initialization)

        Ok(buf)
    }

    /// Deserializes a 128-byte header from a slice.
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, SfelError> {
        if bytes.len() < HEADER_SIZE {
            return Err(SfelError::TruncatedFile);
        }

        // Validate Magic
        if &bytes[0..4] != &MAGIC {
            return Err(SfelError::InvalidFormat);
        }

        // Validate Version
        let version = bytes[4];
        if version != CURRENT_VERSION {
            return Err(SfelError::UnsupportedVersion(version));
        }

        // Validate Mode
        let mode = EncryptionMode::try_from(bytes[5])?;

        // Read Argon2 parameters
        let argon2_memory = u32::from_be_bytes(bytes[6..10].try_into().unwrap());
        let argon2_iterations = u32::from_be_bytes(bytes[10..14].try_into().unwrap());
        let argon2_parallelism = u32::from_be_bytes(bytes[14..18].try_into().unwrap());

        // Read Salt
        let mut salt = [0u8; 16];
        salt.copy_from_slice(&bytes[18..34]);

        // Read Nonce
        let mut nonce = [0u8; 12];
        nonce.copy_from_slice(&bytes[34..46]);

        // Read File Size
        let original_file_size = u64::from_be_bytes(bytes[46..54].try_into().unwrap());

        // Read Name Length
        let name_len = u16::from_be_bytes(bytes[54..56].try_into().unwrap()) as usize;
        if 56 + name_len > HEADER_SIZE {
            return Err(SfelError::InvalidFormat);
        }

        // Read Original Name
        let original_name = std::str::from_utf8(&bytes[56..56 + name_len])
            .map_err(|_| SfelError::InvalidFormat)?
            .to_string();

        Ok(Self {
            version,
            mode,
            argon2_memory,
            argon2_iterations,
            argon2_parallelism,
            salt,
            nonce,
            original_file_size,
            original_name,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_header_roundtrip() {
        let original = SfelHeader::new(
            EncryptionMode::Single,
            65536,
            3,
            4,
            [0x12; 16],
            [0x34; 12],
            1024,
            "sample_document.pdf".to_string(),
        );

        let bytes = original.to_bytes().unwrap();
        assert_eq!(bytes.len(), HEADER_SIZE);

        let parsed = SfelHeader::from_bytes(&bytes).unwrap();
        assert_eq!(original, parsed);
    }

    #[test]
    fn test_chunked_header_nonce() {
        let mut header = SfelHeader::new(
            EncryptionMode::Chunked,
            65536,
            3,
            4,
            [0xAA; 16],
            [0; 12],
            10_000_000,
            "large_video.mp4".to_string(),
        );

        let base_nonce = [1, 2, 3, 4, 5, 6, 7];
        header.set_chunked_nonce(&base_nonce);

        assert_eq!(header.base_nonce(), base_nonce);
        assert_eq!(&header.nonce[7..12], &[0u8; 5]);

        let bytes = header.to_bytes().unwrap();
        let parsed = SfelHeader::from_bytes(&bytes).unwrap();
        assert_eq!(parsed.base_nonce(), base_nonce);
    }

    #[test]
    fn test_header_invalid_magic() {
        let mut header_bytes = [0u8; HEADER_SIZE];
        header_bytes[0..4].copy_from_slice(b"NOPE");
        header_bytes[4] = CURRENT_VERSION;

        assert_eq!(
            SfelHeader::from_bytes(&header_bytes),
            Err(SfelError::InvalidFormat)
        );
    }

    #[test]
    fn test_header_unsupported_version() {
        let mut header_bytes = [0u8; HEADER_SIZE];
        header_bytes[0..4].copy_from_slice(&MAGIC);
        header_bytes[4] = 99; // invalid version

        assert_eq!(
            SfelHeader::from_bytes(&header_bytes),
            Err(SfelError::UnsupportedVersion(99))
        );
    }

    #[test]
    fn test_header_truncated() {
        let short_bytes = [0u8; 64];
        assert_eq!(
            SfelHeader::from_bytes(&short_bytes),
            Err(SfelError::TruncatedFile)
        );
    }

    #[test]
    fn test_header_name_exceeds_max() {
        let long_name = "a".repeat(MAX_NAME_LEN + 1);
        let header = SfelHeader::new(
            EncryptionMode::Single,
            65536,
            3,
            4,
            [0; 16],
            [0; 12],
            100,
            long_name,
        );
        assert!(header.to_bytes().is_err());
    }

    #[test]
    fn test_header_corrupted_name_len() {
        let original = SfelHeader::new(
            EncryptionMode::Single,
            65536,
            3,
            4,
            [0; 16],
            [0; 12],
            100,
            "test.txt".to_string(),
        );
        let mut bytes = original.to_bytes().unwrap();
        // Set name_len to 100 which exceeds 128 - 56 = 72
        bytes[54..56].copy_from_slice(&100u16.to_be_bytes());

        assert_eq!(
            SfelHeader::from_bytes(&bytes),
            Err(SfelError::InvalidFormat)
        );
    }
}
