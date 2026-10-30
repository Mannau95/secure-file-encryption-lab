# SFEL Master Test Plan & Verification Matrix

**Document Version:** 1.0.0  
**Target Release:** v0.1.0  
**Status:** Canonical Reference  

---

## 1. Overview & Verification Strategy

This test plan defines the testing methodology, test suites, and individual test cases for the **Secure File Encryption Lab (SFEL)**. The test strategy validates cryptographic correctness, anti-tamper resilience, memory security, filesystem atomicity, and UI accessibility.

All test cases are cataloged with a unique Test ID and initial status of **NOT RUN**.

---

## 2. Test Execution Commands

```bash
# Rust backend unit and integration tests
cd src-tauri
cargo test -- --nocapture

# Static analysis and linting
cargo check
cargo clippy -- -D warnings

# Frontend build verification
cd ..
npm run build
```

---

## 3. Test Suites & Verification Matrix

### 3.1 Unit Tests (Rust Backend Crypto & Format)

| Test ID | Test Category | Description | Preconditions | Test Steps | Expected Result | Status |
|---|---|---|---|---|---|---|
| **UT-KDF-001** | KDF | Argon2id deterministic key output | Valid password, fixed salt, fixed params | 1. Invoke `derive_key("correct-horse", salt, params)`.<br>2. Compare output against known RFC vector. | Derived 32-byte key matches expected test vector exactly. | NOT RUN |
| **UT-KDF-002** | KDF | Salt uniqueness sensitivity | Fixed password, two distinct 16B salts | 1. Derive key with Salt A.<br>2. Derive key with Salt B. | Resulting 32-byte keys differ completely (avalanche effect). | NOT RUN |
| **UT-KDF-003** | KDF | Memory zeroization on drop | `DerivedKey` struct instance created | 1. Allocate key buffer.<br>2. Explicitly drop struct.<br>3. Inspect underlying memory page if possible. | Memory buffer is zeroed out by `Zeroize` implementation. | NOT RUN |
| **UT-AEAD-001** | AEAD | AES-256-GCM roundtrip encryption/decryption | Valid 32B key, 12B nonce, sample plaintext, sample AAD | 1. Encrypt plaintext with AAD.<br>2. Decrypt ciphertext with same key, nonce, AAD. | Plaintext decrypted matches original byte-for-byte. | NOT RUN |
| **UT-AEAD-002** | AEAD | Tampered ciphertext detection | Encrypted payload | 1. Flip a single bit in the ciphertext.<br>2. Attempt decryption. | Decryption fails with authentication error; zero plaintext returned. | NOT RUN |
| **UT-AEAD-003** | AEAD | Tampered AAD detection | Encrypted payload with AAD | 1. Modify 1 byte in the AAD.<br>2. Attempt decryption. | Decryption fails with authentication error. | NOT RUN |
| **UT-AEAD-004** | AEAD | Wrong key rejection | Encrypted payload | 1. Attempt decryption using Key B $\neq$ Key A. | Decryption fails with authentication error. | NOT RUN |
| **UT-HDR-001** | Format | Header binary serialization roundtrip | Initialized `Header` struct | 1. Serialize `Header` into 64-byte array.<br>2. Deserialize 64 bytes back into `Header`. | Deserialized struct fields match original fields identically. | NOT RUN |
| **UT-HDR-002** | Format | Magic bytes validation | Byte array with invalid magic | 1. Create header with magic `0x42 0x41 0x44 0x21` (`BAD!`).<br>2. Call `Header::from_bytes()`. | Fails immediately with `SfelError::InvalidFormat`. | NOT RUN |
| **UT-HDR-003** | Format | Unsupported version rejection | Byte array with `version = 0x02` | 1. Create header with version `0x02`.<br>2. Call `Header::from_bytes()`. | Fails immediately with `SfelError::UnsupportedVersion(2)`. | NOT RUN |
| **UT-HDR-004** | Format | Argon2 parameter bounds enforcement | Parameter $m = 2048\text{ MiB}$ (> ceiling) | 1. Deserialize header with out-of-bound $m$ cost.<br>2. Call validation routine. | Fails with `SfelError::InvalidParameters`. | NOT RUN |
| **UT-CHK-001** | Chunks | Chunk nonce derivation uniqueness | Base nonce, sequence of chunk indexes | 1. Derive nonces for chunks 0, 1, 2, ... $10,000$.<br>2. Check for duplicate nonces. | All derived nonces are distinct; no collisions occur. | NOT RUN |
| **UT-CHK-002** | Chunks | Chunk AAD construction binding | Header, chunk index, `is_last` | 1. Generate AAD for chunk 0 (`is_last=0`).<br>2. Generate AAD for chunk 1 (`is_last=0`). | AAD reflects exact chunk index and header bytes. | NOT RUN |

