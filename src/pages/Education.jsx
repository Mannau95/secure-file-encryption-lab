import React, { useState } from 'react';
import './Education.css';

const EDUCATION_TOPICS = [
  {
    id: 'encryption',
    title: 'What is Encryption? (AES-256-GCM)',
    summary: 'Transforming readable data into an unreadable ciphertext decipherable only with the secret key.',
    content: (
      <>
        <p>
          Encryption is the mathematical transformation of intelligible information (plaintext) into an
          unintelligible format (ciphertext). Only authorized parties who possess the corresponding
          cryptographic key can reverse the transformation.
        </p>
        <p>
          SFEL utilizes <strong>AES-256-GCM</strong> (Advanced Encryption Standard with 256-bit keys in
          Galois/Counter Mode). AES is a NIST-standardized block cipher trusted by governments and
          financial institutions worldwide.
        </p>
        <div className="edu-callout">
          <strong>Why AES-256?</strong> A 256-bit key has 2<sup>256</sup> possible combinations—a number
          greater than the number of atoms in the observable universe. Brute-forcing such a key would take
          all the supercomputers on Earth billions of years.
        </div>
      </>
    ),
  },
  {
    id: 'kdf',
    title: 'What is Key Derivation? (Argon2id)',
    summary: 'Converting human-remembered passwords into mathematically rigid, uniform 256-bit keys.',
    content: (
      <>
        <p>
          Humans choose words and phrases like <code>"Mountain-Sun-2026!"</code>. However, AES requires a
          raw, perfectly distributed sequence of 32 random bytes (256 bits). You cannot simply pad or
          truncate a password into an encryption key.
        </p>
        <p>
          A <strong>Key Derivation Function (KDF)</strong> stretches a password into a secure key. SFEL uses{' '}
          <strong>Argon2id</strong>, the winner of the global Password Hashing Competition (RFC 9106).
        </p>
        <div className="diagram-box">
          <div className="diagram-step">User Password</div>
          <div className="diagram-arrow">+</div>
          <div className="diagram-step">16-Byte Random Salt</div>
          <div className="diagram-arrow">&rarr;</div>
          <div className="diagram-step highlight">Argon2id (64 MiB RAM, 3 passes)</div>
          <div className="diagram-arrow">&rarr;</div>
          <div className="diagram-step">256-Bit Master Key</div>
        </div>
        <p>
          Argon2id is <em>memory-hard</em>: it requires 64 megabytes of dedicated RAM per attempt. This
          neutralizes massive parallel attacks built on GPUs or customized ASIC hardware, making
          brute-force dictionary cracking economically infeasible.
        </p>
      </>
    ),
  },
  {
    id: 'salt',
    title: 'What is a Salt? Why is it vital?',
    summary: 'A unique, random value generated per file to neutralize rainbow tables and precomputation.',
    content: (
      <>
        <p>
          If two people use the same password <code>"correcthorsebatterystaple"</code>, without a salt both
          would produce the exact same cryptographic key. An attacker could precompute billions of common
          passwords once into a table (a "rainbow table") and crack everyone simultaneously.
        </p>
        <p>
          A <strong>salt</strong> is a 128-bit random number generated uniquely for every encrypted file using
          the operating system's cryptographic random number generator.
        </p>
        <div className="edu-callout">
          <strong>The Salt Guarantee:</strong> Even if you encrypt 100 identical files with the exact same
          password, every single file receives a distinct salt, resulting in 100 completely different keys and
          100 completely different ciphertexts. The salt is stored in the file header—it is public and does
          not need to be kept secret.
        </div>
      </>
    ),
  },
  {
    id: 'nonce',
    title: 'What is a Nonce? Why must it NEVER repeat?',
    summary: 'A "number used once" that ensures no two ciphertext chunks are ever encrypted with identical state.',
    content: (
      <>
        <p>
          In AES-GCM, the cipher operates like a stream cipher: it encrypts a counter value with the key to
          create a keystream, which is then XORed with the data.
        </p>
        <p>
          A <strong>nonce</strong> (Number used ONCE) is a 96-bit value that initializes the counter.
        </p>
        <div className="edu-callout warning-callout">
          <strong>The Nonce Catastrophe:</strong> In Galois/Counter Mode, if the same key and nonce pair is
          ever reused to encrypt two different chunks of data, an attacker can XOR the ciphertexts together
          to cancel out the keystream, exposing plaintext patterns and recovering the authentication key!
        </div>
        <p>
          SFEL strictly manages nonces: a unique 96-bit random base nonce is generated per file, and each
          64 KiB chunk increments the counter deterministically. Nonce collision probability is zero.
        </p>
      </>
    ),
  },
  {
    id: 'authentication',
    title: 'What is Authentication? (GCM Tags & Integrity)',
    summary: 'Cryptographic proof that ciphertext has not been modified, truncated, or corrupted.',
    content: (
      <>
        <p>
          Encryption alone only guarantees <em>confidentiality</em> (eavesdroppers cannot read the content).
          It does not guarantee <em>integrity</em>. Older ciphers (like standard CBC mode) allowed an
          attacker to flip bits in the ciphertext, causing predictable alterations to the decrypted plaintext
          without raising any error.
        </p>
        <p>
          AES-GCM is an <strong>Authenticated Encryption with Associated Data (AEAD)</strong> cipher. Along
          with the ciphertext, it calculates a 128-bit authentication tag (MAC).
        </p>
        <div className="diagram-box">
          <div className="diagram-step">Plaintext Chunk</div>
          <div className="diagram-arrow">&rarr; AES-GCM &rarr;</div>
          <div className="diagram-step">Ciphertext Chunk</div>
          <div className="diagram-arrow">+</div>
          <div className="diagram-step highlight">128-bit Auth Tag</div>
        </div>
        <p>
          During decryption, if even a single bit of the file has been altered, damaged by disk failure, or
          tampered with by an adversary, the mathematical verification fails completely. SFEL aborts
          immediately and never writes tainted plaintext to disk.
        </p>
      </>
    ),
  },
  {
    id: 'limitations',
    title: 'Threat Model & What SFEL Does NOT Protect Against',
    summary: 'Understanding the operational boundaries and security limits of file encryption software.',
    content: (
      <>
        <p>
          Transparent security requires recognizing boundaries. SFEL provides exceptional mathematical
          protection for files at rest, but it cannot defy the laws of computer systems.
        </p>
        <ul className="limitations-list">
          <li>
            <strong>Compromised Host (Malware / Keyloggers):</strong> If your computer has active spyware or
            a keylogger, an attacker can capture your password as you type it or read the decrypted file while
            it is open.
          </li>
          <li>
            <strong>Lost Passwords:</strong> There is no backdoor, master key, or recovery escrow. If you
            forget your password, your data is permanently lost.
          </li>
          <li>
            <strong>File Deletion / Ransomware:</strong> Encryption prevents unauthorized reading; it cannot
            prevent an unauthorized user or malware from deleting the <code>.sfel</code> file from disk. Always
            maintain offline backups.
          </li>
          <li>
            <strong>Metadata Leakage:</strong> While file contents are heavily encrypted, file size
            (approximated by file container length) remains observable to anyone with filesystem access.
          </li>
        </ul>
      </>
    ),
  },
];

