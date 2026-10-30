import React, { useState } from 'react';
import { useTheme } from '../hooks/useTheme';
import { useOperation } from '../contexts/OperationContext';
import './Settings.css';

export function Settings() {
  const { theme, setTheme, reduceMotion, setReduceMotion } = useTheme();
  const { clearHistory, history } = useOperation();
  const [clearedNotice, setClearedNotice] = useState(false);

  const handleClearHistory = () => {
    if (window.confirm('Are you sure you want to clear all operation history records? This cannot be undone.')) {
      clearHistory();
      setClearedNotice(true);
      setTimeout(() => setClearedNotice(false), 3000);
    }
  };

  return (
    <div className="settings-page-container">
      {/* Title */}
      <div className="page-header-block">
        <h2 className="settings-title">Settings & Parameters</h2>
        <p className="settings-subtitle">
          Configure appearance, view cryptographic constants, and manage local storage.
        </p>
      </div>

      <div className="settings-grid">
        {/* Appearance Section */}
        <section className="settings-card" aria-labelledby="appearance-heading">
          <h3 id="appearance-heading" className="card-section-title">
            Appearance & Accessibility
          </h3>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">Theme Mode</span>
              <span className="setting-description">
                Select your preferred visual style or sync automatically with your system.
              </span>
            </div>
            <div className="setting-control">
              <select
                className="setting-select"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                aria-label="Theme mode"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">Follow System</option>
              </select>
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">Reduce Animations</span>
              <span className="setting-description">
                Minimize interface transitions, spinners, and motion effects.
              </span>
            </div>
            <div className="setting-control">
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={reduceMotion}
                  onChange={(e) => setReduceMotion(e.target.checked)}
                  aria-label="Reduce animations"
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
              Cryptographic Parameters
            </h3>
            <span className="readonly-badge">Read Only (RFC Standard)</span>
          </div>
          <p className="crypto-params-intro">
            SFEL employs hardened, standardized parameters designed to resist GPU clustering and ASIC
            attacks while completing key derivation in &sim;1 second on modern desktop CPUs.
          </p>

          <div className="params-table">
            <div className="param-row">
              <span className="param-name">Symmetric Cipher</span>
              <span className="param-value">AES-256-GCM (Galois/Counter Mode)</span>
            </div>
            <div className="param-row">
              <span className="param-name">Key Derivation (KDF)</span>
              <span className="param-value">Argon2id (RFC 9106)</span>
            </div>
            <div className="param-row">
              <span className="param-name">Memory Cost (m_cost)</span>
              <span className="param-value">64 MiB (65,536 KiB)</span>
            </div>
            <div className="param-row">
              <span className="param-name">Time Cost (t_cost)</span>
              <span className="param-value">3 iterations</span>
            </div>
            <div className="param-row">
              <span className="param-name">Parallelism (p_cost)</span>
              <span className="param-value">4 lanes (threads)</span>
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
              <span className="param-name">Authentication Tag</span>
              <span className="param-value">16 bytes (128 bits GCM MAC)</span>
            </div>
            <div className="param-row">
              <span className="param-name">Streaming Chunk Size</span>
              <span className="param-value">64 KiB chunks</span>
            </div>
          </div>
        </section>

        {/* Data & Privacy */}
        <section className="settings-card" aria-labelledby="privacy-heading">
          <h3 id="privacy-heading" className="card-section-title">
            Data & Privacy
          </h3>
          <p className="privacy-desc">
            SFEL operates completely offline. No telemetry, passwords, cryptographic keys, or plaintext
            data ever leaves this device.
          </p>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">Operation History</span>
              <span className="setting-description">
                Currently tracking {history.length} metadata record{history.length !== 1 ? 's' : ''} (filenames,
                timestamps, and status).
              </span>
            </div>
            <div className="setting-control">
              <button
                type="button"
                className="btn btn-secondary clear-hist-btn"
                onClick={handleClearHistory}
                disabled={history.length === 0}
              >
                Clear History
              </button>
            </div>
          </div>

          {clearedNotice && (
            <p className="cleared-alert" role="status">
              History records have been cleared from local storage.
            </p>
          )}
        </section>

        {/* About App */}
        <section className="settings-card" aria-labelledby="about-heading">
          <h3 id="about-heading" className="card-section-title">
            About Secure File Encryption Lab
          </h3>

          <div className="about-details">
            <div className="about-row">
              <span className="about-label">Application Version</span>
              <span className="about-val">v0.1.0</span>
            </div>
            <div className="about-row">
              <span className="about-label">Container Format</span>
              <span className="about-val">SFEL Binary Format v1</span>
            </div>
            <div className="about-row">
              <span className="about-label">Desktop Engine</span>
              <span className="about-val">Tauri 2 (Rust backend + React UI)</span>
            </div>
            <div className="about-row">
              <span className="about-label">License</span>
              <span className="about-val">MIT / Apache-2.0</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Settings;
