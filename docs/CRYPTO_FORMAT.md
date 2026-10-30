# SFEL v1 Cryptographic Binary Format Specification

**Standard Identifier:** SFEL-FORMAT-v1  
**Status:** Canonical Reference  
**Last Updated:** October 2026  

---

## 1. Overview & Objectives

The SFEL v1 container format (`.sfel`) specifies an authenticated, streaming-capable binary envelope for encrypting files of arbitrary size with user-supplied passphrases.

The format satisfies the following cryptographic design requirements:
1. **Authenticated Encryption with Associated Data (AEAD):** Both file metadata (header, parameters) and payload data are cryptographically bound to an authentication tag. Modifying any bit of the header or ciphertext results in verification failure.
2. **Chunked Streaming without Unbounded Memory:** Files are divided into 1 MiB chunks, allowing multi-gigabyte files to be processed in constant $O(1)$ RAM.
3. **Chunk Order & Truncation Protection:** Each chunk binds its sequential 64-bit index and an `is_final` flag into its Associated Authenticated Data (AAD), rendering chunk reordering, deletion, insertion, or truncation cryptographically impossible.
4. **Resilience to Offline Brute-Force Attacks:** Password derivation uses Argon2id with high memory and iteration parameters.
5. **Deterministic Nonce Derivation:** Uses a cryptographically random 96-bit base nonce combined with chunk counters to ensure that a key/nonce pair is never repeated within a file.

---

## 2. Container Layout Overview

An `.sfel` container consists of a fixed **64-byte Header** followed by one or more **Authenticated Chunks**:

```
+---------------------------------------------------------------------------------+
|                                 SFEL HEADER                                     |
|                                  (64 Bytes)                                     |
+---------------------------------------------------------------------------------+
|                            AUTHENTICATED CHUNK 0                                |
|  [Length: 4B] [Is_Last: 1B] [Encrypted Payload + AES-GCM Tag: 16B]              |
+---------------------------------------------------------------------------------+
|                            AUTHENTICATED CHUNK 1                                |
|  [Length: 4B] [Is_Last: 1B] [Encrypted Payload + AES-GCM Tag: 16B]              |
+---------------------------------------------------------------------------------+
|                                      ...                                        |
+---------------------------------------------------------------------------------+
|                          AUTHENTICATED CHUNK N (Final)                          |
|  [Length: 4B] [Is_Last = 0x01: 1B] [Encrypted Payload + AES-GCM Tag: 16B]       |
+---------------------------------------------------------------------------------+
```

---

## 3. Byte-by-Byte Header Layout (64 Bytes)

All multi-byte numeric fields are encoded in **little-endian** byte order.

| Byte Offset | Field Name | Type | Size | Valid Values / Description |
|---|---|---|---|---|
| `0x00 - 0x03` | `magic` | `[u8; 4]` | 4 bytes | `0x53, 0x46, 0x45, 0x4C` (ASCII string `"SFEL"`) |
| `0x04` | `version` | `u8` | 1 byte | `0x01` (Current format version) |
| `0x05` | `mode` | `u8` | 1 byte | `0x01` = Single Mode, `0x02` = Chunked Mode |
| `0x06` | `cipher_id` | `u8` | 1 byte | `0x01` = AES-256-GCM (256-bit key, 96-bit nonce, 128-bit tag) |
| `0x07` | `kdf_id` | `u8` | 1 byte | `0x01` = Argon2id |
| `0x08 - 0x17` | `kdf_salt` | `[u8; 16]` | 16 bytes | Cryptographically secure random salt (`OsRng`) |
| `0x18 - 0x1B` | `argon2_m_cost` | `u32` (LE) | 4 bytes | Memory cost in KiB. Default: `65536` (64 MiB). Range: `16384` to `1048576` |
| `0x1C - 0x1F` | `argon2_t_cost` | `u32` (LE) | 4 bytes | Time cost (iterations). Default: `3`. Range: `1` to `10` |
| `0x20 - 0x23` | `argon2_p_cost` | `u32` (LE) | 4 bytes | Parallelism (lanes/threads). Default: `4`. Range: `1` to `16` |
| `0x24 - 0x2F` | `base_nonce` | `[u8; 12]` | 12 bytes | Cryptographically secure random 96-bit base nonce (`OsRng`) |
| `0x30 - 0x3F` | `reserved` | `[u8; 16]` | 16 bytes | Reserved for future extensions. Must be filled with zeros (`0x00`) |

Total Header Size: **64 bytes**.

---

## 4. Key Derivation Function (Argon2id)

### Parameters & Rationale

