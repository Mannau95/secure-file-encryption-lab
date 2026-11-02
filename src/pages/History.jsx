import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useOperation } from '../contexts/OperationContext';
import { useI18n } from '../contexts/I18nContext';
import { formatBytes, formatDate, truncatePath } from '../utils/formatters';
import './History.css';

export function History() {
  const { history, clearHistory, removeHistoryEntry } = useOperation();
  const { t } = useI18n();
  const [filterType, setFilterType] = useState('all'); // 'all' | 'encrypt' | 'decrypt'
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const handleCopyHash = async (id, hash) => {
    if (!hash) return;
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 2000);
    } catch (e) {
      console.warn('Failed to copy SHA-256 hash', e);
    }
  };

  const filteredHistory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return history.filter((item) => {
      const matchesType = filterType === 'all' || item.operationType === filterType;
      const matchesSearch =
        !q ||
        (item.filename && item.filename.toLowerCase().includes(q)) ||
        (item.outputPath && item.outputPath.toLowerCase().includes(q)) ||
        (item.sha256 && item.sha256.toLowerCase().includes(q));
      return matchesType && matchesSearch;
    });
  }, [history, filterType, searchQuery]);

  const handleClearAll = () => {
    if (window.confirm(t('history.clearConfirm'))) {
      clearHistory();
    }
  };

  return (
    <div className="history-page-container">
      {/* Page Title */}
      <div className="history-header-row">
        <div>
          <h2 className="history-title">{t('history.title')}</h2>
          <p className="history-subtitle">{t('history.subtitle')}</p>
        </div>

        {history.length > 0 && (
          <button
            type="button"
            className="btn btn-secondary clear-btn"
            onClick={handleClearAll}
          >
            {t('history.clearHistory')}
          </button>
        )}
      </div>

      {history.length > 0 ? (
        <div className="history-content-block">
          {/* Controls: Search and Filter Tabs */}
          <div className="history-controls">
            <div className="search-wrap">
              <svg
                className="search-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="search-input"
                placeholder={t('history.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label={t('history.searchPlaceholder')}
              />
            </div>

            <div className="filter-tabs" role="tablist" aria-label="Filter operations">
              <button
                type="button"
                role="tab"
                aria-selected={filterType === 'all'}
                className={`filter-tab ${filterType === 'all' ? 'active' : ''}`}
                onClick={() => setFilterType('all')}
              >
                {t('history.filterAll')} ({history.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filterType === 'encrypt'}
                className={`filter-tab ${filterType === 'encrypt' ? 'active' : ''}`}
                onClick={() => setFilterType('encrypt')}
              >
                {t('history.filterEncrypt')} ({history.filter((h) => h.operationType === 'encrypt').length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filterType === 'decrypt'}
                className={`filter-tab ${filterType === 'decrypt' ? 'active' : ''}`}
                onClick={() => setFilterType('decrypt')}
              >
                {t('history.filterDecrypt')} ({history.filter((h) => h.operationType === 'decrypt').length})
              </button>
            </div>
          </div>

          {/* Table / List */}
          {filteredHistory.length > 0 ? (
            <div className="history-table-wrapper" role="region" aria-label="History table">
              <table className="history-table">
                <thead>
                  <tr>
                    <th scope="col">{t('history.tableOperation')}</th>
                    <th scope="col">{t('history.tableFile')}</th>
                    <th scope="col">{t('history.tableSha256')}</th>
                    <th scope="col">{t('history.tableSize')}</th>
                    <th scope="col">{t('history.tableDate')}</th>
                    <th scope="col">{t('history.tableStatus')}</th>
                    <th scope="col" className="text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((item) => (
                    <tr key={item.id} className="history-row">
                      <td>
                        <span className={`op-badge ${item.operationType}`}>
                          {item.operationType === 'encrypt' ? t('common.encrypt') : t('common.decrypt')}
                        </span>
                      </td>

                      <td>
                        <div className="filename-cell">
                          <span className="primary-filename" title={item.filename}>
                            {item.filename}
                          </span>
                          {item.outputPath && (
                            <span className="secondary-path" title={item.outputPath}>
                              &rarr; {truncatePath(item.outputPath, 40)}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="sha256-cell">
                        {item.sha256 ? (
                          <button
                            type="button"
                            className={`hash-copy-pill ${copiedId === item.id ? 'copied' : ''}`}
                            onClick={() => handleCopyHash(item.id, item.sha256)}
                            title={`${item.sha256} — ${t('sha256.copy')}`}
                          >
                            <code className="hash-short">
                              {item.sha256.slice(0, 8)}…{item.sha256.slice(-6)}
                            </code>
                            <span className="hash-copy-indicator" aria-hidden="true">
                              {copiedId === item.id ? '✓' : '📋'}
                            </span>
                          </button>
                        ) : (
                          <span className="hash-empty">—</span>
                        )}
                      </td>

                      <td className="size-cell">
                        {item.fileSize > 0 ? formatBytes(item.fileSize) : '—'}
                      </td>

                      <td className="date-cell">
                        {formatDate(item.timestamp)}
                      </td>

                      <td>
                        <span className={`status-pill ${item.status}`}>
                          {item.status === 'success' ? t('common.completed') : t('common.failed')}
                        </span>
                      </td>

                      <td className="text-right">
                        <button
                          type="button"
                          className="delete-row-btn"
                          onClick={() => removeHistoryEntry(item.id)}
                          title="Supprimer / Delete"
                          aria-label={`Remove ${item.filename} from history`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="trash-icon"
                            aria-hidden="true"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="no-matches">
              <p>{t('history.noMatches')}</p>
            </div>
          )}
        </div>
      ) : (
        /* Empty State */
        <div className="history-empty-state">
          <div className="empty-icon-wrap" aria-hidden="true">
            <svg
              className="empty-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <h3 className="empty-title">{t('history.emptyTitle')}</h3>
          <p className="empty-desc">{t('history.emptyDesc')}</p>
          <div className="empty-actions">
            <Link to="/encrypt" className="btn btn-primary">
              {t('common.encrypt')}
            </Link>
            <Link to="/decrypt" className="btn btn-secondary">
              {t('common.decrypt')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default History;
