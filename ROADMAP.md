# Roadmap: Secure File Encryption Lab (SFEL)

This roadmap outlines the planned development milestones for the Secure File Encryption Lab desktop application.

---

## Release Schedule & Feature Milestones

```
  v0.1.0 (MVP)             v0.2.0                    v0.3.0                   v1.0.0 (Stable)
+----------------+       +------------------+      +-------------------+    +--------------------+
| Core Crypto    |  -->  | Batch Processing |  --> | Alternative AEAD  | -> | External Audit     |
| SFEL v1 Format |       | Entropy Meter    |      | Multilingual i18n |    | Production Bundles |
| Atomic File IO |       | Operation Log    |      | Cross-Platform CI |    | Complete Docs      |
| Education Lab  |       | Custom Argon2    |      | Keyfile Support   |    | Long-Term Support  |
+----------------+       +------------------+      +-------------------+    +--------------------+
```

---

### v0.1.0 — Minimum Viable Product (Current Target)

**Focus:** Core cryptographic engine, secure atomic streaming I/O, safe defaults, and educational interface.

- [x] Application architecture and Tauri 2 scaffolding.
- [ ] SFEL v1 file format specification and serialization/deserialization engine.
- [ ] Authenticated encryption with AES-256-GCM (128-bit tag).
- [ ] Key derivation with Argon2id ($m=64\text{ MiB}, t=3, p=4$).
- [ ] Safe streaming I/O with 1 MiB chunking for files of any size.
- [ ] Atomic file creation with temporary file cleanup on interruption or failure.
- [ ] Zero network access capability restriction in Tauri configuration.
- [ ] Clean React UI with single-file drag-and-drop encryption and decryption.
- [ ] Real-time operation progress reporting and graceful cancellation.
- [ ] Multi-theme support: Dark (default), Light, and Cyberpunk.
- [ ] Interactive Cryptography Educational Lab page explaining:
  - Symmetric AEAD vs plain stream/block ciphers.
  - Argon2id memory hardness against ASIC and GPU attacks.
  - Byte-by-byte visual breakdown of the `.sfel` header.
- [ ] Initial suite of unit tests and integration tests.

---

### v0.2.0 — Usability & Batch Operations

**Focus:** Enhanced user workflow, password quality feedback, and auditing history.

- [ ] **Batch Processing:** Multi-file drag-and-drop encryption and decryption queue.
- [ ] **Folder Archival & Encryption:** Tar/zip streaming integration to encrypt entire directory structures into a single `.sfel` container.
- [x] **Real-time Password Entropy Meter:** Shannon/NIST pool entropy estimator with bits display and offline crack time estimation.
- [x] **Operation History & Verification Log:** Local in-memory and persistent storage of recent operations (paths, timestamps, status).
- [x] **Configurable Argon2id Profiles:**
  - *Fast / Low-Resource:* $m=32\text{ MiB}, t=2, p=2$ (for resource-constrained environments).
  - *Standard:* $m=64\text{ MiB}, t=3, p=4$ (recommended default).
  - *Paranoid / High-Security:* $m=256\text{ MiB}, t=5, p=8$ (for high-value data on capable hardware).
- [x] **Custom Output Destination:** Option to select a custom output directory or rename the decrypted file.

---

### v0.3.0 — Advanced Cryptography & Portability

**Focus:** Alternative cipher suites, keyfile support, and multi-platform hardening.

- [ ] **XChaCha20-Poly1305 Cipher Suite:** Support for 192-bit extended nonces, removing nonce collision risks even across billions of operations.
- [ ] **Keyfile Authentication:** Multi-factor derivation combining user password with an external keyfile (e.g., USB key or random binary file).
- [ ] **Internationalization (i18n):** Complete localized UI strings (English, Spanish, French, German, Japanese, Simplified Chinese).
- [ ] **Cross-Platform Hardening & CI:**
  - Automated CI test matrix across Windows 11, macOS (Apple Silicon & Intel), and Ubuntu Linux.
  - Verification of OS-level atomic renames across APFS, NTFS, and ext4 filesystems.
- [ ] **Benchmark Utility:** Built-in benchmarking tool to measure Argon2id derivation latency and AES-GCM streaming throughput on the user's CPU.

---

### v1.0.0 — Production Release & Audit

**Focus:** Independent security verification, certified installer binaries, and stability.

- [ ] **Independent Cryptographic Audit:** Third-party professional review of the Rust crypto engine, memory zeroization, and Tauri IPC bridge.
- [ ] **Fuzz Testing:** AFL / cargo-fuzz harness testing the header parser, chunk deserializer, and corrupted file handler against malformed inputs.
- [ ] **Signed Production Installers:**
  - Windows: MSI installer and NSIS standalone setup signed with code-signing certificate.
  - macOS: DMG package notarized by Apple.
  - Linux: AppImage, Flatpak, and `.deb` distribution packages.
- [ ] **Documentation Complete:** Finalized architecture documentation, threat model, API reference, and comprehensive user handbook.
- [ ] **Formal API Freeze:** Long-term compatibility commitment for `.sfel` container format v1.
