# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **SHA-256 Integrity Fingerprints:**
  - Added streaming SHA-256 file hashing in Rust (`crypto/hash.rs`, 64 KiB buffer) exposed via the `cmd_hash_file` Tauri command, with unit tests (empty file, known vector, missing file).
  - Source file fingerprint shown after encryption; restored file fingerprint shown after decryption, with a paste-to-compare verification field (`Sha256Inspector`).
  - Integrated SHA-256 fingerprint calculation and display across Batch Encryption (`useBatchEncrypt`, `BatchQueue`) and Batch Decryption (`useBatchDecrypt`, `BatchDecryptQueue` with inline hash verification).
  - Persisted SHA-256 fingerprints in `OperationContext` and added a dedicated `SHA-256` column with one-click copy and hash search in the History view (`History.jsx`).
  - No fabricated checksum is ever displayed in the web preview (non-Tauri) environment.
- **Batch Encryption & Decryption Queues (v0.2.0):** Multi-file drag-and-drop queues with per-file status, progress, retry of failed items and integrity verification.
- **Password & Passphrase Generator:** CSPRNG-based random password and Diceware passphrase generator integrated in the encryption form.
- **Bilingual UI (FR / EN):** Complete i18n system with language toggle across all views.
- **Configurable Argon2id Profiles (v0.2.0):**
  - Added `Argon2Profile` enum supporting `Fast` ($32\text{ MiB}, t=2, p=2$), `Standard` ($64\text{ MiB}, t=3, p=4$), and `Paranoid` ($256\text{ MiB}, t=5, p=8$).
  - Integrated profile selection into `cmd_encrypt` and `encrypt_file_with_profile`.
  - Added interactive visual profile selection cards in the React encryption flow (`Encrypt.jsx`).
  - Documented active profiles and parameters in the Settings view.
- **Shannon Entropy & Password Strength Meter (v0.2.0):**
  - Added Shannon pool entropy calculation ($H = L \times \log_2(R)$) with pattern/repetition deductions.
  - Added real-time entropy bit count display (`~X bits d'entropie`) and offline GPU brute-force crack time estimations.
- **IPC Compatibility & Argument Normalization:**
  - Standardized Tauri IPC parameter mapping (`sourcePath`, `destDir`, `password`, `profile`) across `useEncrypt` and `useDecrypt` hooks.
- **Cryptographic Engine & Binary Format:**
  - Argon2id password-based key derivation ($m=64\text{ MiB}, t=3, p=4$) with secure zeroization via `zeroize`.
  - Authenticated encryption/decryption using AES-256-GCM with 96-bit nonces and 128-bit authentication tags.
  - Chunked streaming pipeline (1 MiB chunks) with deterministic per-chunk nonce generation and AAD binding.
  - Binary header serialization and deserialization with strict format validation.
- **Safe File I/O & IPC Commands:**
  - RAII-based `TempFileGuard` ensuring automatic cleanup of intermediate temporary files upon failure or cancellation.
  - Atomic destination file replacement using `fs::rename`.
  - Tauri IPC command handlers (`cmd_encrypt`, `cmd_decrypt`, `cmd_cancel`) with real-time progress event streaming.
- **React Frontend (React 19 + Vite):**
  - Responsive multi-theme user interface (Light, Dark, and System).
  - Single-file drag-and-drop file target zones for encryption and decryption.
  - Interactive password strength meter with entropy estimation and confirmation checking.
  - Real-time progress bar with bytes processed, percentage, and cancellation support.
  - Operational history management with search, filtering, and local persistence.
  - Interactive Educational Lab page detailing AES-256-GCM AEAD, Argon2id memory hardness, and cryptographic attack vectors.
- **Project Scaffolding:** Initial repository structure using Tauri 2.5, React 19, and Vite.
- **Cargo Configuration:** Rust crate setup (`sfel_lib`) with edition 2024 and Rust 1.85+ minimum supported Rust version (MSRV).
- **Cryptographic Dependencies:** Integrated RustCrypto ecosystem crates (`aes-gcm`, `argon2`, `rand`, `zeroize`).
- **Strict Tauri Capabilities:** Configured default capabilities denying network, shell execution, and clipboard access to enforce local-only isolation.
- **Structured Error Handling:** Created `SfelError` enum with unified authentication/integrity error representations to protect against side-channel and oracle leakage.
- **Documentation Suite:**
  - Architecture overview (`docs/ARCHITECTURE.md`) covering Tauri IPC, memory boundaries, and streaming design.
  - Byte-by-byte file format specification (`docs/CRYPTO_FORMAT.md`) for the SFEL v1 binary envelope.
  - Comprehensive threat model (`docs/THREAT_MODEL.md`) defining protected assets, threat actors, mitigations, and explicit non-goals.
  - Architectural Decision Records (`docs/DECISIONS.md`) covering ADR-001 through ADR-008.
  - Systematic test plan (`docs/TEST_PLAN.md`) with unit, integration, security, and manual verification criteria.
  - End-user guide (`docs/USER_GUIDE.md`) explaining file encryption/decryption, password hygiene, error diagnostics, and FAQs.
  - Development roadmap (`ROADMAP.md`) mapping milestones from v0.1.0 MVP through v1.0.0 stable.
  - Dual open-source licensing under MIT and Apache-2.0 (`LICENSE`).
