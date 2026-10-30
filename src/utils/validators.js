import { getFileExtension } from './formatters';

/**
 * Calculates Shannon & pool entropy bits and estimated crack time for a password
 * @param {string} password
 * @returns {{ score: number, label: string, entropyBits: number, crackTime: string, feedback: string[], isValid: boolean }}
 */
export function validatePassword(password) {
  if (!password) {
    return {
      score: 0,
      label: 'Empty',
      entropyBits: 0,
      crackTime: '0 seconds',
      feedback: ['Password cannot be empty'],
      isValid: false,
    };
  }

  const feedback = [];
  const len = password.length;

  // 1. Calculate character pool size
  let poolSize = 0;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  if (hasLower) poolSize += 26;
  if (hasUpper) poolSize += 26;
  if (hasNumber) poolSize += 10;
  if (hasSymbol) poolSize += 33;

  // 2. Base entropy: H = L * log2(poolSize)
  let entropy = poolSize > 0 ? len * (Math.log(poolSize) / Math.LN2) : 0;

  // Deductions for repeated adjacent characters or low diversity
  const uniqueChars = new Set(password).size;
  const repeatRatio = 1 - (uniqueChars / len);
  if (repeatRatio > 0.4) {
    entropy -= entropy * 0.25;
    feedback.push('Avoid repeating identical characters');
  }

  // Deductions for common sequences (abc, 123, qwerty)
  const lower = password.toLowerCase();
  if (/123|abc|qwerty|password|admin|azerty/.test(lower)) {
    entropy = Math.max(10, entropy - 20);
    feedback.push('Avoid obvious dictionary sequences (123, qwerty, admin)');
  }

  const entropyBits = Math.max(0, Math.round(entropy));

  // 3. Crack time estimation assuming an offline GPU cluster capable of 10^10 hashes/sec
  // With Argon2id memory hardness, real attack speed is even slower (~10^4 hashes/sec per GPU)
  let crackTime = 'Instant';
  if (entropyBits < 28) {
    crackTime = 'A few milliseconds';
  } else if (entropyBits < 36) {
    crackTime = 'A few seconds';
  } else if (entropyBits < 45) {
    crackTime = 'A few hours to days';
  } else if (entropyBits < 55) {
    crackTime = 'Several months';
  } else if (entropyBits < 65) {
    crackTime = 'Decades to centuries';
  } else if (entropyBits < 80) {
    crackTime = 'Millions of years';
  } else {
    crackTime = 'Centuries (Billion+ years)';
  }

  // 4. Score mapping based on entropy bits
  let score = 0;
  if (entropyBits >= 75) {
    score = 4;
  } else if (entropyBits >= 60) {
    score = 3;
  } else if (entropyBits >= 45) {
    score = 2;
  } else if (entropyBits >= 28) {
    score = 1;
  } else {
    score = 0;
  }

  const labels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];

  if (len < 10) {
    feedback.push('Use at least 10–12 characters for better resilience');
  }
  if (!hasLower || !hasUpper) {
    feedback.push('Mix uppercase and lowercase letters');
  }
  if (!hasNumber) {
    feedback.push('Include numbers');
  }
  if (!hasSymbol) {
    feedback.push('Include special symbols (!@#$%^&*)');
  }

  return {
    score,
    label: labels[score],
    entropyBits,
    crackTime,
    feedback: feedback.length > 0 ? feedback : ['Excellent cryptographic passphrase!'],
    isValid: len > 0,
  };
}

/**
 * Validates selected file for encryption or decryption
 * @param {{ path: string, name?: string, size?: number } | null} file
 * @param {string|null} expectedExtension
 * @returns {{ isValid: boolean, error: string | null }}
 */
export function validateFileSelection(file, expectedExtension = null) {
  if (!file || !file.path) {
    return { isValid: false, error: 'Please select a file to continue.' };
  }

  if (expectedExtension) {
    const ext = getFileExtension(file.name || file.path);
    const expected = expectedExtension.replace(/^\./, '').toLowerCase();
    if (ext !== expected) {
      return {
        isValid: false,
        error: `Invalid file type. Please select a .${expected} file.`,
      };
    }
  }

  return { isValid: true, error: null };
}

/**
 * Validates destination directory
 * @param {string} destinationPath
 * @returns {{ isValid: boolean, error: string | null }}
 */
export function validateDestination(destinationPath) {
  if (!destinationPath || !destinationPath.trim()) {
    return { isValid: false, error: 'Please specify an output destination folder.' };
  }
  return { isValid: true, error: null };
}
