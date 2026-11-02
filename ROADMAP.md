# Roadmap: Secure File Encryption Lab (SFEL)

This roadmap outlines the completed development milestones for the Secure File Encryption Lab desktop application up to **v1.0.0 (Production Stable)**.

---

## Release Schedule & Feature Milestones

```
  v0.1.0 (MVP)             v0.2.0                    v0.3.0                   v1.0.0 (Stable)
+----------------+       +------------------+      +-------------------+    +--------------------+
| Core Crypto    |  -->  | Batch Processing |  --> | Alternative AEAD  | -> | Fuzz Hardening     |
| SFEL v1 Format |       | Folder Archival  |      | Hardware Bench    |    | Production Bundles |
| Atomic File IO |       | SHA-256 Audit    |      | Cross-Platform CI |    | Complete Docs      |
| Education Lab  |       | Custom Argon2    |      | Keyfile 2FA       |    | Formal API Freeze  |
+----------------+       +------------------+      +-------------------+    +--------------------+
```

---

### v0.1.0 — Minimum Viable Product (Complete)

**Focus:** Core cryptographic engine, secure atomic streaming I/O, safe defaults, and educational interface.

- [x] Application architecture and Tauri 2 scaffolding.
- [x] SFEL v1 file format specification and serialization/deserialization engine.
- [x] Authenticated encryption with AES-256-GCM (128-bit tag).
- [x] Key derivation with Argon2id ($m=64\text{ MiB}, t=3, p=4$).
- [x] Safe streaming I/O with 1 MiB chunking for files of any size.
- [x] Atomic file creation with temporary file cleanup on interruption or failure.
- [x] Zero network access capability restriction in Tauri configuration.
- [x] Clean React UI with single-file drag-and-drop encryption and decryption.
- [x] Real-time operation progress reporting and graceful cancellation.
- [x] Multi-theme support: Dark (default), Light, and System.
- [x] Interactive Cryptography Educational Lab page explaining:
  - Symmetric AEAD vs plain stream/block ciphers.
  - Argon2id memory hardness against ASIC and GPU attacks.
  - Byte-by-byte visual breakdown of the `.sfel` header.
- [x] Initial suite of unit tests and integration tests.

---

### v0.2.0 — Usability, Batch Operations & Integrity Verification (Complete)

**Focus:** Enhanced user workflow, batch processing, folder archival, password generation/quality feedback, bilingual UI, and SHA-256 auditing.

- [x] **Batch Processing:** Multi-file drag-and-drop encryption and decryption queue with per-file progress and retry support.
- [x] **Folder Archival & Encryption:** Tar streaming integration to encrypt entire directory structures into a single `.sfel` container and automatically extract them upon decryption with Zip-Slip / Tar-Slip protection.
- [x] **Real-time Password Entropy Meter:** Shannon/NIST pool entropy estimator with bits display and offline crack time estimation.
- [x] **High-Entropy Password & Passphrase Generator:** Built-in CSPRNG character generator and Diceware passphrase generator.
- [x] **SHA-256 Integrity Fingerprints:** Streaming SHA-256 checksum computation (`cmd_hash_file`), post-operation verification inspector (`Sha256Inspector`), and batch/history hash tracking.
- [x] **Operation History & Verification Log:** Local in-memory and persistent storage of recent operations (paths, SHA-256 hashes, timestamps, status) with search and filtering.
- [x] **Bilingual Interface (FR / EN):** Complete French and English localization across all views and components.
- [x] **Configurable Argon2id Profiles:**
  - *Fast / Low-Resource:* $m=32\text{ MiB}, t=2, p=2$ (for resource-constrained environments).
  - *Standard:* $m=64\text{ MiB}, t=3, p=4$ (recommended default).
  - *Paranoid / High-Security:* $m=256\text{ MiB}, t=5, p=8$ (for high-value data on capable hardware).
- [x] **Custom Output Destination:** Option to select a custom output directory or rename the decrypted file.

---

### v0.3.0 — Advanced Cryptography & Portability (Complete)

**Focus:** Alternative cipher suites, keyfile multi-factor authentication, hardware benchmarking, and multi-platform CI.

- [x] **ChaCha20-Poly1305 Cipher Suite:** Support for the RFC 8439 ARX AEAD cipher alongside AES-256-GCM, automatically encoded and detected via the SFEL header mode byte (`0x10` / `0x11`).
- [x] **Keyfile Authentication (2FA):** Multi-factor derivation combining user password with the SHA-256 digest of an external keyfile (`SFEL-KEYFILE-V1` domain separation), plus a 4096-byte CSPRNG keyfile generator (`cmd_generate_keyfile`).
- [x] **Cross-Platform Hardening & CI:**
  - Automated GitHub Actions CI & Release workflows (`.github/workflows/ci.yml`, `.github/workflows/release.yml`) across Windows, macOS (Apple Silicon & Intel), and Ubuntu Linux.
  - Verification of OS-level atomic renames across APFS, NTFS, and ext4 filesystems.
- [x] **Benchmark Utility:** Built-in hardware benchmarking tool (`cmd_benchmark`) measuring Argon2id derivation latency across all 3 profiles (`Fast`, `Standard`, `Paranoid`) and AEAD streaming throughput (`AES-256-GCM` vs `ChaCha20-Poly1305`) on the user's CPU.

---

### v1.0.0 — Production Release & Security Hardening (Complete)

**Focus:** Fuzz testing, production installer pipeline, complete documentation, and formal `.sfel` v1 format freeze.

- [x] **Fuzz Testing & Malformed Input Hardening:** Automated fuzzing harness (`src-tauri/tests/fuzz_tests.rs`) testing the 128-byte header parser, chunk stream deserializer, AEAD decryptor, and TAR directory extractor against thousands of mutated and corrupted inputs with zero panics and zero temp file leaks.
- [x] **Production Installer Pipeline:**
  - Windows: Native `.msi` and NSIS standalone setup bundles (`npm run tauri build`).
  - Cross-platform GitHub Actions release pipeline for Windows, macOS (`.dmg`), and Linux (`.AppImage`, `.deb`).
- [x] **Documentation Complete:** Finalized architecture documentation, threat model, 128-byte binary format specification, ADR log, test plan, and user handbook.
- [x] **Formal API Freeze:** Long-term compatibility commitment for `.sfel` container format v1.
