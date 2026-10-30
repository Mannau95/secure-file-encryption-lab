import React from 'react';
import { Link } from 'react-router-dom';
import { useOperation } from '../contexts/OperationContext';
import { useI18n } from '../contexts/I18nContext';
import { formatDate } from '../utils/formatters';
import './Home.css';

export function Home() {
  const { history } = useOperation();
  const { t } = useI18n();
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
          <span>{t('home.badge')}</span>
        </div>

        <h2 className="hero-title">{t('home.heroTitle')}</h2>
        <p className="hero-description">{t('home.heroDesc')}</p>
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
            <span className="card-pill">{t('home.encryptCardPill')}</span>
          </div>

          <div className="card-content">
            <h3 className="card-heading">{t('home.encryptCardTitle')}</h3>
            <p className="card-text">
              {t('home.encryptCardText')}
            </p>
          </div>

          <div className="card-footer">
            <span className="card-action-text">{t('home.encryptCardAction')}</span>
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
            <span className="card-pill">{t('home.decryptCardPill')}</span>
          </div>

          <div className="card-content">
            <h3 className="card-heading">{t('home.decryptCardTitle')}</h3>
            <p className="card-text">
              {t('home.decryptCardText')}
            </p>
          </div>

          <div className="card-footer">
            <span className="card-action-text">{t('home.decryptCardAction')}</span>
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
            <h4 className="pillar-title">{t('home.pillars.aeadTitle')}</h4>
            <p className="pillar-desc">{t('home.pillars.aeadDesc')}</p>
          </div>
        </div>

        <div className="pillar-item">
          <div className="pillar-icon" aria-hidden="true">⚡</div>
          <div className="pillar-info">
            <h4 className="pillar-title">{t('home.pillars.argonTitle')}</h4>
            <p className="pillar-desc">{t('home.pillars.argonDesc')}</p>
          </div>
        </div>

        <div className="pillar-item">
          <div className="pillar-icon" aria-hidden="true">📦</div>
          <div className="pillar-info">
            <h4 className="pillar-title">{t('home.pillars.streamTitle')}</h4>
            <p className="pillar-desc">{t('home.pillars.streamDesc')}</p>
          </div>
        </div>
      </section>

      {/* Education Callout */}
      <section className="education-banner">
        <div className="edu-banner-content">
          <h3 className="edu-banner-title">{t('home.eduBannerTitle')}</h3>
          <p className="edu-banner-text">{t('home.eduBannerText')}</p>
        </div>
        <Link to="/education" className="btn btn-secondary edu-banner-btn">
          {t('home.eduBannerBtn')}
        </Link>
      </section>

      {/* Recent History Preview */}
      {recentOperations.length > 0 && (
        <section className="recent-section" aria-label="Recent Operations">
          <div className="recent-header">
            <h3 className="recent-title">{t('home.recentTitle')}</h3>
            <Link to="/history" className="view-all-link">
              {t('home.viewAllHistory')}
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
                  {item.status === 'success' ? t('common.completed') : t('common.failed')}
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
