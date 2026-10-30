# SFEL System Architecture Specification

**Document Version:** 1.0.0  
**Target Architecture:** Tauri 2.5, React 19, Rust 1.85+ (Edition 2024)  
**Status:** Approved Specification  

---

## 1. System Overview

Secure File Encryption Lab (SFEL) is a modern, cross-platform desktop application designed to provide authenticated, high-performance file encryption and decryption. SFEL combines a lightweight, sandboxed web presentation layer with a memory-safe, hardware-accelerated Rust backend.

The architecture emphasizes three core tenets:
1. **Cryptographic Rigor:** Cryptographic operations are strictly implemented in Rust using established RustCrypto libraries, avoiding custom or ad-hoc cryptographic implementations.
2. **Defensive Isolation:** The frontend operates in an isolated WebView sandbox with zero network, zero child process, and strictly scoped filesystem permissions.
3. **Resilience & Atomicity:** File streaming operations utilize atomic write patterns with automated rollback guards, preventing corrupted or partially encrypted files on crash or cancellation.

```
+---------------------------------------------------------------------------------------+
|                                     FRONTEND LAYER                                    |
|                      (React 19 / Vite / HTML5 / CSS Modules / JavaScript)             |
|                                                                                       |
|   +-----------------------+   +------------------------+   +----------------------+   |
|   | Encrypt / Decrypt UI  |   | Crypto Educational Lab |   | Theme & Settings     |   |
|   | File Picker / Drag-Drop|   | (Header Inspector)     |   | Contexts & Modals    |   |
|   +-----------------------+   +------------------------+   +----------------------+   |
+---------------------------------------------------------------------------------------+
                                           |
                                [ Tauri IPC Bridge ]
                                (Zero-Copy Channels)
                                           |
+---------------------------------------------------------------------------------------+
|                                  TAURI RUNTIME LAYER                                  |
|                     (Capability Sandbox / Permission Scopes)                          |
|                                                                                       |
|   - Deny: Network (No HTTP/WebSocket/DNS)                                             |
|   - Deny: Shell / Command Execution                                                  |
|   - Deny: Clipboard snooping                                                          |
|   - Allow: Local File Dialogs & Scoped File Access                                    |
+---------------------------------------------------------------------------------------+
                                           |
                                [ Native Rust Invocations ]
                                           |
+---------------------------------------------------------------------------------------+
|                                  BACKEND CORE ENGINE                                  |
|                               (Rust 2024 / sfel_lib)                                  |
|                                                                                       |
|  +--------------------+   +-----------------------+   +---------------------------+   |
|  |     commands/      |   |        crypto/        |   |          format/          |   |
|  | - cmd_encrypt      |   | - kdf (Argon2id)      |   | - header (64B binary)     |   |
|  | - cmd_decrypt      |   | - aead (AES-256-GCM)  |   | - validation (Bounds/Ver) |   |
|  | - cmd_cancel       |   | - chunks (Streaming)  |   +---------------------------+   |
|  +--------------------+   | - rng (OsRng Entropy) |   +---------------------------+   |
|                           +-----------------------+   |           fs/             |   |
|  +--------------------+                               | - temp (RAII Guard)       |   |
|  |      error.rs      |   +-----------------------+   | - atomic (Safe Rename)    |   |
|  | (Constant-Time/Safe|   |   Memory Protection   |   +---------------------------+   |
|  |  Generic Errors)   |   |   (zeroize buffers)   |                               |
|  +--------------------+   +-----------------------+                                   |
+---------------------------------------------------------------------------------------+
```

---

## 2. Layer Separation & Responsibilities

The system is organized into three distinct operational planes:

### 2.1 The Presentation Plane (UI)
- **Technology:** React 19 running inside the OS native WebView engine (WebView2 on Windows, WebKitGTK on Linux, WKWebView on macOS).
- **Responsibilities:**
  - Rendering responsive user interfaces for file drop zones, progress indicators, and settings.
  - Interactive visualization of the cryptographic pipeline (visualizing salt, Argon2id parameters, nonces, chunk indexes, and MAC tags).
  - Validating user inputs (password match, password complexity thresholds).
  - Forwarding user cancellation requests to the backend.
- **Constraints:**
  - Contains **no** cryptographic algorithm code.
  - Never accesses the raw network; all styling, fonts, and assets are packaged locally.
  - Retains passwords in memory only as long as necessary to initiate an IPC command.

### 2.2 The Bridge Plane (Tauri IPC)
- **Technology:** Tauri 2.5 IPC protocol.
- **Responsibilities:**
  - Serializing and deserializing JSON IPC command payloads between JavaScript and Rust.
  - Streaming real-time progress events (`encrypt-progress`, `decrypt-progress`) from Rust to React at throttled intervals (maximum 60 fps to prevent IPC flooding).
  - Enforcing security capabilities defined in `src-tauri/capabilities/default.json`.

