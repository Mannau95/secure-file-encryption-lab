import { getFileExtension } from './formatters';

/**
 * Evaluates password strength and returns score and recommendations
 * @param {string} password
 * @returns {{ score: number, label: string, feedback: string[], isValid: boolean }}
 */
export function validatePassword(password) {
  if (!password) {
    return {
      score: 0,
      label: 'Empty',
      feedback: ['Password cannot be empty'],
      isValid: false,
    };
  }

  const feedback = [];
  let score = 0;

  // Length scoring
  if (password.length < 8) {
    feedback.push('At least 8 characters recommended');
  } else if (password.length >= 8 && password.length < 12) {
    score += 1;
  } else if (password.length >= 12 && password.length < 16) {
    score += 2;
  } else {
    score += 3;
  }

  // Character variety checks
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  const varietyCount = [hasLower, hasUpper, hasNumber, hasSymbol].filter(Boolean).length;

  if (varietyCount >= 3) {
    score += 1;
  }
  if (varietyCount === 4 && password.length >= 12) {
    score += 1;
  }

  // Cap score between 0 and 4
  const normalizedScore = Math.min(4, Math.max(0, score));

  const labels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];

  if (!hasLower || !hasUpper) {
    feedback.push('Mix uppercase and lowercase letters');
  }
  if (!hasNumber) {
    feedback.push('Include numbers');
  }
  if (!hasSymbol) {
    feedback.push('Include special characters (!@#$%^&*)');
  }

  return {
    score: normalizedScore,
    label: labels[normalizedScore],
    feedback: feedback.length > 0 ? feedback : ['Strong passphrase'],
    isValid: password.length > 0,
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