export function Education() {
  const [openSectionId, setOpenSectionId] = useState('encryption');

  const toggleSection = (id) => {
    setOpenSectionId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="education-page-container">
      {/* Header */}
      <div className="page-header-block">
        <h2 className="edu-page-title">Cryptographic Education</h2>
        <p className="edu-page-subtitle">
          Understanding the mathematical principles, standards, and security assumptions underpinning the
          Secure File Encryption Lab.
        </p>
      </div>

      {/* Accordion list */}
      <div className="accordion-container" role="tablist">
        {EDUCATION_TOPICS.map((topic) => {
          const isOpen = openSectionId === topic.id;
          const panelId = `panel-${topic.id}`;
          const buttonId = `button-${topic.id}`;

          return (
            <div key={topic.id} className={`accordion-card ${isOpen ? 'open' : ''}`}>
              <button
                id={buttonId}
                type="button"
                className="accordion-header-btn"
                onClick={() => toggleSection(topic.id)}
                aria-expanded={isOpen}
                aria-controls={panelId}
              >
                <div className="accordion-title-wrap">
                  <h3 className="accordion-heading">{topic.title}</h3>
                  <p className="accordion-summary">{topic.summary}</p>
                </div>

                <div className="accordion-icon-wrap" aria-hidden="true">
                  <svg
                    className={`accordion-chevron ${isOpen ? 'rotated' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </button>

              {isOpen && (
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  className="accordion-panel-content"
                >
                  {topic.content}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Education;