---

### 3.2 Integration Tests (End-to-End Cryptography & File I/O)

| Test ID | Test Category | Description | Preconditions | Test Steps | Expected Result | Status |
|---|---|---|---|---|---|---|
| **IT-RT-001** | Roundtrip | Empty file (0 bytes) roundtrip | Empty file on disk | 1. Encrypt 0-byte file.<br>2. Decrypt resulting `.sfel` file. | Restored file is 0 bytes and identical to original. | NOT RUN |
| **IT-RT-002** | Roundtrip | Small file (< 1 MiB) single chunk | 256 KB text/binary file | 1. Encrypt file.<br>2. Decrypt resulting `.sfel` file. | Restored file matches SHA-256 hash of original. | NOT RUN |
| **IT-RT-003** | Roundtrip | Exact 1 MiB boundary file | Exactly 1,048,576 byte file | 1. Encrypt file.<br>2. Decrypt resulting `.sfel` file. | Restored file matches SHA-256 hash of original. | NOT RUN |
| **IT-RT-004** | Roundtrip | Multi-chunk file (5.5 MiB) | 5.5 MiB test file | 1. Encrypt file (produces 6 chunks).<br>2. Decrypt resulting `.sfel` file. | Restored file matches SHA-256 hash of original. | NOT RUN |
| **IT-COR-001** | Corruption | Bit flip in header | Valid `.sfel` container | 1. Mutate byte 12 in `.sfel` file.<br>2. Attempt decryption. | Decryption aborts with `AuthenticationFailed`. Temporary file unlinked. | NOT RUN |
| **IT-COR-002** | Corruption | Bit flip in middle chunk payload | Valid 5.5 MiB `.sfel` container | 1. Flip bit at offset 2.5 MB.<br>2. Attempt decryption. | Decryption fails at chunk 2; temp file deleted; zero plaintext leaks. | NOT RUN |
| **IT-COR-003** | Corruption | Altered authentication tag | Valid `.sfel` container | 1. Modify last 16 bytes of chunk 0.<br>2. Attempt decryption. | Decryption fails at chunk 0 with `AuthenticationFailed`. | NOT RUN |
| **IT-TRN-001** | Truncation | Truncated header (< 64 bytes) | Incomplete file (32 bytes) | 1. Pass 32-byte file to decryptor. | Fails immediately with `SfelError::TruncatedFile` or `InvalidFormat`. | NOT RUN |
| **IT-TRN-002** | Truncation | Missing final chunk | Valid `.sfel` file truncated before last chunk | 1. Remove last chunk bytes.<br>2. Attempt decryption. | Decryption halts; missing `is_last=0x01` causes `TruncatedFile` error. | NOT RUN |
| **IT-ORD-001** | Reorder | Swapped chunk positions | Multi-chunk `.sfel` container | 1. Swap bytes of Chunk 1 and Chunk 2.<br>2. Attempt decryption. | Chunk 1 decryption fails due to AAD index mismatch. Operation aborted. | NOT RUN |
| **IT-AUTH-001**| Auth | Wrong password attempt | Valid `.sfel` container | 1. Encrypt with "PasswordA".<br>2. Decrypt with "PasswordB". | Fails with `"Incorrect password or corrupted file"`. No plaintext written. | NOT RUN |
| **IT-CNC-001** | Cancel | Mid-stream operation cancellation | Ongoing encryption of 50 MB file | 1. Trigger encryption.<br>2. Fire cancellation token at 50% progress. | Operation stops immediately. Target file not created. `.tmp` file deleted. | NOT RUN |
| **IT-FS-001**  | Filesystem | Temp file cleanup on panic/abort | Valid file | 1. Inject simulated write I/O error mid-stream.<br>2. Catch error. | RAII `TempFileGuard` drops and unlinks `.tmp` file from disk. | NOT RUN |

---

### 3.3 Security & Side-Channel Tests