| Parameter | Value | Rationale |
|---|---|---|
| **Algorithm** | Argon2id (RFC 9106) | Hybrid mode combining Argon2d (data-dependent memory access for maximum resistance against GPU/ASIC cracking) and Argon2i (data-independent memory access for side-channel resistance). Recommended by the Password Hashing Competition (PHC) and OWASP. |
| **Salt Size** | 16 bytes (128 bits) | Generated uniquely per file via `rand::rngs::OsRng`. Prevents rainbow table attacks and precomputed dictionary attacks across files. |
| **Memory Cost ($m$)** | 64 MiB ($65,536\text{ KiB}$) | Forces any cracking hardware (e.g., RTX 4090 or Antminer ASIC) to allocate 64 MiB of high-bandwidth memory per password guess. This limits parallel cracking instances while keeping client desktop execution under 300 ms on modern CPUs. |
| **Time Cost ($t$)** | 3 iterations | Provides sufficient diffusion over the memory lanes. |
| **Parallelism ($p$)** | 4 threads | Matches standard multi-core desktop CPU capabilities without inducing thread thrashing. |
| **Derived Key Output** | 32 bytes (256 bits) | Directly matches the AES-256 symmetric key requirement. Buffers holding the derived key are explicitly wrapped in zeroizing containers. |

---

## 5. AEAD Cryptographic Suite (AES-256-GCM)

- **Cipher:** Advanced Encryption Standard in Galois/Counter Mode (AES-GCM).
- **Key Length:** 256 bits (32 bytes).
- **Nonce Length:** 96 bits (12 bytes).
- **Authentication Tag Length:** 128 bits (16 bytes).
- **Associated Authenticated Data (AAD):** Provided as additional authenticated data to the cipher so that any tampering with metadata is rejected before plaintext is processed.

---

## 6. Operational Modes

### 6.1 Mode 0x01: Single Mode (Payload $\le 1\text{ MiB}$)

Single Mode is utilized for small files that fit comfortably in memory.

- **Nonce:** The 12-byte `base_nonce` directly from the header.
- **Associated Authenticated Data (AAD):** The entire 64-byte Header:
  $$\text{AAD}_{\text{single}} = \text{Header}[0..64]$$
- **Payload Layout:**
  ```
  +---------------------------------------------------------+
  | Encrypted Plaintext || 16-Byte AES-GCM Tag              |
  +---------------------------------------------------------+
  ```
- **Plaintext Format:**
  - `filename_len`: 2 bytes (`u16` LE).
  - `filename_utf8`: $L$ bytes.
  - `file_content`: Remaining bytes.

---

### 6.2 Mode 0x02: Chunked Mode (Streaming, Any Size)

Chunked Mode is the standard operating mode for files of arbitrary size, streaming through 1 MiB plaintext chunks ($1,048,576\text{ bytes}$).

#### 6.2.1 Chunk Wire Layout
Every chunk in the container has the following sequence:

```
+--------------------+-------------------+------------------------------------------+
| chunk_len (4B, LE) | is_last (1B)      | ciphertext (Variable) + GCM tag (16B)     |
+--------------------+-------------------+------------------------------------------+
```

1. **`chunk_len` (4 bytes, `u32` LE):** Total byte length of the following payload (equal to `ciphertext_length + 16`). For a full 1 MiB chunk, this value is `1,048,576 + 16 = 1,048,592`.
2. **`is_last` (1 byte, `u8`):**
   - `0x00`: More chunks follow in the stream.
   - `0x01`: This is the final chunk in the stream.
3. **`ciphertext + tag`:** The encrypted chunk data immediately followed by its 16-byte GCM authentication tag.

#### 6.2.2 Per-Chunk Nonce Derivation
To prevent nonce reuse across chunks while avoiding the storage of an independent 12-byte nonce per chunk, SFEL derives each chunk's nonce deterministically:

$$\text{ChunkNonce}_i = \text{base\_nonce} \oplus \text{Pad}_{12}(i)$$

Where:
- $i$ is the zero-based sequential chunk index (`u64`, little-endian).
- $\text{Pad}_{12}(i)$ is a 12-byte array where the first 8 bytes contain $i$ in little-endian format and the remaining 4 bytes are `0x00`.
- $\oplus$ is the bitwise XOR operator across all 12 bytes.

Since the `base_nonce` is freshly generated with high entropy from `OsRng` for every file, this derivation guarantees uniqueness across all chunks.

#### 6.2.3 Per-Chunk Associated Authenticated Data (AAD)
To ensure anti-tamper, anti-reorder, and anti-truncation protection, each chunk authenticates:

$$\text{AAD}_i = \text{Header}[0..64] \;\|\; \text{Index}_i \;\|\; \text{IsLast}_i$$

Where:
- $\text{Header}[0..64]$: Full 64 bytes of the file header (binds the chunk to this specific file and prevents moving chunks between different files).
- $\text{Index}_i$: 8 bytes (`u64` little-endian) chunk counter (binds the chunk to its exact position, preventing chunk reordering or duplication).
- $\text{IsLast}_i$: 1 byte (`u8`, `0x00` or `0x01`) (prevents premature truncation of the file).

