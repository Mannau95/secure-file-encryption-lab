import React, { useState } from 'react';
import { useI18n } from '../hooks/useI18n';
import './StatusMessage.css';

export function StatusMessage({
  type = 'info', // 'success' | 'error' | 'warning' | 'info'
  title = null,
  message,
  details = null,
  outputPath = null,
  onDismiss = null,
  actionButton = null,
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopyPath = async () => {
    if (!outputPath) return;
    try {
      await navigator.clipboard.writeText(outputPath);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('Failed to copy to clipboard', e);
    }
  };

  const renderIcon = () => {
    switch (type) {
      case 'success':
        return (
          <svg
            className="status-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        );
      case 'error':
        return (
          <svg
            className="status-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        );
      case 'warning':
        return (
          <svg
            className="status-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        );
      default:
        return (
          <svg
            className="status-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        );
    }
  };

  const isAlert = type === 'error' || type === 'warning';

  return (
    <div
      className={`status-message-box status-${type}`}
      role={isAlert ? 'alert' : 'status'}
      aria-live="polite"
    >
      <div className="status-icon-container">{renderIcon()}</div>

      <div className="status-body">
        {title && <h3 className="status-title">{title}</h3>}
        {message && <p className="status-desc">{message}</p>}

        {outputPath && (
          <div className="status-path-container">
            <span className="path-label">{t('common.filename')}:</span>
            <div className="path-box">
              <code className="path-code" title={outputPath}>
                {outputPath}
              </code>
              <button
                type="button"
                className="btn-copy-path"
                onClick={handleCopyPath}
                aria-label={t('common.copy')}
                title={t('common.copy')}
              >
                {copied ? (
                  <span className="copied-text">{t('common.copied')}</span>
                ) : (
                  <svg
                    className="copy-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        )}

        {details && <div className="status-details">{details}</div>}

        {actionButton && <div className="status-actions">{actionButton}</div>}
      </div>

      {onDismiss && (
        <button
          type="button"
          className="status-dismiss-btn"
          onClick={onDismiss}
          aria-label={t('common.cancel')}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="dismiss-icon"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default StatusMessage;
