import React, { useState } from 'react';
import { useI18n } from '../hooks/useI18n';
import './Education.css';

const EDUCATION_TOPICS_EN = [
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

const EDUCATION_TOPICS_FR = [
  {
    id: 'encryption',
    title: 'Qu\'est-ce que le chiffrement ? (AES-256-GCM)',
    summary: 'Transformer des données lisibles en un texte chiffré indéchiffrable sans la clé secrète.',
    content: (
      <>
        <p>
          Le chiffrement est la transformation mathématique d'une information intelligible (texte en clair) en un
          format inintelligible (texte chiffré). Seules les personnes autorisées possédant la clé
          cryptographique correspondante peuvent inverser cette opération.
        </p>
        <p>
          SFEL utilise <strong>AES-256-GCM</strong> (Advanced Encryption Standard avec clés de 256 bits en
          mode Galois/Counter Mode). AES est un standard mondial validé par le NIST et éprouvé par les banques
          et gouvernements les plus exigeants.
        </p>
        <div className="edu-callout">
          <strong>Pourquoi AES-256 ?</strong> Une clé de 256 bits compte 2<sup>256</sup> combinaisons possibles — un
          nombre supérieur à la totalité des atomes dans l'univers observable. Casser cette clé par force brute
          prendrait des milliards d'années à l'ensemble des superordinateurs terrestres réunis.
        </div>
      </>
    ),
  },
  {
    id: 'kdf',
    title: 'Qu\'est-ce que la dérivation de clé ? (Argon2id)',
    summary: 'Convertir une phrase de passe humaine en une clé uniforme et mathématiquement rigide de 256 bits.',
    content: (
      <>
        <p>
          Les humains choisissent des mots de passe comme <code>"Soleil-Montagne-2026!"</code>. Cependant, AES exige
          une séquence brute et uniforme de 32 octets parfaitement aléatoires (256 bits). On ne peut pas simplement
          compléter ou tronquer un mot de passe.
        </p>
        <p>
          Une <strong>Fonction de Dérivation de Clé (KDF)</strong> étire un mot de passe en une clé inviolable. SFEL
          utilise <strong>Argon2id</strong>, vainqueur de la Password Hashing Competition mondiale (standard RFC 9106).
        </p>
        <div className="diagram-box">
          <div className="diagram-step">Mot de passe utilisateur</div>
          <div className="diagram-arrow">+</div>
          <div className="diagram-step">Sel aléatoire de 16 octets</div>
          <div className="diagram-arrow">&rarr;</div>
          <div className="diagram-step highlight">Argon2id (64 Mo RAM, 3 itérations)</div>
          <div className="diagram-arrow">&rarr;</div>
          <div className="diagram-step">Clé Maître 256-Bit</div>
        </div>
        <p>
          Argon2id est dit <em>à mémoire dure</em> (memory-hard) : il requiert 64 mégaoctets de RAM dédiée par essai.
          Cela neutralise les attaques parallèles massives menées sur des cartes graphiques (GPU) ou puces ASIC,
          rendant le piratage par dictionnaire économiquement ruineux.
        </p>
      </>
    ),
  },
  {
    id: 'salt',
    title: 'Qu\'est-ce qu\'un Sel (Salt) ? Pourquoi est-il vital ?',
    summary: 'Une valeur aléatoire unique générée par fichier pour neutraliser les tables arc-en-ciel et le précalcul.',
    content: (
      <>
        <p>
          Si deux personnes emploient le même mot de passe <code>"motdepasse123"</code>, sans sel, elles produiraient
          exactement la même clé cryptographique. Un attaquant pourrait précalculer des milliards de mots de passe
          courants dans une table (« table arc-en-ciel ») et déchiffrer tout le monde d'un seul coup.
        </p>
        <p>
          Un <strong>sel</strong> est un nombre aléatoire de 128 bits généré de manière unique pour chaque fichier
          chiffré à l'aide du générateur cryptographique du système d'exploitation.
        </p>
        <div className="edu-callout">
          <strong>La garantie du Sel :</strong> Même en chiffrant 100 fois le même fichier avec le même mot de passe,
          chaque fichier reçoit un sel différent, générant 100 clés dérivées et 100 textes chiffrés totalement
          distincts. Le sel figure dans l'en-tête du fichier : il est public et ne nécessite aucun secret.
        </div>
      </>
    ),
  },
  {
    id: 'nonce',
    title: 'Qu\'est-ce qu\'un Nonce ? Pourquoi ne doit-il JAMAIS se répéter ?',
    summary: 'Un « nombre à usage unique » garantissant qu\'aucun bloc de données n\'est chiffré dans le même état.',
    content: (
      <>
        <p>
          En mode AES-GCM, le chiffrement se comporte comme un chiffrement par flux : il chiffre un compteur avec la
          clé pour produire un masque jetable (keystream), qui est combiné par un opérateur XOR avec les données.
        </p>
        <p>
          Un <strong>nonce</strong> (Number used ONCE) est une valeur de 96 bits qui initialise ce compteur.
        </p>
        <div className="edu-callout warning-callout">
          <strong>La catastrophe du Nonce :</strong> En mode Galois/Counter, si le même couple (clé, nonce) est
          réutilisé pour chiffrer deux blocs distincts, un attaquant peut effectuer un XOR entre les deux textes chiffrés
          pour éliminer le masque, exposant la structure des données et permettant même de recalculer la clé
          d'authentification !
        </div>
        <p>
          SFEL gère les nonces avec rigueur : un nonce aléatoire de base de 96 bits est généré par fichier, puis chaque
          bloc de 64 Kio incrémente ce compteur de manière strictement déterministe. Le risque de collision est nul.
        </p>
      </>
    ),
  },
  {
    id: 'authentication',
    title: 'Qu\'est-ce que l\'Authentification ? (Balises GCM & Intégrité)',
    summary: 'La preuve mathématique qu\'un fichier chiffré n\'a été ni altéré, ni corrompu, ni tronqué.',
    content: (
      <>
        <p>
          Le chiffrement simple ne garantit que la <em>confidentialité</em> (un espion ne peut pas lire le contenu).
          Il ne garantit aucunement l'<em>intégrité</em>. Les modes historiques (comme le mode CBC classique) permettaient
          à un attaquant de modifier des bits du texte chiffré pour modifier de manière prévisible le document en clair
          sans déclencher d'erreur.
        </p>
        <p>
          AES-GCM est un algorithme de type <strong>AEAD (Authenticated Encryption with Associated Data)</strong>. En
          plus du texte chiffré, il produit une balise d'authentification de 128 bits (MAC).
        </p>
        <div className="diagram-box">
          <div className="diagram-step">Bloc en clair</div>
          <div className="diagram-arrow">&rarr; AES-GCM &rarr;</div>
          <div className="diagram-step">Bloc chiffré</div>
          <div className="diagram-arrow">+</div>
          <div className="diagram-step highlight">Balise d'authentification 128 bits</div>
        </div>
        <p>
          Lors du déchiffrement, si le moindre bit du fichier a été altéré par un disque défaillant ou modifié par un
          adversaire, la vérification mathématique échoue immédiatement. SFEL stoppe le traitement et n'écrit jamais de
          données altérées sur votre disque.
        </p>
      </>
    ),
  },
  {
    id: 'limitations',
    title: 'Modèle de menaces & Ce contre quoi SFEL ne peut PAS protéger',
    summary: 'Comprendre les frontières opérationnelles et les limites physiques du chiffrement applicatif.',
    content: (
      <>
        <p>
          Une sécurité honnête et responsable exige de reconnaître ses frontières. SFEL offre une protection
          mathématique de premier ordre pour vos fichiers au repos, mais ne peut défier les lois des systèmes informatiques.
        </p>
        <ul className="limitations-list">
          <li>
            <strong>Poste de travail compromis (Malwares / Keyloggers) :</strong> Si votre machine est infectée par un
            logiciel espion, un pirate peut intercepter votre phrase de passe lors de sa frappe ou copier le fichier clair
            lorsqu'il est ouvert.
          </li>
          <li>
            <strong>Oubli du mot de passe :</strong> Il n'existe aucune porte dérobée, aucune clé universelle et aucun
            recours de réinitialisation. En cas de perte de votre mot de passe, vos données sont définitivement perdues.
          </li>
          <li>
            <strong>Suppression de fichiers / Rançongiciels :</strong> Le chiffrement interdit la lecture non autorisée,
            mais n'empêche pas un utilisateur hostile ou un ransomware de supprimer le fichier <code>.sfel</code> de
            votre disque. Conservez toujours des sauvegardes déconnectées.
          </li>
          <li>
            <strong>Fuite de métadonnées :</strong> Bien que le contenu soit chiffré, la taille approximative du fichier
            (longueur du conteneur) demeure observable par quiconque a accès au système de fichiers.
          </li>
        </ul>
      </>
    ),
  },
];

export function Education() {
  const { language, t } = useI18n();
  const [openSectionId, setOpenSectionId] = useState('encryption');

  const topics = language === 'fr' ? EDUCATION_TOPICS_FR : EDUCATION_TOPICS_EN;

  const toggleSection = (id) => {
    setOpenSectionId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="education-page-container">
      {/* Header */}
      <div className="page-header-block">
        <h2 className="edu-page-title">{t('education.title')}</h2>
        <p className="edu-page-subtitle">{t('education.subtitle')}</p>
      </div>

      {/* Accordion list */}
      <div className="accordion-container" role="tablist">
        {topics.map((topic) => {
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