### 2.3 The Backend Core Plane (Rust)
- **Technology:** Rust 1.85+ (Edition 2024), compiled with Link-Time Optimization (`lto = true`) and binary symbol stripping.
- **Responsibilities:**
  - High-performance key derivation via Argon2id.
  - Authenticated encryption and decryption via AES-256-GCM.
  - Chunked file streaming with constant memory usage ($O(1)$ RAM overhead).
  - Atomic filesystem write operations and failure rollbacks.
  - Sanitization of memory containing keys and passwords via the `zeroize` crate.

---

## 3. Module Hierarchy & Dependencies

The backend code structure is partitioned into isolated, modular domains:

```
sfel_lib (src-tauri/src/)
|-- lib.rs                     # Tauri builder, plugin initialization, command registration
|-- error.rs                   # Unified SfelError definition with serde serialization
|-- commands/                  # IPC Command handlers exposed to the frontend
|   |-- mod.rs                 # Command module exports
|   |-- encrypt.rs             # cmd_encrypt orchestrator
|   |-- decrypt.rs             # cmd_decrypt orchestrator
|   `-- cancel.rs              # cmd_cancel cancellation token manager
|-- crypto/                    # Pure cryptographic primitives
|   |-- mod.rs                 # Crypto module exports
|   |-- kdf.rs                 # Argon2id password-to-key derivation
|   |-- aead.rs                # AES-256-GCM encryption/decryption routines
|   |-- chunks.rs              # Chunk nonce derivation and AAD packing
|   `-- rng.rs                 # System entropy wrappers (rand::rngs::OsRng)
|-- format/                    # SFEL v1 binary envelope parsing & serialization
|   |-- mod.rs                 # Format module exports
|   |-- header.rs              # 64-byte Header struct, binary packing/unpacking
|   `-- validation.rs          # Magic bytes, bounds, and version verification
`-- fs/                        # Filesystem safety & streaming
    |-- mod.rs                 # Filesystem module exports
    |-- temp.rs                # RAII-based TempFile guard with auto-deletion on drop
    `-- atomic.rs              # Platform atomic rename and fsync sync routines
```

---

## 4. Operational Data Flows

### 4.1 Encryption Workflow

The encryption workflow transforms any source file into a tamper-evident `.sfel` container file:

```
[ User Selects File & Password ]
               |
               v
  (React UI invokes `cmd_encrypt`)
               |
               v
1. Derive Key & Generate Header
   - Generate 16-byte cryptographically secure random salt (`OsRng`).
   - Generate 12-byte cryptographically secure base nonce (`OsRng`).
   - Run Argon2id ($m=64\text{ MiB}, t=3, p=4$) on password + salt -> 256-bit Key.
   - Construct 64-byte SFEL v1 header (`SFEL`, version=1, mode=Chunked, params).
               |
               v
2. Initialize Target Filesystem
   - Determine target directory: `<input_dir>/<file_name>.sfel`.
   - Create secure temporary file: `<input_dir>/<file_name>.sfel.<uuid>.tmp`.
   - Write 64-byte header to the temporary file.
               |
               v
3. Stream & Encrypt Chunks (1 MiB Plaintext per Chunk)
   - Loop over input file reading up to 1,048,576 bytes:
     * Derivation: Derive chunk nonce = `Base_Nonce XOR Counter(Chunk_Index)`.
     * Construct AAD = `Header[0..64] || Chunk_Index (8B LE) || Is_Last (1B)`.
     * Encrypt chunk with AES-256-GCM(Key, Nonce, Plaintext, AAD).
     * Write 4-byte chunk length + 1-byte is_last + ciphertext + 16-byte tag.
     * Emit progress event to UI.
     * Check cancellation token. If cancelled -> abort and clean up.
               |
               v
4. Finalize & Atomic Rename
   - Flush buffers and call `sync_all()` on temporary file descriptor.
   - Atomically rename `.tmp` file to destination `<file_name>.sfel`.
   - Wipe key and password buffers from memory using `Zeroize`.
   - Return success response to UI.
```

### 4.2 Decryption Workflow

The decryption workflow verifies authenticity and restores the original file:

```
[ User Selects .sfel File & Enters Password ]
               |
               v
  (React UI invokes `cmd_decrypt`)
               |
               v
1. Parse & Validate Header
   - Read first 64 bytes of file.
   - Verify magic bytes equal `0x53 0x46 0x45 0x4C` (`SFEL`).
   - Verify format version equals `0x01`.
   - Validate Argon2id parameters against security bounds ($m \le 1024\text{ MiB}, t \le 10, p \le 16$).
   - Extract 16-byte salt and 12-byte base nonce.
               |
               v
2. Derive Key
   - Run Argon2id with extracted salt and parameters -> 256-bit Key.
               |
               v
3. Initialize Destination File
   - Create secure temporary file: `<target_dir>/<restored_file>.<uuid>.tmp`.
               |
               v
