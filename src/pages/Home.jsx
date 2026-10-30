import React from 'react';
import { Link } from 'react-router-dom';
import { useOperation } from '../contexts/OperationContext';
import { formatDate } from '../utils/formatters';
import './Home.css';

export function Home() {
  const { history } = useOperation();
  const recentOperations = history.slice(0, 3);

  return (
    <div className="home-container">
      {/* Hero Section */}
      <section className="home-hero">
        <div className="hero-badge">
          <svg
            className="hero-badge-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span>Authenticated AES-256-GCM & Argon2id</span>
        </div>

        <h2 className="hero-title">Secure File Encryption Lab</h2>
        <p className="hero-description">
          A desktop encryption suite engineered with zero-knowledge architecture. Protect sensitive
          files with memory-hard key derivation and cryptographic integrity verification.
        </p>
      </section>

      {/* Main Action Cards */}
      <section className="action-cards-grid" aria-label="Primary Actions">
        {/* Encrypt Card */}
        <Link to="/encrypt" className="action-card encrypt-card">
          <div className="card-top">
            <div className="card-icon-bubble encrypt-bubble" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <span className="card-pill">Protect Data</span>
          </div>

          <div className="card-content">
            <h3 className="card-heading">Encrypt a File</h3>
            <p className="card-text">
              Transform any file into a tamper-proof <code>.sfel</code> vault. Generates unique 128-bit
              salts and per-chunk nonces to prevent correlation attacks.
            </p>
          </div>

          <div className="card-footer">
            <span className="card-action-text">Launch Encrypt Flow</span>
            <svg
              className="card-arrow"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
        </Link>

        {/* Decrypt Card */}
        <Link to="/decrypt" className="action-card decrypt-card">
          <div className="card-top">
            <div className="card-icon-bubble decrypt-bubble" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 9.9-1" />
              </svg>
            </div>
            <span className="card-pill">Restore Data</span>
          </div>

          <div className="card-content">
            <h3 className="card-heading">Decrypt a File</h3>
            <p className="card-text">
              Restore your original file from a <code>.sfel</code> container. Verifies Galois Counter Mode
              authentication tags to guarantee zero bit-rot or tampering.
            </p>
          </div>

          <div className="card-footer">
            <span className="card-action-text">Launch Decrypt Flow</span>
            <svg
              className="card-arrow"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
        </Link>
      </section>

      {/* Security Principles Section */}
      <section className="security-pillars" aria-label="Core Cryptographic Guarantees">
        <div className="pillar-item">
          <div className="pillar-icon" aria-hidden="true">🛡️</div>
          <div className="pillar-info">
            <h4 className="pillar-title">Authenticated Encryption</h4>
            <p className="pillar-desc">
              AES-256-GCM guarantees both confidentiality and ciphertext integrity simultaneously.
            </p>
          </div>
        </div>

        <div className="pillar-item">
          <div className="pillar-icon" aria-hidden="true">⚡</div>
          <div className="pillar-info">
            <h4 className="pillar-title">Argon2id Key Derivation</h4>
            <p className="pillar-desc">
              Configured with 64 MiB RAM and 3 iterations to thwart GPU, ASIC, and dictionary attacks.
            </p>
          </div>
        </div>

        <div className="pillar-item">
          <div className="pillar-icon" aria-hidden="true">📦</div>
          <div className="pillar-info">
            <h4 className="pillar-title">Chunked Streaming</h4>
            <p className="pillar-desc">
              Stream-processes files in 64 KiB chunks with low memory footprint, handling gigabytes smoothly.
            </p>
          </div>
        </div>
      </section>

      {/* Education Callout */}
      <section className="education-banner">
        <div className="edu-banner-content">
          <h3 className="edu-banner-title">Want to understand the cryptography under the hood?</h3>
          <p className="edu-banner-text">
            Learn why random salts stop rainbow tables, why unique nonces prevent catastrophic key leakage,
            and explore what client encryption protects against.
          </p>
        </div>
        <Link to="/education" className="btn btn-secondary edu-banner-btn">
          Explore Crypto Education
        </Link>
      </section>

      {/* Recent History Preview */}
      {recentOperations.length > 0 && (
        <section className="recent-section" aria-label="Recent Operations">
          <div className="recent-header">
            <h3 className="recent-title">Recent Activity</h3>
            <Link to="/history" className="view-all-link">
              View all history &rarr;
            </Link>
          </div>

          <div className="recent-list">
            {recentOperations.map((item) => (
              <div key={item.id} className="recent-item">
                <span className={`op-type-tag ${item.operationType}`}>
                  {item.operationType}
                </span>
                <span className="recent-filename" title={item.filename}>
                  {item.filename}
                </span>
                <span className="recent-date">{formatDate(item.timestamp)}</span>
                <span className={`recent-status ${item.status}`}>
                  {item.status === 'success' ? 'Completed' : 'Failed'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default Home;
