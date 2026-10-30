import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { locales, supportedLanguages, getTranslation } from '../i18n';

const I18nContext = createContext(null);

const STORAGE_KEY = 'sfel_language';

function getInitialLanguage() {
  if (typeof window === 'undefined') return 'fr';

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (saved === 'fr' || saved === 'en')) {
      return saved;
    }

    // Check navigator language
    const navLang = navigator.language || navigator.userLanguage || '';
    if (navLang.toLowerCase().startsWith('fr')) {
      return 'fr';
    }
  } catch (e) {
    console.warn('Unable to read language preference from localStorage:', e);
  }

  return 'fr'; // French as default requested
}

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(getInitialLanguage);

  const setLanguage = useCallback((lang) => {
    if (lang === 'fr' || lang === 'en') {
      setLanguageState(lang);
      try {
        localStorage.setItem(STORAGE_KEY, lang);
      } catch (e) {
        console.warn('Unable to save language preference:', e);
      }
    }
  }, []);

  const t = useCallback(
    (key, params = {}) => {
      const currentDict = locales[language] || locales.fr;
      const fallbackDict = locales.en;
      return getTranslation(currentDict, fallbackDict, key, params);
    },
    [language]
  );

  return (
    <I18nContext.Provider
      value={{
        language,
        setLanguage,
        t,
        supportedLanguages,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
