import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import { useOperation } from '../contexts/OperationContext';
import './Layout.css';

export function Layout() {
  const { activeOperation } = useOperation();
  const location = useLocation();

  const getPageTitle = (pathname) => {
    switch (pathname) {
      case '/':
        return 'Overview';
      case '/encrypt':
        return 'Encrypt File';
      case '/decrypt':
        return 'Decrypt File';
      case '/education':
        return 'Cryptographic Education';
      case '/history':
        return 'Operation History';
      case '/settings':
        return 'Settings & Architecture';
      default:
        return 'Secure File Encryption Lab';
    }
  };

  return (
    <div className="app-container">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Sidebar Navigation */}
      <aside className="app-sidebar" aria-label="Main Navigation">
        <div className="sidebar-brand">
          <div className="brand-icon-wrapper" aria-hidden="true">
            <svg
              className="brand-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div className="brand-info">
            <span className="brand-name">SFEL</span>
            <span className="brand-subtitle">Encryption Lab</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <ul className="nav-list">
            <li>
              <NavLink
                to="/"
                end
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <svg
                  className="nav-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                <span className="nav-label">Home</span>
              </NavLink>
            </li>

            <li>
              <NavLink
                to="/encrypt"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <svg
                  className="nav-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span className="nav-label">Encrypt</span>
              </NavLink>
            </li>

            <li>
              <NavLink
                to="/decrypt"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <svg
                  className="nav-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                </svg>
                <span className="nav-label">Decrypt</span>
              </NavLink>
            </li>

            <li className="nav-divider" role="separator" />

            <li>
              <NavLink
                to="/education"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <svg
                  className="nav-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                <span className="nav-label">Education</span>
              </NavLink>
            </li>

            <li>
              <NavLink
                to="/history"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <svg
                  className="nav-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span className="nav-label">History</span>
              </NavLink>
            </li>

            <li>
              <NavLink
                to="/settings"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <svg
                  className="nav-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                <span className="nav-label">Settings</span>
              </NavLink>
            </li>
          </ul>
        </nav>

        <div className="sidebar-footer">
          <div className="security-badge">
            <span className="badge-dot" />
            <span className="badge-text">AES-256-GCM / Argon2id</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="app-main-wrapper">
        <header className="app-header">
          <div className="header-left">
            <h1 className="header-page-title">{getPageTitle(location.pathname)}</h1>
          </div>

          <div className="header-right">
            {activeOperation?.isRunning && (
              <div className="active-op-pill" aria-live="polite">
                <span className="op-spinner" />
                <span>
                  {activeOperation.type === 'encrypt' ? 'Encrypting...' : 'Decrypting...'}
                </span>
              </div>
            )}
            <ThemeToggle />
          </div>
        </header>

        <main id="main-content" className="app-main" tabIndex="-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;
