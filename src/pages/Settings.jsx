import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTheme } from '../hooks/useTheme';
import { useOperation } from '../contexts/OperationContext';
import { useI18n } from '../contexts/I18nContext';
import './Settings.css';

function isTauriEnvironment() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

export function Settings() {
  const { theme, setTheme, reduceMotion, setReduceMotion } = useTheme();
  const { clearHistory, history } = useOperation();
  const { t, language, setLanguage, supportedLanguages } = useI18n();
  const [clearedNotice, setClearedNotice] = useState(false);
  const [benchStatus, setBenchStatus] = useState('idle'); // 'idle' | 'running' | 'done' | 'error'
  const [benchResult, setBenchResult] = useState(null);
  const [benchError, setBenchError] = useState(null);

  const handleRunBenchmark = async () => {
    if (benchStatus === 'running') return;
    setBenchStatus('running');
    setBenchError(null);

    try {
      if (isTauriEnvironment()) {
        const res = await invoke('cmd_benchmark');
        setBenchResult(res);
      } else {
        await new Promise((r) => setTimeout(r, 900));
        setBenchResult({
          argon2FastMs: 185,
          argon2StandardMs: 540,
          argon2ParanoidMs: 3120,
          aesGcmMibPerSec: 845.2,
          chacha20MibPerSec: 690.5,
        });
      }
      setBenchStatus('done');
    } catch (err) {
      const msg = typeof err === 'string' ? err : err?.message || 'Benchmark failed';
      setBenchError(msg);
      setBenchStatus('error');
    }
  };

  const handleClearHistory = () => {
    if (window.confirm('Voulez-vous vraiment effacer tout l\'historique des opérations ? (Are you sure you want to clear history?)')) {
      clearHistory();
      setClearedNotice(true);
      setTimeout(() => setClearedNotice(false), 3000);
    }
  };

  return (
    <div className="settings-page-container">
      {/* Title */}
      <div className="page-header-block">
        <h2 className="settings-title">{t('settings.title')}</h2>
        <p className="settings-subtitle">{t('settings.subtitle')}</p>
      </div>

      <div className="settings-grid">
        {/* Appearance & Accessibility Section */}
        <section className="settings-card" aria-labelledby="appearance-heading">
          <h3 id="appearance-heading" className="card-section-title">
            {t('settings.appearanceHeading')}
          </h3>

          {/* Language Selector */}
          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">{t('settings.languageLabel')}</span>
              <span className="setting-description">{t('settings.languageDesc')}</span>
            </div>
            <div className="setting-control">
              <select
                className="setting-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                aria-label={t('settings.languageLabel')}
              >
                {supportedLanguages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Theme Selector */}
          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">{t('settings.themeLabel')}</span>
              <span className="setting-description">{t('settings.themeDesc')}</span>
            </div>
            <div className="setting-control">
              <select
                className="setting-select"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                aria-label={t('settings.themeLabel')}
              >
                <option value="light">{t('settings.themeLight')}</option>
                <option value="dark">{t('settings.themeDark')}</option>
                <option value="system">{t('settings.themeSystem')}</option>
              </select>
            </div>
          </div>

          {/* Reduce Motion */}
          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">{t('settings.animationsLabel')}</span>
              <span className="setting-description">{t('settings.animationsDesc')}</span>
            </div>
            <div className="setting-control">
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={reduceMotion}
                  onChange={(e) => setReduceMotion(e.target.checked)}
                  aria-label={t('settings.animationsLabel')}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>
        </section>

        {/* Cryptographic Architecture Parameters */}
        <section className="settings-card" aria-labelledby="crypto-heading">
          <div className="card-header-with-badge">
            <h3 id="crypto-heading" className="card-section-title">
              {t('settings.cryptoHeading')}
            </h3>
            <span className="readonly-badge">{t('settings.cryptoBadge')}</span>
          </div>
          <p className="crypto-params-intro">
            {t('settings.cryptoIntro')}
          </p>

          <div className="params-table">
            <div className="param-row">
              <span className="param-name">Symmetric AEAD Ciphers</span>
              <span className="param-value">AES-256-GCM & ChaCha20-Poly1305 (128-bit MAC)</span>
            </div>
            <div className="param-row">
              <span className="param-name">Key Derivation (KDF)</span>
              <span className="param-value">Argon2id (RFC 9106) + Optional SHA-256 Keyfile</span>
            </div>
            <div className="param-row">
              <span className="param-name">Profile: Fast</span>
              <span className="param-value">32 MiB RAM • 2 iterations • 2 lanes</span>
            </div>
            <div className="param-row">
              <span className="param-name">Profile: Standard (Default)</span>
              <span className="param-value">64 MiB RAM • 3 iterations • 4 lanes</span>
            </div>
            <div className="param-row">
              <span className="param-name">Profile: Paranoid</span>
              <span className="param-value">256 MiB RAM • 5 iterations • 8 lanes</span>
            </div>
            <div className="param-row">
              <span className="param-name">Salt Size</span>
              <span className="param-value">16 bytes (128 bits, OS CSPRNG)</span>
            </div>
            <div className="param-row">
              <span className="param-name">Nonce Size</span>
              <span className="param-value">12 bytes (96 bits per chunk)</span>
            </div>
            <div className="param-row">
              <span className="param-name">Streaming Chunk Size</span>
              <span className="param-value">1 MiB (1,048,576 bytes) chunks with AAD binding</span>
            </div>
          </div>
        </section>

        {/* Hardware Cryptographic Benchmark */}
        <section className="settings-card" aria-labelledby="benchmark-heading">
          <div className="card-header-with-badge">
            <h3 id="benchmark-heading" className="card-section-title">
              ⚡ {t('benchmark.title')}
            </h3>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleRunBenchmark}
              disabled={benchStatus === 'running'}
            >
              {benchStatus === 'running' ? t('benchmark.runningBtn') : t('benchmark.runBtn')}
            </button>
          </div>
          <p className="crypto-params-intro">{t('benchmark.desc')}</p>

          {benchError && (
            <p className="client-error-text" role="alert">
              {benchError}
            </p>
          )}

          {benchResult && (
            <div className="bench-results-grid">
              <div className="bench-metric-card">
                <span className="bench-metric-label">{t('benchmark.argonFast')}</span>
                <strong className="bench-metric-val">{benchResult.argon2FastMs} ms</strong>
                <span className="bench-metric-sub">32 MiB • t=2, p=2</span>
              </div>
              <div className="bench-metric-card">
                <span className="bench-metric-label">{t('benchmark.argonStandard')}</span>
                <strong className="bench-metric-val">{benchResult.argon2StandardMs} ms</strong>
                <span className="bench-metric-sub">64 MiB • t=3, p=4</span>
              </div>
              <div className="bench-metric-card">
                <span className="bench-metric-label">{t('benchmark.argonParanoid')}</span>
                <strong className="bench-metric-val">{benchResult.argon2ParanoidMs} ms</strong>
                <span className="bench-metric-sub">256 MiB • t=5, p=8</span>
              </div>
              <div className="bench-metric-card highlight">
                <span className="bench-metric-label">{t('benchmark.aesThroughput')}</span>
                <strong className="bench-metric-val">{benchResult.aesGcmMibPerSec} MiB/s</strong>
                <span className="bench-metric-sub">AES-256-GCM (1 MiB chunks)</span>
              </div>
              <div className="bench-metric-card highlight">
                <span className="bench-metric-label">{t('benchmark.chachaThroughput')}</span>
                <strong className="bench-metric-val">{benchResult.chacha20MibPerSec} MiB/s</strong>
                <span className="bench-metric-sub">ChaCha20-Poly1305 (1 MiB chunks)</span>
              </div>
            </div>
          )}
        </section>

        {/* Data & Privacy */}
        <section className="settings-card" aria-labelledby="privacy-heading">
          <h3 id="privacy-heading" className="card-section-title">
            {t('settings.privacyHeading')}
          </h3>
          <p className="privacy-desc">
            {t('settings.privacyDesc')}
          </p>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">{t('common.history')}</span>
              <span className="setting-description">
                {t('settings.historyTracking', { count: history.length })}
              </span>
            </div>
            <div className="setting-control">
              <button
                type="button"
                className="btn btn-secondary clear-hist-btn"
                onClick={handleClearHistory}
                disabled={history.length === 0}
              >
                {t('settings.clearHistoryBtn')}
              </button>
            </div>
          </div>

          {clearedNotice && (
            <p className="cleared-alert" role="status">
              {t('history.clearedSuccess')}
            </p>
          )}
        </section>

        {/* About App */}
        <section className="settings-card" aria-labelledby="about-heading">
          <h3 id="about-heading" className="card-section-title">
            {t('settings.aboutHeading')}
          </h3>

          <div className="about-details">
            <div className="about-row">
              <span className="about-label">{t('settings.appVersion')}</span>
              <span className="about-val">v0.3.0</span>
            </div>
            <div className="about-row">
              <span className="about-label">{t('settings.containerFormat')}</span>
              <span className="about-val">SFEL Binary Format v1</span>
            </div>
            <div className="about-row">
              <span className="about-label">{t('settings.desktopEngine')}</span>
              <span className="about-val">Tauri 2 (Rust backend + React UI)</span>
            </div>
            <div className="about-row">
              <span className="about-label">{t('settings.license')}</span>
              <span className="about-val">MIT / Apache-2.0</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Settings;