4. Stream & Verify Chunks
   - Loop through chunks:
     * Read chunk length (4B) and is_last flag (1B).
     * Read ciphertext + tag (16B).
     * Reconstruct AAD = `Header[0..64] || Chunk_Index (8B LE) || Is_Last (1B)`.
     * Reconstruct chunk nonce = `Base_Nonce XOR Counter(Chunk_Index)`.
     * Decrypt and verify tag with AES-256-GCM.
     * If MAC tag validation fails -> Abort immediately, delete temporary file,
       and return `AuthenticationFailed`.
     * Write decrypted plaintext chunk to temporary file.
     * If `is_last == 1`, break loop.
               |
               v
5. Finalize & Atomic Rename
   - Verify that the stream terminated on an authenticated final chunk (`is_last == 1`).
   - Flush and `sync_all()` temporary file.
   - Atomically rename `.tmp` file to restored original filename.
   - Zeroize key buffers.
   - Return success response to UI.
```

---

## 5. State Management & Frontend Architecture

The frontend application uses React 19 functional components and lightweight React Contexts to avoid unnecessary external state library dependencies:

- **`ThemeContext`:** Manages global appearance theme (`dark`, `light`, `cyberpunk`). Persists preference in `localStorage`.
- **`CryptoOperationContext`:** Tracks the active operation state:
  - `status`: `'idle' | 'deriving_key' | 'encrypting' | 'decrypting' | 'completed' | 'error'`
  - `progress`: Percentage (0 to 100), bytes processed, total bytes, estimated time remaining.
  - `activeTaskId`: UUID of the active backend operation to support user-initiated cancellation.
  - `errorMessage`: Sanitized error notification for display.

---

## 6. Safe File I/O & Atomic Storage Strategy

File corruption during encryption is unacceptable. SFEL guarantees transactional file writing using the **Temp-Write-Fsync-Rename** pattern:

```
[ Input File: document.pdf ]
          |
          v
[ Streaming to: document.pdf.sfel.d19e4f2a.tmp ]
          |
          +---> On User Cancel or Crash ---> [ Auto Deleted by RAII Temp Guard ]
          |
          v (Upon full MAC authentication & sync)
[ Atomic Rename: document.pdf.sfel ]
```

### Guarantees:
1. **Directory Colocation:** Temporary files are created in the **same directory** as the destination file. This guarantees that `fs::rename` is an atomic filesystem metadata update on all POSIX and NTFS systems, avoiding cross-device copy fallbacks.
2. **RAII Temp File Guard:** The `TempFileGuard` struct implements Rust's `Drop` trait. If the function returns early due to an error, panic, or user cancellation, the temporary file is unlinked immediately.
3. **Hardware Flushing:** Before the atomic rename, `std::fs::File::sync_all()` is called to flush OS kernel write caches to physical disk platters/NAND flash.

---

## 7. Error Handling & Side-Channel Mitigation

Error messages in security software can inadvertently function as cryptographic oracles. SFEL implements an intentional ambiguity policy:

- **Unified Authentication Error:** If decryption fails due to an incorrect password, an altered ciphertext bit, a truncated chunk, or an altered header, the backend returns:
  ```
  "Incorrect password or corrupted file"
  ```
  It **never** discloses whether the password derivation was mathematically valid versus whether the AES-GCM MAC tag failed.
- **No Plaintext Leakage on Failure:** In the event of a verification failure on chunk $N$, any preceding chunks ($0 \dots N-1$) already written to the temporary file are deleted prior to returning the error. Partially decrypted data is never exposed.

---

## 8. Security Boundaries & Permissions Model

SFEL follows the Principle of Least Privilege across its execution boundaries:

```
+---------------------------------------------------------------------------------+
| OPERATING SYSTEM KERNEL                                                         |
+---------------------------------------------------------------------------------+
        ^                                               ^
        | OS Syscalls (Read/Write/Rename)               | Hardware Crypto (AES-NI)
        v                                               v
+---------------------------------------------------------------------------------+
| RUST BACKEND PROCESS (sfel_lib)                                                |
| - Scoped local filesystem read/write access.                                    |
| - Zero network libraries compiled in.                                           |
| - Memory zeroization for key material.                                          |
+---------------------------------------------------------------------------------+
        ^
        | Tauri IPC (Strict Structured JSON Commands)
        v
+---------------------------------------------------------------------------------+
| WEBVIEW SANDBOX (React UI)                                                      |
| - Capabilities (`capabilities/default.json`):                                   |
|     * Network access: BLOCKED (No internet, no local intranet sockets).         |
|     * Shell execution: BLOCKED (Cannot execute cmd.exe, bash, or binaries).     |
|     * Clipboard: BLOCKED (Cannot monitor background clipboard).                 |
|     * Remote URLs: BLOCKED (CSP: default-src 'self').                           |
+---------------------------------------------------------------------------------+
```

### Tauri Capability Configuration Summary:
- **`core:default`**: Core application lifecycle events.
- **`dialog:allow-open` / `dialog:allow-save`**: Native OS file pickers invoked by user action.
- **`fs:allow-*`**: Local filesystem access restricted to selected file targets.
- **No network plugins**: `@tauri-apps/plugin-http` or WebSocket plugins are excluded from compilation.
