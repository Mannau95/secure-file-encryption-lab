import React from 'react';
import { useI18n } from '../contexts/I18nContext';
import './LanguageToggle.css';

export function LanguageToggle() {
  const { language, setLanguage } = useI18n();

  const toggleLanguage = () => {
    setLanguage(language === 'fr' ? 'en' : 'fr');
  };

  return (
    <button
      type="button"
      className="language-toggle-btn"
      onClick={toggleLanguage}
      aria-label={`Switch language. Current: ${language === 'fr' ? 'Français' : 'English'}`}
      title={language === 'fr' ? 'Passer en anglais (Switch to English)' : 'Passer en français (Switch to French)'}
    >
      <span className="lang-flag" aria-hidden="true">
        {language === 'fr' ? '🇫🇷' : '🇬🇧'}
      </span>
      <span className="lang-code">{language.toUpperCase()}</span>
    </button>
  );
}

export default LanguageToggle;
