# Architecture Decision Records (ADRs)

This document records the architectural and cryptographic decisions made during the design and development of the **Secure File Encryption Lab (SFEL)** project.

---

## Index of Decisions

- [ADR-001: Choice of AES-256-GCM as Primary Cipher](#adr-001-choice-of-aes-256-gcm-as-primary-cipher)
- [ADR-002: Baseline Argon2id Parameters (m=64MiB, t=3, p=4)](#adr-002-baseline-argon2id-parameters-m64mib-t3-p4)
- [ADR-003: Chunked Streaming Encryption Protocol (1 MiB Chunks, Counter Nonces)](#adr-003-chunked-streaming-encryption-protocol-1-mib-chunks-counter-nonces)
- [ADR-004: File Format Versioning & Extensibility Strategy](#adr-004-file-format-versioning--extensibility-strategy)
- [ADR-005: Zero-Network Permission Sandbox Model](#adr-005-zero-network-permission-sandbox-model)
- [ADR-006: Adoption of JavaScript (ES Modules) for Frontend Layer](#adr-006-adoption-of-javascript-es-modules-for-frontend-layer)
- [ADR-007: Atomic Temp File Write and Rename Strategy](#adr-007-atomic-temp-file-write-and-rename-strategy)
- [ADR-008: Dual MIT and Apache-2.0 Open-Source Licensing](#adr-008-dual-mit-and-apache-20-open-source-licensing)

---

## ADR-001: Choice of AES-256-GCM as Primary Cipher

- **Status:** Accepted
- **Date:** October 2026

### Context
SFEL requires an Authenticated Encryption with Associated Data (AEAD) algorithm that guarantees both confidentiality and tamper-evident message authenticity. Several candidates exist:
- **AES-256-GCM:** NIST-standardized, supported by hardware acceleration (AES-NI / ARM Crypto Extensions) across virtually all modern desktop processors.
- **XChaCha20-Poly1305:** Modern stream cipher with large 192-bit nonces, immune to nonce reuse collisions, but lacking dedicated CPU hardware instructions on typical x86_64 desktop chips.
- **AES-GCM-SIV:** Synthetic Initialization Vector variant resistant to nonce reuse, but requires two cryptographic passes over data and has lower throughput.

### Decision
We select **AES-256-GCM** as the default primary AEAD cipher for the SFEL v1 format.

### Consequences
- **Positive:** Leverages native CPU instructions (AES-NI), achieving gigabyte-per-second encryption and decryption throughput with minimal battery and CPU usage. Supported by FIPS and widespread industry compliance standards.
- **Negative:** AES-GCM is vulnerable to catastrophically losing authenticity if a 96-bit nonce is ever reused with the same key.
- **Mitigation:** A fresh cryptographically secure random 96-bit `base_nonce` is generated from `OsRng` for every file, and per-chunk nonces are derived through deterministic counter XOR, mathematically preventing nonce reuse.

### Alternatives Considered
- *XChaCha20-Poly1305:* Deferred to roadmap v0.3.0 as an optional alternate cipher for systems lacking AES hardware instructions.
- *AES-GCM-SIV:* Rejected due to higher computational overhead and slower streaming performance.

---

## ADR-002: Baseline Argon2id Parameters (m=64MiB, t=3, p=4)

- **Status:** Accepted
- **Date:** October 2026

### Context
Password-based key derivation requires resistance against offline brute-force attacks powered by parallel GPU rigs, FPGAs, and ASICs. PBKDF2 and bcrypt are memory-light and vulnerable to hardware acceleration. Argon2id is the state-of-the-art memory-hard key derivation function (RFC 9106), but its parameters must balance security against user latency on desktop computers.

### Decision
We standardize on the following baseline parameters for SFEL v1:
- Algorithm: **Argon2id**
- Memory cost ($m$): **64 MiB** ($65,536\text{ KiB}$)
- Time cost ($t$): **3 iterations**
- Parallelism ($p$): **4 threads**
- Salt length: **16 bytes** (128 bits)
- Output key length: **32 bytes** (256 bits)

### Consequences
- **Positive:** Forces an attacker to dedicate 64 MiB of high-bandwidth memory per guess, drastically reducing the number of parallel attempts feasible on GPUs and ASICs. The 128-bit random salt neutralizes rainbow tables.
- **Negative:** Derivation introduces approximately 200 ms to 350 ms of CPU latency on desktop systems.
- **User Experience:** This delay is imperceptible for interactive file encryption operations, while providing strong defense against dictionary attacks.

### Alternatives Considered
- *PBKDF2-HMAC-SHA256 (600,000 iterations):* Rejected because it lacks memory hardness and can be cracked at millions of attempts per second on modern GPUs.
- *Argon2id with 256 MiB:* Considered, but rejected for default v1 profile to maintain responsiveness on entry-level laptops and older PCs. Marked for configurable "Paranoid" profile in v0.2.0.

---

## ADR-003: Chunked Streaming Encryption Protocol (1 MiB Chunks, Counter Nonces)

- **Status:** Accepted
- **Date:** October 2026

### Context
Encrypting an entire file in a single in-memory AEAD operation requires loading the entire file into RAM. For large files (e.g., 10 GB disk images or video files), this causes out-of-memory (OOM) crashes and prevents progress reporting. Conversely, streaming chunks without cryptographic binding allows adversaries to reorder, delete, or duplicate chunks.

### Decision
We implement a **1 MiB chunked streaming protocol**:
1. Files are partitioned into sequential 1 MiB ($1,048,576\text{ bytes}$) plaintext chunks.
2. Each chunk receives a distinct nonce: $\text{Nonce}_i = \text{base\_nonce} \oplus \text{Pad}_{12}(i)$.
3. Each chunk computes an AEAD tag over:
   $$\text{AAD}_i = \text{Header}[0..64] \;\|\; \text{Index}_i \;\|\; \text{IsLast}_i$$
4. A 4-byte chunk length and 1-byte `is_last` flag precede each encrypted payload.

### Consequences
- **Positive:**
  - Memory consumption is constant ($O(1)$) regardless of whether the file is 50 KB or 50 GB.
  - Streaming progress events can be reported at regular 1 MiB intervals.
  - Cryptographic anti-reorder, anti-duplication, and anti-truncation protection: any swapped or missing chunk immediately triggers an authentication error.
  - Chunks cannot be spliced between different files because the header bytes are included in every chunk's AAD.
- **Negative:** Introduces a small overhead of 21 bytes per 1 MiB chunk ($0.002\%$).

### Alternatives Considered
- *Whole-file in-memory buffer:* Rejected due to failure on large files.
- *64 KiB Chunks:* Rejected because the per-chunk overhead is higher and CPU context switching overhead increases.

---

## ADR-004: File Format Versioning & Extensibility Strategy

- **Status:** Accepted
- **Date:** October 2026

### Context
Cryptographic software must anticipate format upgrades (e.g., adding new ciphers, larger nonces, or signature envelopes) without breaking backward compatibility or exposing downgrade vulnerabilities.

### Decision
We introduce explicit, immutable versioning in the SFEL binary header:
- Byte offset 4 contains an explicit 8-bit `version` field (currently `0x01`).
- Byte offsets `0x30..0x3F` contain 16 zero-padded `reserved` bytes.
- Parser strictly rejects any file with `version > CURRENT_VERSION` with an informative error, rather than attempting speculative parsing.
- Future versions must preserve the 4-byte magic string `SFEL`.

### Consequences
- **Positive:** Guarantees unambiguous identification and forwards compatibility. Prevents downgrade attacks by binding the version into the AEAD Associated Authenticated Data.
- **Negative:** Modifying header structures in future revisions requires bumping the version counter.

### Alternatives Considered
- *Variable-length JSON/Protobuf headers:* Rejected because text and dynamic binary serialization introduce attack surface, parsing complexity, and potential buffer overflow risks.

---

## ADR-005: Zero-Network Permission Sandbox Model

- **Status:** Accepted
- **Date:** October 2026

### Context
A file encryption utility manages sensitive user passphrases and unencrypted plaintext. If the application or any of its UI dependencies are compromised (e.g., via a supply-chain vulnerability in an npm dependency), an attacker could exfiltrate passphrases or keys over the network.

### Decision
We enforce a **Zero-Network capability sandbox** within Tauri:
1. No networking plugins (HTTP, fetch, WebSockets) are registered in the Tauri runtime.
2. The Content Security Policy (CSP) is locked to: `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: https://asset.localhost`.
3. Shell execution and clipboard background listeners are completely omitted from Tauri capabilities.

### Consequences
- **Positive:** The frontend code is physically incapable of opening network sockets or transmitting data off the host system. Exfiltration via npm supply chain attacks is structurally neutralized.
- **Negative:** Feature additions requiring network access (such as automatic cloud sync or telemetry) are precluded by design.

### Alternatives Considered
- *Standard permissive Tauri configuration:* Rejected due to unacceptable exfiltration risk.

---

## ADR-006: Adoption of JavaScript (ES Modules) for Frontend Layer

- **Status:** Accepted
- **Date:** October 2026

### Context
The frontend needs to be fast, maintainable, and straightforward to develop while interfacing with Tauri's IPC commands. We evaluated TypeScript versus modern JavaScript (ES Modules).

### Decision
We adopt standard modern **JavaScript (ES Modules) with React 19** for the frontend UI, while reserving static typing and strict memory safety for the entire backend cryptographic engine in **Rust**.

### Consequences
- **Positive:** Minimizes build toolchain friction, rapid iteration in development, eliminates TypeScript compilation layers for UI-only presentation components.
- **Negative:** Lack of static compile-time type checks in React components.
- **Mitigation:** The Tauri IPC boundary provides rigorous serde serialization validation in Rust, ensuring malformed inputs from JavaScript are rejected immediately.

### Alternatives Considered
- *TypeScript:* Considered, but decided to keep the frontend lightweight while relying on Rust's type system for all mission-critical data structures.

---

## ADR-007: Atomic Temp File Write and Rename Strategy

- **Status:** Accepted
- **Date:** October 2026

### Context
Writing directly to the target destination file presents severe risks:
1. If the process is terminated, power is lost, or the user clicks "Cancel" mid-stream, a partially written file remains on disk, which may mislead users or corrupt existing data.
2. If decryption encounters an authentication failure halfway through, unauthenticated plaintext chunks would remain on disk.

### Decision
We mandate a strict **Temp-Write-Fsync-Rename** pattern:
1. Operations stream to `<destination>.<uuid>.tmp` located in the same directory as the target.
2. A Rust RAII guard (`TempFileGuard`) ensures that if the operation aborts or panics, the `.tmp` file is immediately unlinked.
3. Upon full cryptographic verification and completion of all chunks, `sync_all()` is invoked to flush kernel caches.
4. An atomic `fs::rename()` replaces the destination path.

### Consequences
- **Positive:** Guarantees zero residual partially decrypted plaintext on failure. Guarantees that target files are never overwritten unless decryption is 100% verified.
- **Negative:** Requires sufficient free disk space to store both the temporary file and the existing file concurrently.

### Alternatives Considered
- *Direct in-place streaming:* Rejected due to data corruption and partial plaintext exposure risks.

---

## ADR-008: Dual MIT and Apache-2.0 Open-Source Licensing

- **Status:** Accepted
- **Date:** October 2026

### Context
SFEL is developed both as a technical portfolio project and as an open educational cryptographic tool. Choosing the appropriate open-source license affects adoption, contribution, and ecosystem compatibility with Rust's standard licensing conventions.

### Decision
We dual-license the project under **MIT License** and **Apache License (Version 2.0)**.

### Consequences
- **Positive:** Follows the de facto standard of the Rust community (compatible with RustCrypto, Tokio, and Tauri). Apache 2.0 provides an express grant of patent rights, while MIT provides maximum simplicity and permissible reuse.
- **Negative:** Requires maintaining dual license notices in documentation and source headers.

### Alternatives Considered
- *GPLv3:* Considered, but rejected because copyleft provisions would prevent integration into broader permissive security labs and commercial research portfolios.
- *MIT Only:* Rejected due to lack of explicit patent grants.