---

## 7. Metadata Handling (Original Filename)

To prevent metadata leakage, the original filename is **never** stored in the plaintext header. Instead, Chunk 0 begins with a structured metadata preamble:

```
+--------------------+----------------------------+------------------------+
| name_len (2B, LE)  | original_filename (name_len| original file bytes... |
+--------------------+----------------------------+------------------------+
```

- **`name_len`:** 2 bytes (`u16` LE), maximum 255 bytes.
- **`original_filename`:** UTF-8 encoded filename string without path components (e.g., `"financial_report.xlsx"`).

During decryption, this preamble is read from the first authenticated chunk, and the decrypted file is restored with its original name.

---

## 8. Validation Rules & Bounds

When parsing an `.sfel` container, the decoder enforces strict boundary rules:

1. **Magic Bytes:** File must start with `0x53 0x46 0x45 0x4C` (`SFEL`). Otherwise, return `SfelError::InvalidFormat`.
2. **Version:** Field `version` must equal `0x01`. If version $> 0x01$, return `SfelError::UnsupportedVersion(v)`.
3. **Mode:** Field `mode` must be either `0x01` (Single) or `0x02` (Chunked). Any other value is rejected.
4. **Cipher & KDF:** Must match supported IDs (`cipher_id == 0x01`, `kdf_id == 0x01`).
5. **Argon2id Parameter Limits:**
   - Memory cost $m$: $16,384 \le m \le 1,048,576\text{ KiB}$ (16 MiB to 1 GiB).
   - Time cost $t$: $1 \le t \le 10$.
   - Parallelism $p$: $1 \le p \le 16$.
   Any parameter outside these ranges triggers `SfelError::InvalidParameters`.
6. **Reserved Field:** Bytes `0x30..0x3F` must be all zeros (`0x00`).
7. **Chunk Length Bounds:**
   - Single mode: Payload length cannot exceed 1 MiB + 16 bytes.
   - Chunked mode: `chunk_len` must be $> 16$ bytes (must contain at least the 16-byte tag) and $\le 1,048,576 + 16\text{ bytes}$.
8. **Final Chunk Rule:** The file stream must end with exactly one chunk having `is_last == 0x01`. An unexpected EOF before an `is_last == 0x01` chunk returns `SfelError::TruncatedFile`.

---

## 9. Error Messages & Security Ambiguity

In accordance with cryptographic best practices (preventing padding oracles and timing attacks):

- Any failure during key verification or AEAD tag verification must return:
  ```
  "Incorrect password or corrupted file" (SfelError::AuthenticationFailed)
  ```
- The implementation MUST NOT reveal whether the failure was caused by:
  - Wrong password.
  - Bit flip in the ciphertext.
  - Modified chunk index in AAD.
  - Modified header bytes.
- The decryption engine must securely delete any temporary output file before reporting the error.

---

## 10. Example Annotated Header Hex Dump

Below is an annotated hex dump of an authentic 64-byte SFEL v1 header:

```
Offset   00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F   Decoded Text / Field
-------  -----------------------  -----------------------   --------------------
00000000 53 46 45 4c 01 02 01 01  8e f2 4a 19 c0 3b 72 90   SFEL.... ..J..;r.
         |_________| |  |  |  |   |_____________________|
          'SFEL'    Ver | Cipher  Argon2 Salt (Bytes 0-7)
                      Mode   KDF

00000010 3d e8 44 a1 b9 71 83 2c  00 00 01 00 03 00 00 00   =.D..q., ........
         |_____________________|  |_________| |_________|
         Argon2 Salt (Bytes 8-15)  m=65536 KiB   t=3 iter

00000020 04 00 00 00 7a b3 e4 10  c2 9f 33 d8 11 a4 05 b7   ....z... ..3.....
         |_________| |__________________________________|
            p=4      Base Nonce (12 Bytes)

00000030 00 00 00 00 00 00 00 00  00 00 00 00 00 00 00 00   ................
         |______________________________________________|
                   Reserved (16 Bytes of 0x00)
```

---

## 11. System Limits

| Property | Limit Value | Rationale |
|---|---|---|
| **Max File Size** | 16 TiB | Limited by AES-GCM safe block count ($2^{39}-256$ bits) and 64-bit chunk index. |
| **Max Filename Length** | 255 bytes | Standard filesystem filename limitation (NTFS, ext4, APFS). |
| **Chunk Size** | 1 MiB ($1,048,576\text{ bytes}$) | Optimal balance between streaming throughput and memory efficiency. |
| **Max Chunks** | $2^{64}-1$ | 64-bit chunk index prevents counter overflow. |
