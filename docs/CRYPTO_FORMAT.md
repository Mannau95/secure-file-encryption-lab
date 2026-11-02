# SFEL v1 Cryptographic Binary Format Specification

**Standard Identifier:** SFEL-FORMAT-v1  
**Status:** Canonical Reference (v1.0.0 Frozen Specification)  
**Last Updated:** November 2026  

---

## 1. Overview & Objectives

The SFEL v1 container format (`.sfel`) specifies an authenticated, streaming-capable binary envelope for encrypting files and directory archives of arbitrary size with user-supplied passphrases and optional keyfiles.

The format satisfies the following cryptographic design requirements:
1. **Authenticated Encryption with Associated Data (AEAD):** Both file metadata (128-byte header, Argon2 parameters, original filename) and payload data are cryptographically bound to a 128-bit authentication tag. Modifying any bit of the header or ciphertext results in verification failure.
2. **Dual AEAD Cipher Agility (`AES-256-GCM` & `ChaCha20-Poly1305`):** Supports hardware-accelerated `AES-256-GCM` (NIST SP 800-38D) and constant-time ARX `ChaCha20-Poly1305` (RFC 8439), encoded directly in the authenticated header mode byte.
3. **Chunked Streaming without Unbounded Memory:** Files $> 1\text{ MiB}$ are divided into 1 MiB chunks, allowing multi-gigabyte files to be processed in constant $O(1)$ RAM.
4. **Chunk Order & Truncation Protection:** Each chunk binds the full 128-byte file header, its sequential 32-bit index, and an `is_final` flag into its Associated Authenticated Data (AAD), rendering chunk reordering, deletion, insertion, or truncation cryptographically impossible.
5. **Resilience to Offline Brute-Force Attacks & 2FA Keyfiles:** Password derivation uses Argon2id with configurable memory-hard profiles (`Fast`, `Standard`, `Paranoid`) and optional multi-factor keyfile binding (`SFEL-KEYFILE-V1`).

---

## 2. Container Layout Overview

An `.sfel` container consists of a fixed **128-byte Header** followed by either a single authenticated payload (Single Mode, $\le 1\text{ MiB}$) or a sequence of **1 MiB Authenticated Chunks** (Chunked Mode, $> 1\text{ MiB}$):

```
+---------------------------------------------------------------------------------+
|                                 SFEL HEADER                                     |
|                                 (128 Bytes)                                     |
+---------------------------------------------------------------------------------+
|                            AUTHENTICATED CHUNK 0                                |
|            [Encrypted Payload (up to 1 MiB) + 16-Byte AEAD Tag]                 |
+---------------------------------------------------------------------------------+
|                            AUTHENTICATED CHUNK 1                                |
|            [Encrypted Payload (up to 1 MiB) + 16-Byte AEAD Tag]                 |
+---------------------------------------------------------------------------------+
|                                      ...                                        |
+---------------------------------------------------------------------------------+
|                          AUTHENTICATED CHUNK N (Final)                          |
|            [Encrypted Payload (Remainder) + 16-Byte AEAD Tag]                   |
+---------------------------------------------------------------------------------+
```

---

## 3. Byte-by-Byte Header Layout (128 Bytes)

All multi-byte numeric fields are encoded in **little-endian** byte order.

| Byte Offset | Field Name | Type | Size | Valid Values / Description |
|---|---|---|---|---|
| `0x00 - 0x03` | `magic` | `[u8; 4]` | 4 bytes | `0x53, 0x46, 0x45, 0x4C` (ASCII string `"SFEL"`) |
| `0x04` | `version` | `u8` | 1 byte | `0x01` (Format version 1) |
| `0x05` | `mode_and_cipher` | `u8` | 1 byte | `0x00` = AES-256-GCM Single<br>`0x01` = AES-256-GCM Chunked<br>`0x10` = ChaCha20-Poly1305 Single<br>`0x11` = ChaCha20-Poly1305 Chunked |
| `0x06 - 0x09` | `argon2_memory` | `u32` (LE) | 4 bytes | Memory cost in KiB (`32768` Fast, `65536` Standard, `262144` Paranoid). Valid range: `8192..=4194304` KiB |
| `0x0A - 0x0D` | `argon2_iterations`| `u32` (LE) | 4 bytes | Time cost (iterations). Valid range: `1..=100` |
| `0x0E - 0x11` | `argon2_parallelism`| `u32` (LE) | 4 bytes | Parallelism (lanes). Valid range: `1..=16` |
| `0x12 - 0x21` | `salt` | `[u8; 16]` | 16 bytes | Cryptographically secure random salt (`OsRng`) |
| `0x22 - 0x2D` | `nonce` | `[u8; 12]` | 12 bytes | Single mode: 12-byte random nonce.<br>Chunked mode: 7-byte random `base_nonce` in `[0..7]` + zero padding in `[7..12]` |
| `0x2E - 0x35` | `original_file_size`| `u64` (LE) | 8 bytes | Original plaintext size in bytes (up to 4 TiB) |
| `0x36 - 0x37` | `name_len` | `u16` (LE) | 2 bytes | UTF-8 byte length of `original_name` (`0..=72`) |
| `0x38 - 0x7F` | `original_name` | `[u8; 72]` | 72 bytes | UTF-8 filename padded with `0x00`. Directory archives append `.sfel-folder.tar` |

