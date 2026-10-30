# SFEL Threat Model & Security Boundary Analysis

**Document Version:** 1.0.0  
**Methodology:** STRIDE-based Threat Modeling & Risk Matrix  
**Status:** Canonical Reference  

---

## 1. Introduction & Objectives

This document establishes the threat model for the **Secure File Encryption Lab (SFEL)** application. It defines the trust boundaries, enumerates the primary assets to be protected, catalogs anticipated threat actors, analyzes attack vectors, and details both architectural mitigations and residual risks.

The goal of SFEL is to provide strong confidentiality and tamper-evident integrity for arbitrary files stored or transmitted across untrusted channels (e.g., untrusted cloud storage, lost USB drives, intercepted file transfers).

---

## 2. Trust Boundaries & Architecture Diagram

```
+-------------------------------------------------------------------------------+
| UNTRUSTED ENVIRONMENT                                                         |
| (Public Internet, Untrusted Cloud Providers, Lost Laptops, Compromised Media) |
+-------------------------------------------------------------------------------+
                                       |
                   Encrypted .sfel file transferred / stored
                                       v
=================================================================================
TRUST BOUNDARY 1: File Storage / Ingestion Boundary
=================================================================================
                                       |
+-------------------------------------------------------------------------------+
| CLIENT HOST OPERATING SYSTEM (Trusted Environment Assumptions Apply)          |
|                                                                               |
|   +-----------------------------------------------------------------------+   |
|   | TAURI RUNTIME LAYER (WebView Sandboxed)                               |   |
|   |  - HTML/CSS/JavaScript UI (React 19)                                  |   |
|   |  - Zero Network Capabilities                                          |   |
|   |  - Zero Shell Execution                                               |   |
|   +-----------------------------------------------------------------------+   |
|                                      |                                        |
|===============================================================================|
| TRUST BOUNDARY 2: Tauri IPC Bridge (Command Invocation / Event Bus)           |
|===============================================================================|
|                                      |                                        |
|   +-----------------------------------------------------------------------+   |
|   | RUST BACKEND CORE ENGINE (sfel_lib)                                   |   |
|   |  - Scoped Local Filesystem Operations                                 |   |
|   |  - Argon2id Password KDF (Memory-hard derivation)                     |   |
|   |  - AES-256-GCM AEAD Engine (Authenticated encryption)                 |   |
|   |  - Zeroize Protected Buffers (Immediate memory wiping)                |   |
|   +-----------------------------------------------------------------------+   |
|                                      |                                        |
|===============================================================================|
| TRUST BOUNDARY 3: Local Kernel Filesystem (NTFS / ext4 / APFS)                |
|===============================================================================|
|                                      |                                        |
|   +-----------------------------------------------------------------------+   |
|   | TARGET DISK DIRECTORY                                                 |   |
|   |  - Atomic Write Staging (.tmp files)                                  |   |
|   |  - Final Output Files                                                 |   |
|   +-----------------------------------------------------------------------+   |
+-------------------------------------------------------------------------------+
```

---

## 3. Assets to Protect

| Asset | Sensitivity | Description |
|---|---|---|
| **File Content (Payload)** | High | The plaintext data contained within the user's files. Must remain strictly confidential against unauthorized parties. |
| **Data Integrity & Authenticity** | High | Guarantee that encrypted files cannot be modified, spliced, truncated, or tampered with without detection. |
| **File Metadata (Original Filename & Size)** | Medium-High | Filenames often reveal sensitive business, legal, or personal context (e.g., `tax_audit_2025.pdf`). The original filename must be kept confidential. |
| **Passphrases & Cryptographic Keys** | Critical | User-entered passwords, intermediate Argon2 states, and derived 256-bit symmetric keys. Must not persist in memory, pagefiles, or crash dumps. |
| **Host System Stability** | Medium | The client system must not be vulnerable to denial-of-service (DoS) via malicious decompression bombs, memory exhaustion, or disk exhaustion. |

---

## 4. Threat Actors & Capabilities

1. **The Passive Interceptor (Eavesdropper):**
   - *Profile:* An attacker who gains physical or digital possession of the `.sfel` file (e.g., intercepting network file transfers, finding a lost USB drive, unauthorized access to cloud backups).
   - *Capabilities:* Infinite offline read access to the ciphertext and header; unable to execute code on the victim's machine.
2. **The Active Tamperer (Man-in-the-Middle / Malicious Storage Provider):**
   - *Profile:* An attacker who can alter, truncate, duplicate, or swap chunks in `.sfel` files before the victim attempts decryption.
   - *Capabilities:* Modifying raw bits, reordering byte ranges, substituting chunks from other `.sfel` files.
3. **The Offline Brute-Force Attacker:**
   - *Profile:* An attacker with specialized high-performance hardware (farms of GPUs, ASICs, cloud compute) attempting to guess weak or dictionary passphrases.
   - *Capabilities:* High-throughput parallel password testing.
4. **The Local Host Adversary (Co-tenant / Unprivileged User):**
   - *Profile:* Another unprivileged user or process running on the same multi-user machine.
   - *Capabilities:* Observing filesystem directories, attempting to inspect temporary files, or intercepting IPC channels.

