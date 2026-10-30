# Secure File Encryption Lab (SFEL) — User Guide

Welcome to the **Secure File Encryption Lab (SFEL)** user guide. This document provides clear, step-by-step instructions on how to secure your files, choose resilient passphrases, understand diagnostic messages, and explore the internal cryptography that powers the application.

---

## Table of Contents

1. [What is SFEL?](#1-what-is-sfel)
2. [How to Encrypt a File](#2-how-to-encrypt-a-file)
3. [How to Decrypt a File](#3-how-to-decrypt-a-file)
4. [Choosing a Strong Password](#4-choosing-a-strong-password)
5. [Understanding Error Messages](#5-understanding-error-messages)
6. [Themes and Customization](#6-themes-and-customization)
7. [The Cryptography Educational Lab](#7-the-cryptography-educational-lab)
8. [Frequently Asked Questions (FAQ)](#8-frequently-asked-questions-faq)
9. [Known Limitations](#9-known-limitations)

---

## 1. What is SFEL?

SFEL is a desktop application that encrypts individual files into a secure, tamper-evident container format (`.sfel`). Whether you are storing private spreadsheets on an external hard drive, backing up tax records to an untrusted cloud provider, or transmitting confidential contracts across the internet, SFEL ensures:

- **Total Secrecy:** Unauthorized third parties cannot read your files without your passphrase.
- **Tamper Detection:** If anyone modifies, truncates, or damages even a single bit of your encrypted file, SFEL detects it and refuses to produce corrupted plaintext.
- **Filename Privacy:** The original name of your file is hidden within the encrypted envelope, shielding your privacy from observers.

---

## 2. How to Encrypt a File

Encrypting a file takes only a few seconds:

```
Step 1: Select File  -->  Step 2: Enter Password  -->  Step 3: Encrypt  -->  Done (.sfel)
```

### Step-by-Step Instructions:
1. **Launch SFEL** and ensure the **"Encrypt File"** tab is active.
2. **Select your file:**
   - Either **drag and drop** the file from your computer's file manager into the central drop area, OR
   - Click the **"Browse Files"** button to open the system file chooser.
3. **Enter a strong passphrase:**
   - Type your password into the **Password** field.
   - Re-type the identical password into the **Confirm Password** field to prevent typing errors.
   - *(Optional)* Click the eye icon to preview the password text.
   - Check the **Password Strength Meter** below the input fields. Aim for a "Strong" or "Very Strong" rating.
4. **Initiate Encryption:**
   - Click the green **"Encrypt Now"** button.
   - The application will derive a cryptographic key using Argon2id and stream the file through AES-256-GCM authenticated encryption.
5. **Completion:**
   - Once the progress bar reaches 100%, SFEL will confirm success.
   - Your encrypted file will be saved in the same folder as the original file with the extension `.sfel` (e.g., `financial_records.xlsx.sfel`).
   - Your original file remains untouched.

> [!NOTE]
> You can safely delete the unencrypted original once you have confirmed you remember your passphrase.

---

## 3. How to Decrypt a File

Restoring your encrypted file back to its original state:

```
Step 1: Select .sfel File  -->  Step 2: Enter Password  -->  Step 3: Decrypt  -->  Restored File
```

### Step-by-Step Instructions:
1. Open SFEL and switch to the **"Decrypt File"** tab.
2. **Select the `.sfel` container:**
   - Drag and drop any `.sfel` file into the target zone, or click **"Browse Files"**.
3. **Enter your passphrase:**
   - Type the password you used during encryption into the **Password** field.
4. **Initiate Decryption:**
   - Click the blue **"Decrypt Now"** button.
   - SFEL verifies the 64-byte header, derives the symmetric key, and authenticates each data chunk.
5. **Completion:**
   - Upon successful verification, SFEL restores your file with its original filename (e.g., `financial_records.xlsx`) in the same folder.
   - If an existing file with that name already exists, SFEL prompts you before overwriting it.

---

## 4. Choosing a Strong Password

Because SFEL uses **Argon2id** key derivation, brute-forcing attempts require significant physical memory (64 MiB per guess). However, a short or predictable password (like `password123` or `summer2026`) can still be cracked.

### Recommendations for Maximum Security:
- **Use a Passphrase:** Instead of a complex, short password, use a sequence of 4 to 6 random, unrelated words (e.g., `correct-horse-battery-staple` or `orchard-drift-velvet-cobalt`).
- **Length Matters Most:** A passphrase of 20+ characters has vastly higher mathematical entropy than an 8-character password with symbols.
- **Never Reuse Passwords:** Never use your email, banking, or social media passwords for file encryption.
- **Write it Down Securely:** If you forget your passphrase, **your data cannot be recovered by anyone**. Store an offline backup of your passphrase in a secure physical location or a reputable password manager.

---

## 5. Understanding Error Messages

SFEL prioritizes your security even in its error reporting:

### Common Messages & Diagnostics:

| Error Message Displayed | What It Means | Recommended Action |
|---|---|---|
| **"Incorrect password or corrupted file"** | The password provided does not match the file, OR the file's contents have been altered or damaged in transit. | Double-check that you typed your password accurately (watch for Caps Lock). If the password is correct, the file may have suffered transmission corruption (e.g., incomplete cloud download). |
| **"Invalid SFEL file format"** | The selected file is not an authentic `.sfel` container. | Ensure you selected a genuine `.sfel` file. Do not attempt to decrypt non-SFEL files (like regular `.zip` or `.enc` archives). |
| **"Unsupported format version"** | The container was created with a newer version of SFEL. | Upgrade your installation of SFEL to the latest release. |
| **"File is truncated or incomplete"** | The file ended prematurely before the final authenticated chunk. | The file was likely only partially downloaded or copied. Re-download the full `.sfel` file from your source. |
| **"Insufficient disk space"** | Your drive does not have enough remaining free space to write the output file. | Free up disk space on the target volume and retry. |
| **"Operation cancelled by user"** | You clicked the "Cancel" button during processing. | The operation stopped safely; any temporary files were deleted automatically. |

> [!IMPORTANT]
> **Why is the message "Incorrect password or corrupted file" combined?**  
> Cryptographic systems deliberately do not distinguish between a bad password and altered data. Doing so would provide an "oracle" that attackers could exploit to test password guesses without evaluating authentication tags.

---

## 6. Themes and Customization

SFEL includes three built-in visual themes tailored for different working environments:

1. **Dark Theme (Default):** High-contrast dark backgrounds with cyan and indigo accents, designed for low eye strain in dim environments.
2. **Light Theme:** Clean, crisp presentation for bright daylight offices.
3. **Cyberpunk Theme:** Neon emerald and magenta highlights on an ultra-dark canvas, inspired by cybersecurity terminals.

To change themes, click the **Theme toggle button** in the top navigation bar. Your selection is automatically saved for your next session.

---

## 7. The Cryptography Educational Lab

Click on the **"Crypto Lab"** tab in the navigation bar to inspect how modern cryptography works under the hood.

The educational lab features:
- **Interactive Header Breakdown:** Visual byte-by-byte inspection of how a 64-byte `.sfel` header is arranged.
- **Argon2id Simulator:** Explains memory hardness, showing why dedicated cracking hardware struggles against memory-bound algorithms compared to older schemes like MD5 or SHA-256.
- **AEAD & Nonce Inspector:** Demonstrates why nonces must never be reused and how Galois/Counter Mode authenticates data using polynomial evaluation over $GF(2^{128})$.

---

## 8. Frequently Asked Questions (FAQ)

### What happens if I lose my password? Can the SFEL team reset it?
**No.** SFEL employs zero-knowledge local cryptography. There are no master keys, backdoors, recovery questions, or centralized servers. If you lose your password, **your data is permanently irrecoverable**.

### Can SFEL encrypt entire folders?
In version v0.1.0, SFEL encrypts individual files. To encrypt a folder, compress it into a `.zip` or `.tar` archive first, then encrypt that archive with SFEL. Batch folder processing is scheduled for roadmap release v0.2.0.

### Does SFEL upload my files to the internet?
**Never.** SFEL runs 100% locally on your computer. The application build configuration has zero networking libraries and explicitly forbids network communication. You can verify this by running SFEL completely offline or monitoring its process with a firewall.

### How large of a file can I encrypt?
SFEL uses a chunked streaming architecture with 1 MiB blocks. It can encrypt files of virtually any size (up to 16 Terabytes) without consuming excess RAM. A 10 GB file uses the same minimal memory (< 100 MB) as a 10 KB file.

### Is the original filename hidden?
**Yes.** SFEL encrypts the original filename inside the authenticated payload. Anyone inspecting the `.sfel` file can only see the name you gave to the `.sfel` file itself, not what it was originally named.

---

## 9. Known Limitations

- **Single File Focus (v0.1.0):** Batch multi-file queues are currently planned for v0.2.0.
- **Educational Baseline:** While SFEL strictly adheres to modern cryptographic standards, it is an educational portfolio project and has not undergone formal third-party commercial audits.
- **Disk Space Requirement:** Because SFEL uses atomic writing to prevent corruption, you must have enough free disk space to store both the input file and the output file during the operation.