Total Header Size: **128 bytes** (`HEADER_SIZE = 128`).

---

## 4. Key Derivation Function (Argon2id & 2FA Keyfile)

### 4.1 Argon2id Profiles

| Profile | Memory ($m$) | Iterations ($t$) | Parallelism ($p$) | Use Case |
|---|---|---|---|---|
| **Fast** | 32 MiB (`32,768` KiB) | 2 | 2 | Rapid operations on low-power devices |
| **Standard** (Default) | 64 MiB (`65,536` KiB) | 3 | 4 | Balanced desktop security (~100–250 ms) |
| **Paranoid** | 256 MiB (`262,144` KiB) | 5 | 8 | Maximum resistance against GPU/ASIC clusters |

### 4.2 Multi-Factor Keyfile Combination (2FA)

When an optional keyfile is supplied, SFEL computes the streaming SHA-256 digest of the keyfile and constructs a domain-separated secret inside a `Zeroizing<Vec<u8>>` buffer before invoking Argon2id:

$$\text{Secret} = \text{"SFEL-KEYFILE-V1:"} \;\|\; \text{Hex}(\text{SHA256}(\text{Keyfile})) \;\|\; \text{":"} \;\|\; \text{Password}$$

When no keyfile is used, $\text{Secret} = \text{Password}$, maintaining 100% compatibility with standard password-only containers.

---

## 5. AEAD Cipher Suites

Both supported ciphers use a 256-bit derived key, a 96-bit (12-byte) nonce, and a 128-bit (16-byte) authentication tag:
- **AES-256-GCM (`0x00` / `0x01`):** Hardware-accelerated via CPU AES-NI / ARMv8 Cryptography Extensions.
- **ChaCha20-Poly1305 (`0x10` / `0x11`):** RFC 8439 ARX stream cipher + Poly1305 MAC, immune to cache-timing side channels and ultra-fast even without dedicated AES hardware.

---

## 6. Operational Modes

### 6.1 Single Mode (`0x00` / `0x10`, Payload $\le 1\text{ MiB}$)

- **Nonce:** 12-byte random nonce from header bytes `0x22..0x2E`.
- **AAD:** Full 128-byte serialized header (`Header[0..128]`).
- **Ciphertext Size:** `original_file_size + 16` bytes.

### 6.2 Chunked Streaming Mode (`0x01` / `0x11`, Payload $> 1\text{ MiB}$)

- **Plaintext Chunk Size:** $1\text{ MiB} = 1,048,576\text{ bytes}$.
- **Encrypted Chunk Size:** $1,048,576 + 16 = 1,048,592\text{ bytes}$ (final chunk matches remainder + 16 bytes).
- **Per-Chunk Nonce (12 bytes):**
  $$\text{Nonce}_i = \text{base\_nonce}[0..7] \;\|\; \text{u32\_be}(i) \;\|\; \text{is\_final}$$
- **Per-Chunk AAD (133 bytes):**
  $$\text{AAD}_i = \text{Header}[0..128] \;\|\; \text{u32\_be}(i) \;\|\; \text{is\_final}$$
  where `is_final` is `0x01` on the final chunk and `0x00` on all preceding chunks.

---

## 7. Directory Archival Convention (`.sfel-folder.tar`)

When encrypting a directory, SFEL packs the folder hierarchy recursively (`follow_symlinks(false)`) into a temporary TAR stream and marks `original_name` with the suffix `.sfel-folder.tar`. Upon authenticated decryption, SFEL detects this suffix and atomically extracts the directory tree while rejecting any `..` (`ParentDir`), root/prefix paths, or symbolic/hard links (Zip-Slip / Tar-Slip mitigation).
