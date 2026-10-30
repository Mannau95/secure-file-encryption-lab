import React, { useState, useEffect, useCallback } from 'react';
import { useI18n } from '../hooks/useI18n';
import {
  generateRandomPassword,
  generatePassphrase,
  estimateGeneratedEntropy,
} from '../utils/passwordGenerator';
import './PasswordGenerator.css';

export function PasswordGenerator({ isOpen, onClose, onApply }) {
  const { language, t } = useI18n();

  const [mode, setMode] = useState('random'); // 'random' | 'passphrase'
  const [copied, setCopied] = useState(false);

  // Random mode options
  const [randomConfig, setRandomConfig] = useState({
    length: 24,
    includeLower: true,
    includeUpper: true,
    includeNumbers: true,
    includeSymbols: true,
    avoidAmbiguous: true,
  });

  // Passphrase mode options
  const [passphraseConfig, setPassphraseConfig] = useState({
    wordCount: 5,
    separator: '-',
    capitalize: true,
    includeNumber: true,
  });

  const [generatedPassword, setGeneratedPassword] = useState('');

  const generate = useCallback(() => {
    if (mode === 'random') {
      const pwd = generateRandomPassword(randomConfig);
      setGeneratedPassword(pwd);
    } else {
      const phrase = generatePassphrase({
        ...passphraseConfig,
        language: language === 'fr' ? 'fr' : 'en',
      });
      setGeneratedPassword(phrase);
    }
  }, [mode, randomConfig, passphraseConfig, language]);

  // Generate on open or mode/config change
  useEffect(() => {
    if (isOpen) {
      generate();
    }
  }, [isOpen, generate]);

  const handleCopy = async () => {
    if (!generatedPassword) return;
    try {
      await navigator.clipboard.writeText(generatedPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('Failed to copy to clipboard', e);
    }
  };

  const handleApply = () => {
    if (generatedPassword) {
      onApply(generatedPassword);
      onClose();
    }
  };

  if (!isOpen) return null;

  const estimatedBits = estimateGeneratedEntropy(
    mode,
    mode === 'random' ? randomConfig : passphraseConfig,
    language
  );

  return (
    <div className="generator-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="gen-title">
      <div className="generator-modal-card">
        {/* Header */}
        <div className="generator-header">
          <div className="generator-title-wrap">
            <span className="generator-header-icon" aria-hidden="true">🎲</span>
            <div>
              <h3 id="gen-title" className="generator-title">
                {t('generator.modalTitle')}
              </h3>
              <p className="generator-subtitle">{t('generator.modalSubtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            className="generator-close-btn"
            onClick={onClose}
            aria-label={t('generator.close')}
            title={t('generator.close')}
          >
            ✕
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="generator-mode-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'random'}
            className={`gen-tab-btn ${mode === 'random' ? 'active' : ''}`}
            onClick={() => setMode('random')}
          >
            <span>🔤</span>
            <span>{t('generator.tabRandom')}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'passphrase'}
            className={`gen-tab-btn ${mode === 'passphrase' ? 'active' : ''}`}
            onClick={() => setMode('passphrase')}
          >
            <span>📖</span>
            <span>{t('generator.tabPassphrase')}</span>
          </button>
        </div>

        {/* Live Preview Display Box */}
        <div className="generated-output-box">
          <div className="generated-text-wrapper">
            <span className="generated-password-text" title={generatedPassword}>
              {generatedPassword}
            </span>
          </div>

          <div className="output-controls-row">
            <span className="entropy-indicator-badge">
              🔒 {t('generator.entropyEstimate', { bits: estimatedBits })}
            </span>

            <div className="output-buttons-group">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleCopy}
                title={t('generator.copy')}
              >
                {copied ? `✓ ${t('generator.copied')}` : `📋 ${t('generator.copy')}`}
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={generate}
                title={t('generator.regenerate')}
              >
                🔄 {t('generator.regenerate')}
              </button>
            </div>
          </div>
        </div>

        {/* Settings Body */}
        <div className="generator-body">
          {mode === 'random' && (
            <div className="generator-controls-grid">
              {/* Length Slider */}
              <div className="slider-control-group">
                <div className="slider-label-row">
                  <span className="slider-name">
                    {t('generator.lengthLabel', { length: randomConfig.length })}
                  </span>
                </div>
                <input
                  type="range"
                  min="12"
                  max="64"
                  value={randomConfig.length}
                  onChange={(e) =>
                    setRandomConfig((prev) => ({ ...prev, length: Number(e.target.value) }))
                  }
                  className="generator-slider"
                />
              </div>

              {/* Checkboxes */}
              <div className="checkboxes-grid">
                <label className="gen-checkbox-label">
                  <input
                    type="checkbox"
                    checked={randomConfig.includeUpper}
                    onChange={(e) =>
                      setRandomConfig((prev) => ({ ...prev, includeUpper: e.target.checked }))
                    }
                  />
                  <span>{t('generator.includeUpper')}</span>
                </label>

                <label className="gen-checkbox-label">
                  <input
                    type="checkbox"
                    checked={randomConfig.includeLower}
                    onChange={(e) =>
                      setRandomConfig((prev) => ({ ...prev, includeLower: e.target.checked }))
                    }
                  />
                  <span>{t('generator.includeLower')}</span>
                </label>

                <label className="gen-checkbox-label">
                  <input
                    type="checkbox"
                    checked={randomConfig.includeNumbers}
                    onChange={(e) =>
                      setRandomConfig((prev) => ({ ...prev, includeNumbers: e.target.checked }))
                    }
                  />
                  <span>{t('generator.includeNumbers')}</span>
                </label>

                <label className="gen-checkbox-label">
                  <input
                    type="checkbox"
                    checked={randomConfig.includeSymbols}
                    onChange={(e) =>
                      setRandomConfig((prev) => ({ ...prev, includeSymbols: e.target.checked }))
                    }
                  />
                  <span>{t('generator.includeSymbols')}</span>
                </label>

                <label className="gen-checkbox-label col-span-2">
                  <input
                    type="checkbox"
                    checked={randomConfig.avoidAmbiguous}
                    onChange={(e) =>
                      setRandomConfig((prev) => ({ ...prev, avoidAmbiguous: e.target.checked }))
                    }
                  />
                  <span>{t('generator.avoidAmbiguous')}</span>
                </label>
              </div>
            </div>
          )}

          {mode === 'passphrase' && (
            <div className="generator-controls-grid">
              {/* Word Count Slider */}
              <div className="slider-control-group">
                <div className="slider-label-row">
                  <span className="slider-name">
                    {t('generator.wordsLabel', { count: passphraseConfig.wordCount })}
                  </span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="8"
                  value={passphraseConfig.wordCount}
                  onChange={(e) =>
                    setPassphraseConfig((prev) => ({
                      ...prev,
                      wordCount: Number(e.target.value),
                    }))
                  }
                  className="generator-slider"
                />
              </div>

              {/* Passphrase Options */}
              <div className="checkboxes-grid">
                <label className="gen-checkbox-label">
                  <input
                    type="checkbox"
                    checked={passphraseConfig.capitalize}
                    onChange={(e) =>
                      setPassphraseConfig((prev) => ({ ...prev, capitalize: e.target.checked }))
                    }
                  />
                  <span>{t('generator.capitalizeWords')}</span>
                </label>

                <label className="gen-checkbox-label">
                  <input
                    type="checkbox"
                    checked={passphraseConfig.includeNumber}
                    onChange={(e) =>
                      setPassphraseConfig((prev) => ({ ...prev, includeNumber: e.target.checked }))
                    }
                  />
                  <span>{t('generator.includeNumberInPassphrase')}</span>
                </label>

                <div className="separator-select-wrapper col-span-2">
                  <label htmlFor="gen-separator" className="separator-label">
                    {t('generator.separatorLabel')}
                  </label>
                  <select
                    id="gen-separator"
                    className="separator-select"
                    value={passphraseConfig.separator}
                    onChange={(e) =>
                      setPassphraseConfig((prev) => ({ ...prev, separator: e.target.value }))
                    }
                  >
                    <option value="-">- (Tiret / Hyphen)</option>
                    <option value=".">. (Point / Dot)</option>
                    <option value="_">_ (Underscore)</option>
                    <option value=" "> (Espace / Space)</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="generator-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('generator.close')}
          </button>
          <button type="button" className="btn btn-primary" onClick={handleApply}>
            ✨ {t('generator.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PasswordGenerator;