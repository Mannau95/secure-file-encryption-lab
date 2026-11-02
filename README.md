# Secure File Encryption Lab (SFEL)

[![License: MIT OR Apache-2.0](https://img.shields.io/badge/License-MIT%20OR%20Apache--2.0-blue.svg)](#license)
[![Rust](https://img.shields.io/badge/Rust-1.85%2B%20(Edition%202024)-orange.svg)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-2.5-brightgreen.svg)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19.1-cyan.svg)](https://react.dev/)
[![Security](https://img.shields.io/badge/Zero--Network-Enforced-success.svg)](#security-properties)

> A modern, secure desktop application designed to demonstrate and deliver military-grade file encryption using AES-256-GCM authenticated encryption and memory-hard Argon2id key derivation.

---

## Overview

**Secure File Encryption Lab (SFEL)** is an open-source desktop tool built with Rust and Tauri 2. It bridges rigorous cryptographic engineering with an accessible, interactive user interface. SFEL enables users to encrypt individual files of arbitrary size with custom passphrases into a tamper-evident binary format (`.sfel`), while providing a transparent educational environment to inspect the underlying cryptographic mechanisms.

```
       +-------------------------------------------------------------+
       |               Secure File Encryption Lab (SFEL)             |
       +-------------------------------------------------------------+
       |  [ Encrypt File ]      [ Decrypt File ]      [ Crypto Lab ] |
       |                                                             |
       |  +-------------------------------------------------------+  |
       |  |                                                       |  |
       |  |      Drag & Drop file here to Encrypt or Decrypt      |  |
       |  |                      or Browse                        |  |
       |  |                                                       |  |
       |  +-------------------------------------------------------+  |
       |                                                             |
       |  Password: [ ************************ ]  [Show]             |
       |  Strength: [=========================] Strong (92 bits)     |
       |                                                             |
       |  Cipher: AES-256-GCM  |  KDF: Argon2id (m=64MB, t=3, p=4)   |
       |                                                             |
       |  [ Cancel ]                                 [ Encrypt Now ] |
       +-------------------------------------------------------------+
```
*(Screenshot placeholder: UI showing drag-and-drop file encryption with interactive crypto parameters)*

---

## Key Features

- **Dual AEAD Cipher Suites (`AES-256-GCM` & `ChaCha20-Poly1305`):** Choose between hardware-accelerated AES-256-GCM and RFC 8439 ARX ChaCha20-Poly1305, automatically encoded in the `.sfel` header and detected upon decryption.
- **State-of-the-Art Key Derivation & 2FA Keyfiles:** Employs Argon2id (winner of the Password Hashing Competition) with configurable profiles (`Fast`: 32 MiB, `Standard`: 64 MiB default, `Paranoid`: 256 MiB) and optional **Multi-Factor Keyfile Authentication (2FA)** with a built-in 4096-byte OS CSPRNG keyfile generator.
- **File & Folder Encryption (`.tar` Streaming):** Encrypts both individual files and entire directory trees recursively into a single `.sfel` container, with atomic directory extraction and Zip-Slip / Tar-Slip path traversal protection.
- **Built-in Hardware Cryptographic Benchmark:** Real-time CPU benchmark in Settings measuring Argon2id latency (ms) across all 3 profiles and AEAD streaming throughput (MiB/s) for AES-256-GCM vs ChaCha20-Poly1305.
- **High-Entropy Password & Passphrase Generator:** Built-in OS CSPRNG random password generator and Diceware passphrase generator with real-time Shannon entropy and GPU crack-time estimation.
- **Multi-File Batch Queues:** Sequential batch encryption and decryption queues with per-file progress tracking, retry of failed items, and custom destination folders.
- **SHA-256 Integrity Verification:** Streaming SHA-256 file fingerprint calculation and verification after encryption/decryption, in batch queues, and in the searchable operation history.
- **Bilingual Interface (FR / EN):** Instant language switching between French and English across all views.
- **Chunked Streaming Engine (Constant Memory):** Encrypts and decrypts files in 1 MiB authenticated chunks. Files of any size (from kilobytes to gigabytes) are processed without loading the entire payload into RAM.
- **Cryptographic Anti-Tamper Chaining:** Each chunk binds its unique chunk index and final-chunk flag into the AEAD Associated Data (AAD), preventing chunk deletion, reordering, duplication, or truncation.
- **Crash-Resilient Atomic Writes:** Writes to temporary files first (`.sfel.tmp`) and executes an atomic rename on completion. Interrupted or corrupted operations leave existing files untouched and leave zero leftover artifacts.
- **Strict Network Isolation:** Configured with Tauri v2 capabilities explicitly denying network access, child shell execution, and clipboard scraping.
- **Educational Cryptography Lab:** Interactive educational panel explaining how modern block ciphers, nonces, key derivation functions, and binary containers work in practice.
- **Multi-Theme Support:** Beautiful, accessible UI available in Dark, Light, and System themes.

---

## Security Properties

### What SFEL Protects Against

| Threat | Defense Mechanism in SFEL |
|---|---|
| **Ciphertext Inspection (Eavesdropping)** | AES-256-GCM provides standard IND-CPA and IND-CCA2 security. An attacker cannot decrypt or learn plaintext contents without the password. |
| **Tampering & Bit-Flipping** | AES-GCM's 128-bit authentication tag guarantees ciphertext integrity. Even a single flipped bit causes decryption to fail. |
| **Offline Dictionary & Brute-Force Attacks** | Argon2id ($m=64\text{ MiB}, t=3, p=4$) forces an attacker to dedicate 64 MiB of high-bandwidth memory per attempt, defeating GPUs and custom ASICs. |
| **Nonce Reuse Attacks** | A fresh 96-bit base nonce is generated from the OS cryptographically secure random number generator (`OsRng`) for every single encryption. |
| **Chunk Swapping, Duplication & Truncation** | Each chunk derives a unique counter-based nonce and signs its index and `is_final` flag in the Associated Authenticated Data (AAD). |
| **Filename Leakage** | The original filename is encrypted inside the container payload, preserving metadata privacy. |
| **Memory Residuals** | Passwords, derived keys, and intermediate cryptographic state implement the `Zeroize` trait to wipe memory buffers immediately upon dropping. |
| **Data Exfiltration via Malware** | Tauri runtime capabilities strictly prohibit network sockets (`default-src 'self'`), shell execution, and remote resource loading. |

### What SFEL Does Not Protect Against

- **Compromised Host / Keyloggers:** If an attacker has root or administrative access, or has installed keyloggers or malware in your OS session, they can intercept passwords as you type them.
- **Weak Passwords:** No KDF can protect a 4-letter password against targeted brute force. Users must choose sufficiently strong passphrases.
- **Physical Side-Channel Attacks:** SFEL relies on the RustCrypto ecosystem and OS hardware AES instructions; it is not hardened against physical laboratory side-channel attacks (e.g., differential power analysis on physical hardware).
- **Compelled Disclosure:** SFEL does not implement plausible deniability (e.g., hidden volumes). An `.sfel` file is explicitly identifiable by its `SFEL` magic header.
- **Post-Quantum Cryptography:** AES-256 provides 128 bits of security against Grover's algorithm (quantum-safe symmetric strength), but Argon2id is not a post-quantum proof construct.

---

## Technology Stack

- **Backend / Core Engine:**
  - [Rust](https://www.rust-lang.org/) (2024 Edition, Rust 1.85+)
  - [Tauri 2.5](https://tauri.app/) (Desktop application framework)
  - [RustCrypto `aes-gcm`](https://crates.io/crates/aes-gcm) (Pure Rust / hardware-accelerated AES-256-GCM)
  - [RustCrypto `argon2`](https://crates.io/crates/argon2) (Argon2id password hashing & key derivation)
  - [RustCrypto `zeroize`](https://crates.io/crates/zeroize) (Secure memory wiping)
  - [`rand`](https://crates.io/crates/rand) with `OsRng` (System entropy)
- **Frontend:**
  - [React 19](https://react.dev/)
  - [Vite 6](https://vitejs.dev/)
  - [React Router 7](https://reactrouter.com/)
  - Pure CSS modules with responsive modern theming

---

## Architecture Overview

SFEL strictly separates the presentation layer from cryptographic operations:

```
+---------------------------------------------------------------+
|                       REACT 19 FRONTEND                       |
|   Drag-and-Drop | Password Input | Progress Bar | Crypto Lab  |
+---------------------------------------------------------------+
                               |
                        Tauri IPC Invoke
                               v
+---------------------------------------------------------------+
|                       TAURI BRIDGE (RUST)                     |
|      Permissions Sandbox (Zero Network, Scoped Local FS)      |
+---------------------------------------------------------------+
                               |
                               v
+---------------------------------------------------------------+
|                      BACKEND CORE ENGINE                      |
|                                                               |
|  +--------------------+  +------------------+  +-----------+  |
|  |     Crypto KDF     |  |   Crypto AEAD    |  |  Chunks   |  |
|  |     (Argon2id)     |  |  (AES-256-GCM)   |  | (1MB AAD) |  |
|  +--------------------+  +------------------+  +-----------+  |
|                                                               |
|  +--------------------+  +------------------+  +-----------+  |
|  | Format (SFEL v1)   |  | Safe File I/O    |  | Zeroize   |  |
|  | (Header Validator) |  | (Atomic Temp RW) |  | (Cleanup) |  |
|  +--------------------+  +------------------+  +-----------+  |
+---------------------------------------------------------------+
```

For comprehensive details on thread models, cancellation mechanics, and memory isolation, see [Architecture Documentation](docs/ARCHITECTURE.md).

---

## File Format Overview

SFEL files use the `.sfel` binary envelope format. Every file begins with a 64-byte fixed header followed by authenticated chunks:

```
+-------------------------------------------------------------------------+
|                              SFEL HEADER (64 Bytes)                     |
+--------------------+---------+---------+-----------+--------+-----------+
| Magic 'SFEL' (4B)  | Ver(1B) | Mode(1B)| Cipher(1B)| KDF(1B)| Salt(16B) |
+--------------------+---------+---------+-----------+--------+-----------+
| Argon2 Params: m_cost (4B) | t_cost (4B) | p_cost (4B)                  |
+-------------------------------------------------------------------------+
| Base Nonce (12B)                                      | Reserved (16B)  |
+-------------------------------------------------------------------------+
|                              AUTHENTICATED DATA CHUNKS                  |
+------------------+---------------------+--------------------------------+
| Chunk Length(4B) | Is_Last Flag (1B)   | Ciphertext + AES-GCM Tag (16B) |
+------------------+---------------------+--------------------------------+
```

For the exact byte-level specification, field bounds, and verification logic, see [SFEL Crypto Format Specification](docs/CRYPTO_FORMAT.md).

---

## Installation & Prerequisites

### Prerequisites

Ensure you have the following installed on your machine:
- **Rust:** Version 1.85 or later (`rustup update`)
- **Node.js:** Version 18.0 or later (LTS recommended)
- **npm:** Included with Node.js
- **Platform Build Tools:**
  - **Windows:** Microsoft C++ Build Tools (via Visual Studio Installer).
  - **Linux (Ubuntu/Debian):** `sudo apt update && sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev`
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`)

### Clone the Repository

```bash
git clone https://github.com/your-username/secure-file-encryption-lab.git
cd secure-file-encryption-lab
```

---

## Development

Run the frontend Vite development server and Tauri application simultaneously:

```bash
# 1. Install frontend dependencies
npm install

# 2. Launch Tauri in development mode with hot-reloading
npm run tauri dev
```

---

## Building for Production

Compile optimized native desktop binaries:

```bash
# Production desktop bundle
npm run tauri build
```

The compiled binaries and installers will be generated under `src-tauri/target/release/bundle/`.

---

## Testing

SFEL includes comprehensive unit and integration test suites covering cryptographic primitives, corrupted file handling, and chunk boundary conditions:

```bash
# Run all Rust backend unit and integration tests
cd src-tauri
cargo test

# Run Rust linter (Clippy)
cargo clippy -- -D warnings

# Run frontend build check
npm run build
```

See [Test Plan](docs/TEST_PLAN.md) for the complete test matrix.

---

## Documentation Index

- [Architecture Overview](docs/ARCHITECTURE.md)
- [SFEL v1 Cryptographic Format Specification](docs/CRYPTO_FORMAT.md)
- [Threat Model & Security Boundary Analysis](docs/THREAT_MODEL.md)
- [Architecture Decision Records (ADRs)](docs/DECISIONS.md)
- [Comprehensive Test Plan](docs/TEST_PLAN.md)
- [User Guide & FAQ](docs/USER_GUIDE.md)
- [Project State](PROJECT_STATE.md)
- [Product Roadmap](ROADMAP.md)
- [Changelog](CHANGELOG.md)

---

## License

This project is dual-licensed under either:

- **MIT License** ([LICENSE](LICENSE) or [http://opensource.org/licenses/MIT](http://opensource.org/licenses/MIT))
- **Apache License, Version 2.0** ([LICENSE](LICENSE) or [http://www.apache.org/licenses/LICENSE-2.0](http://www.apache.org/licenses/LICENSE-2.0))

You may choose to use this software under the terms of either license.

---

## Acknowledgments

- [RustCrypto](https://github.com/RustCrypto) for providing memory-safe, audited cryptographic primitives (`aes-gcm`, `argon2`, `zeroize`).
- [The Tauri Team](https://tauri.app/) for the lightweight, secure desktop application framework.
- [React](https://react.dev/) and [Vite](https://vitejs.dev/) communities.

---

## Disclaimer

> **IMPORTANT NOTICE:** Secure File Encryption Lab (SFEL) is an educational and portfolio project developed to demonstrate secure software engineering principles, modern cryptography, and safe systems programming. While it strictly adheres to modern cryptographic standards (Argon2id, AES-256-GCM, memory zeroization), **it has not undergone an independent formal security audit**. It should not be used as the sole protection mechanism for critical enterprise secrets or life-critical environments. Always maintain verified, independent backups of valuable data.
