import { en } from './locales/en';
import { fr } from './locales/fr';

export const locales = { en, fr };

export const supportedLanguages = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
];

/**
 * Resolves a nested key string like 'home.heroTitle' from the given dictionary
 * with fallback to English if key is missing in French.
 */
export function getTranslation(dict, fallbackDict, key, params = {}) {
  const getNested = (obj, path) => {
    return path.split('.').reduce((prev, curr) => (prev && prev[curr] !== undefined ? prev[curr] : undefined), obj);
  };

  let value = getNested(dict, key);
  if (value === undefined && fallbackDict) {
    value = getNested(fallbackDict, key);
  }

  if (value === undefined) {
    return key;
  }

  if (typeof value === 'string' && Object.keys(params).length > 0) {
    return Object.entries(params).reduce((str, [k, v]) => {
      return str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }, value);
  }

  return value;
}