---

## 5. Threat Analysis & Risk Matrix

| Threat ID | Threat Description | Likelihood | Impact | Mitigation Mechanism | Residual Risk |
|---|---|---|---|---|---|
| **THREAT-01** | **Eavesdropping on Plaintext Content** | High | Critical | AES-256-GCM symmetric encryption. 256-bit keys derived via Argon2id with 128-bit random salts. | Negligible (subject to password strength). |
| **THREAT-02** | **Offline Brute-Force / Dictionary Attacks** | High | Critical | Argon2id configured with 64 MiB RAM, 3 iterations, 4 parallelism lanes. Severely penalizes GPU/ASIC parallelization. | Low (dependent on user choosing a sufficiently high-entropy password). |
| **THREAT-03** | **Ciphertext Bit-Flipping / Tampering** | Medium | Critical | AES-256-GCM authenticated encryption tag (128 bits). Header and chunk parameters are bound via AAD. | None. Cryptographically zero probability of undetected bit flips ($2^{-128}$). |
| **THREAT-04** | **Chunk Reordering, Substitution, or Duplication** | Medium | High | Each chunk calculates AAD over: `Header[0..64] \|\| Chunk_Index \|\| Is_Last`. Swapping chunks alters the expected index and causes tag mismatch. | None. |
| **THREAT-05** | **File Truncation Attack** | Medium | High | The last chunk explicitly sets `is_last = 0x01` in its wire header and AAD. Premature EOF triggers `SfelError::TruncatedFile`. | None. |
| **THREAT-06** | **Metadata / Filename Exposure** | High | Medium | Original filename is encrypted within the first authenticated chunk payload rather than stored in the cleartext header. | Low (file size is discernible to within 1 MiB chunk granularity). |
| **THREAT-07** | **Nonce Reuse Attacks** | Low | Critical | Base nonce (96 bits) is generated fresh for every file using OS cryptographically secure entropy (`OsRng`). Chunks derive nonces using XOR counter addition. | Negligible ($2^{-96}$ collision probability across different files). |
| **THREAT-08** | **Partial Plaintext Leakage on Tampered Decryption** | Medium | High | Decryption streams to a secure `.tmp` file. If any chunk fails MAC verification, the temporary file is unlinked immediately before error return. | None. Zero unauthenticated plaintext is written to target file. |
| **THREAT-09** | **Memory Inspection / Residual Key Retention** | Low | High | Derived keys and sensitive buffers implement `zeroize::Zeroize` and `ZeroizeOnDrop` to zero out memory as soon as operations conclude. | Low (OS swap file or hibernation file could theoretically capture dirty pages before zeroization). |
| **THREAT-10** | **Decryption Oracle / Side-Channel Leakage** | Low | Medium | Errors on wrong password, altered tag, or corrupted header are uniformly reported as `"Incorrect password or corrupted file"`. | Negligible. |
| **THREAT-11** | **Malicious Web-View Injection / Data Exfiltration** | Low | Critical | Tauri v2 permissions explicitly deny network requests (`default-src 'self'`), clipboard snooping, and shell commands. | Negligible. |
| **THREAT-12** | **Denial of Service via Giant Memory Allocation** | Low | Medium | Header parser enforces strict limits on Argon2 parameters: memory cost capped at 1 GiB, time cost capped at 10. | None. |

---

## 6. Explicit Out-of-Scope Threats

The following attack vectors are explicitly acknowledged as beyond the defensive scope of SFEL:

1. **Compromised Client Operating System (Root / Administrator / Malware):**
   - If the user's host machine is infected with kernel rootkits, keyloggers, screen scrapers, or malicious debugging tools, the adversary can capture the passphrase as it is typed into the WebView or read keys from memory before zeroization occurs.
   - *Assumption:* The host OS kernel and active user session are trustworthy.
2. **Physical Laboratory Side-Channel Attacks:**
   - Electromagnetic analysis, differential power analysis (DPA), or cold-boot attacks against host physical DRAM chips are not defended against by application-level software.
3. **Plausible Deniability / Steganography:**
   - SFEL containers are identifiable by their `SFEL` magic bytes. SFEL does not attempt to conceal the fact that encryption was applied.
4. **Post-Quantum Cryptographic Proofs:**
   - While AES-256 is resilient against Grover's algorithm (providing 128 bits of post-quantum security), Argon2id is not a lattice-based post-quantum algorithm.

---

## 7. Security Assumptions

1. **OS Entropy Quality:** The host operating system's cryptographic random number generator (`rand::rngs::OsRng` via `BCryptGenRandom` on Windows, `getrandom` on Linux, `getentropy` on macOS) provides high-entropy, unpredictable numbers.
2. **Hardware Integrity:** CPU AES-NI instructions and cache management behave in accordance with official Intel/AMD/ARM architecture specifications.
3. **Filesystem Atomicity:** The host filesystem supports atomic rename operations (`rename` / `MoveFileEx`) within the same volume/directory.
4. **User Passphrase Quality:** The user selects a passphrase with sufficient mathematical entropy to resist offline dictionary attacks against Argon2id ($m=64\text{ MiB}, t=3, p=4$).