| Test ID | Test Category | Description | Preconditions | Test Steps | Expected Result | Status |
|---|---|---|---|---|---|---|
| **SEC-PLEAK-001** | Leakage | No partial plaintext left on disk | Valid `.sfel` container with corrupted chunk 3 | 1. Decrypt corrupted file.<br>2. Wait for error return.<br>3. Search target folder. | Target output file does not exist; zero `.tmp` files remain. | NOT RUN |
| **SEC-LOG-001**   | Logging | No passphrases or keys in logs | Logging enabled | 1. Perform full encrypt/decrypt cycle with known credentials.<br>2. Search all log outputs. | Zero instances of passwords, salts, or raw keys found in logs. | NOT RUN |
| **SEC-NONCE-001** | Entropy | Nonce uniqueness over 1,000 runs | Repetitive encryptions of same file | 1. Encrypt same file 1,000 times.<br>2. Extract base nonces from headers. | 1,000 unique base nonces; 0 collisions. | NOT RUN |
| **SEC-ZERO-001**  | Memory | Passphrase zeroization | Memory scanner tool / test harness | 1. Pass password to `cmd_encrypt`.<br>2. After command completes, inspect memory. | Passphrase buffer in Rust has been overwritten with zeros. | NOT RUN |

---

### 3.4 User Interface & Accessibility Tests

| Test ID | Test Category | Description | Preconditions | Test Steps | Expected Result | Status |
|---|---|---|---|---|---|---|
| **UI-THM-001** | Theming | Theme persistence | Default Dark theme active | 1. Switch to Light theme.<br>2. Reload UI.<br>3. Switch to Cyberpunk theme. | Themes apply immediately; selection persists in `localStorage`. | NOT RUN |
| **UI-KBD-001** | Accessibility | Full keyboard navigation | Encrypt form displayed | 1. Navigate entire form using only Tab, Shift-Tab, Enter, and Space. | All interactive inputs, buttons, and drop zones are focusable and usable. | NOT RUN |
| **UI-ARIA-001**| Accessibility | Screen reader announcements | Progress bar active | 1. Trigger encryption.<br>2. Monitor ARIA live region announcements. | Progress percentage and completion status announce correctly. | NOT RUN |
| **UI-ERR-001** | UX | Clear error notifications | Invalid file selected | 1. Attempt decrypting an arbitrary PNG file as `.sfel`. | Error dialog displays user-friendly explanation without crashing. | NOT RUN |

---

### 3.5 Build & Static Analysis Tests

| Test ID | Test Category | Description | Preconditions | Test Steps | Expected Result | Status |
|---|---|---|---|---|---|---|
| **BLD-CHK-001** | Build | Cargo compiler check | Clean repository | Run `cargo check --manifest-path src-tauri/Cargo.toml` | Exit code 0, 0 compilation errors. | NOT RUN |
| **BLD-CLP-001** | Lint | Rust Clippy linter | Rust 1.85+ toolchain | Run `cargo clippy -- -D warnings` | Exit code 0, 0 linter warnings. | NOT RUN |
| **BLD-NPM-001** | Build | Vite production build | Node.js 18+ | Run `npm run build` | Exit code 0, bundles successfully written to `dist/`. | NOT RUN |

---

### 3.6 Manual & Edge Case Verification

| Test ID | Test Category | Description | Preconditions | Test Steps | Expected Result | Status |
|---|---|---|---|---|---|---|
| **MAN-DND-001** | UX | Drag-and-drop file import | Desktop file available | 1. Drag file from OS Explorer/Finder onto drop zone.<br>2. Verify path populated. | Drop zone highlights on hover and captures target path. | NOT RUN |
| **MAN-UNI-001** | Filename | Unicode & special character filenames | File with emoji/accents (`📑_café_ñoño.txt`) | 1. Encrypt file.<br>2. Decrypt file. | Restored file matches exact Unicode filename without corruption. | NOT RUN |
| **MAN-LRG-001** | Performance | Large file (> 2 GB) encryption | 3 GB test file | 1. Encrypt 3 GB file.<br>2. Decrypt 3 GB file.<br>3. Monitor RAM in Task Manager. | RAM usage stays flat (< 150 MB); file hashes match. | NOT RUN |
| **MAN-DSK-001** | Resilience | Disk full simulation | Target drive with restricted free space | 1. Encrypt file larger than available space. | Graceful error `InsufficientSpace`; temp file unlinked. | NOT RUN |
