import React, { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { formatBytes, formatTime } from '../utils/formatters';
import { useI18n } from '../hooks/useI18n';
import PasswordInput from './PasswordInput';
import FileDropZone from './FileDropZone';
import { compareSha256 } from '../utils/hash';
import './BatchQueue.css'; // Reuses the unified styling of BatchQueue

function isTauriEnvironment() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

export function BatchDecryptQueue({
  queue = [],
  status = 'idle',
  currentIndex = -1,
  currentProgress = {},
  overallStats = {},
  onAddFiles,
  onRemoveFile,
  onClearQueue,
  onStartBatch,
  onCancelBatch,
  onResetQueue,
  onRetryFailed = null,
}) {
  const { t } = useI18n();

  const [password, setPassword] = useState('');
  const [destMode, setDestMode] = useState('source'); // 'source' | 'custom'
  const [customDestDir, setCustomDestDir] = useState('');
  const [clientErrors, setClientErrors] = useState({});
  const [copiedId, setCopiedId] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null);
  const [verifyInputs, setVerifyInputs] = useState({});

  const handleCopyItemHash = async (id, hash) => {
    if (!hash) return;
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 2000);
    } catch (err) {
      console.warn('Failed to copy item SHA-256', err);
    }
  };

  const isRunning = status === 'running';
  const isCompleted = status === 'completed' || status === 'cancelled';

  const handleBrowseCustomDir = async () => {
    if (isRunning) return;
    if (isTauriEnvironment()) {
      try {
        const selected = await open({
          directory: true,
          multiple: false,
        });
        if (selected && typeof selected === 'string') {
          setCustomDestDir(selected);
          setClientErrors((prev) => ({ ...prev, destDir: null }));
        }
      } catch (err) {
        console.warn('Failed to open directory dialog', err);
      }
    }
  };

  const handleStart = (e) => {
    e.preventDefault();
    const errors = {};

    if (queue.length === 0) {
      errors.queue = t('batchDecrypt.emptyQueuePrompt');
    }
    if (!password) {
      errors.password = t('decrypt.step2Desc');
    }
    if (destMode === 'custom' && !customDestDir.trim()) {
      errors.destDir = t('batchDecrypt.customFolder');
    }

    if (Object.keys(errors).length > 0) {
      setClientErrors(errors);
      return;
    }

    setClientErrors({});
    onStartBatch({
      password,
      destinationDir: destMode === 'custom' ? customDestDir.trim() : '',
    });
  };

  const getItemBadge = (itemStatus) => {
    switch (itemStatus) {
      case 'completed':
        return <span className="batch-pill pill-completed">✓ {t('batchDecrypt.itemCompleted')}</span>;
      case 'decrypting':
        return (
          <span className="batch-pill pill-encrypting">
            <span className="dot-pulse" aria-hidden="true" />
            {t('batchDecrypt.itemDecrypting')}
          </span>
        );
      case 'failed':
        return <span className="batch-pill pill-failed">✕ {t('batchDecrypt.itemFailed')}</span>;
      case 'cancelled':
        return <span className="batch-pill pill-cancelled">⚠ {t('batchDecrypt.itemCancelled')}</span>;
      default:
        return <span className="batch-pill pill-pending">{t('batchDecrypt.itemPending')}</span>;
    }
  };

  return (
    <div className="batch-queue-container">
      {/* Informative Header Banner */}
      <div className="batch-header-banner">
        <div className="batch-banner-text">
          <h3 className="batch-banner-title">{t('batchDecrypt.queueTitle')}</h3>
          <p className="batch-banner-desc">{t('batchDecrypt.queueSubtitle')}</p>
        </div>
        <div className="batch-security-tag">
          🛡️ {t('batchDecrypt.autoDetectNotice')}
        </div>
      </div>

      {/* Drop Zone to add .sfel files */}
      {!isRunning && (
        <div className="batch-drop-wrapper">
          <FileDropZone
            multiple={true}
            accept={['.sfel']}
            onFilesSelect={onAddFiles}
            label={t('batchDecrypt.emptyQueuePrompt')}
            description={t('decrypt.step1Desc')}
            disabled={isRunning}
          />
        </div>
      )}

      {/* Queue Items Card */}
      {queue.length > 0 && (
        <div className="batch-card queue-list-card">
          <div className="queue-header-row">
            <div className="queue-meta-title">
              <span className="queue-badge-count">{queue.length}</span>
              <h4 className="queue-list-heading">
                {t('batchDecrypt.filesCount', { count: queue.length })}
              </h4>
              <span className="queue-total-size">
                ({t('batchDecrypt.totalSize')} {formatBytes(overallStats.totalBytes)})
              </span>
            </div>

            {!isRunning && (
              <div className="queue-actions-row">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={onClearQueue}
                  title={t('batchDecrypt.clearQueue')}
                >
                  <svg
                    className="btn-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  {t('batchDecrypt.clearQueue')}
                </button>
              </div>
            )}
          </div>

          {/* List of files in queue */}
          <div className="queue-items-table" role="region" aria-label={t('batchDecrypt.queueTitle')}>
            {queue.map((item, index) => {
              const isActive = isRunning && index === currentIndex;

              return (
                <div
                  key={item.id}
                  className={`queue-item-row ${isActive ? 'row-active' : ''} row-${item.status}`}
                >
                  <div className="queue-item-index" aria-hidden="true">
                    #{index + 1}
                  </div>

                  <div className="queue-item-icon-wrapper" aria-hidden="true">
                    <svg
                      className="queue-file-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>

                  <div className="queue-item-details">
                    <div className="item-title-row">
                      <span className="queue-item-name" title={item.path}>
                        {item.name}
                      </span>
                      {item.size > 0 && (
                        <span className="queue-item-size">{formatBytes(item.size)}</span>
                      )}
                    </div>

                    <div className="queue-item-path" title={item.path}>
                      {item.path}
                    </div>

                    {/* Progress Bar for active item */}
                    {isActive && (
                      <div className="active-item-progress">
                        <div className="mini-progress-track">
                          <div
                            className="mini-progress-fill"
                            style={{ width: `${currentProgress.percentage || 0}%` }}
                          />
                        </div>
                        <span className="mini-progress-text">
                          {currentProgress.percentage}% • {currentProgress.stageDescription}
                        </span>
                      </div>
                    )}

                    {/* Error message if failed */}
                    {item.errorMessage && (
                      <div className="queue-item-error-msg">
                        ⚠ {item.errorMessage}
                      </div>
                    )}

                    {/* Output path and restored original name if completed */}
                    {item.outputPath && (
                      <div className="queue-item-output-tag" title={item.outputPath}>
                        ✓ {item.originalName || item.outputPath} ({formatTime(Math.round(item.durationMs / 1000))})
                      </div>
                    )}

                    {/* Restored SHA-256 fingerprint & inline verifier if available */}
                    {item.sha256 && (
                      <div className="queue-item-sha256-block">
                        <div className="queue-item-sha256-row">
                          <span className="queue-sha256-label" title={t('sha256.restoredLabel')}>
                            🛡️ SHA-256 :
                          </span>
                          <code className="queue-sha256-code" title={item.sha256}>
                            {item.sha256.slice(0, 12)}…{item.sha256.slice(-8)}
                          </code>
                          <button
                            type="button"
                            className="queue-sha256-copy-btn"
                            onClick={() => handleCopyItemHash(item.id, item.sha256)}
                            title={`${item.sha256} — ${t('sha256.copy')}`}
                          >
                            {copiedId === item.id ? `✓ ${t('sha256.copied')}` : `📋 ${t('sha256.copy')}`}
                          </button>
                          <button
                            type="button"
                            className={`queue-sha256-verify-toggle ${verifyingId === item.id ? 'active' : ''}`}
                            onClick={() =>
                              setVerifyingId((prev) => (prev === item.id ? null : item.id))
                            }
                          >
                            🔍 {t('sha256.inspectorTitle')}
                          </button>
                        </div>

                        {verifyingId === item.id && (
                          <div className="queue-sha256-verify-box">
                            <input
                              type="text"
                              className="text-input queue-verify-input"
                              value={verifyInputs[item.id] || ''}
                              onChange={(e) =>
                                setVerifyInputs((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                              placeholder={t('sha256.verifyPlaceholder')}
                              spellCheck="false"
                            />
                            {Boolean((verifyInputs[item.id] || '').trim()) && (
                              <span
                                className={`queue-verify-badge ${
                                  compareSha256(item.sha256, verifyInputs[item.id])
                                    ? 'match'
                                    : 'mismatch'
                                }`}
                              >
                                {compareSha256(item.sha256, verifyInputs[item.id])
                                  ? t('sha256.matchSuccess')
                                  : t('sha256.matchMismatch')}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="queue-item-status-col">
                    {getItemBadge(item.status)}
                  </div>

                  {!isRunning && (
                    <button
                      type="button"
                      className="btn-remove-item"
                      onClick={() => onRemoveFile(item.id)}
                      title="Supprimer du lot"
                      aria-label={`Supprimer ${item.name}`}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="remove-icon"
                        aria-hidden="true"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Global Progress Section while running */}
      {isRunning && (
        <div className="batch-card running-progress-card">
          <div className="batch-progress-header">
            <div className="batch-progress-titles">
              <span className="batch-progress-main-title">
                {t('batchDecrypt.fileOfTotal', {
                  current: currentIndex + 1,
                  total: queue.length,
                })}
              </span>
              <span className="batch-progress-sub">
                {queue[currentIndex]?.name}
              </span>
            </div>
            <span className="overall-percent-badge">
              {overallStats.overallPercentage}%
            </span>
          </div>

          <div className="global-progress-track" role="progressbar" aria-valuenow={overallStats.overallPercentage}>
            <div
              className="global-progress-fill"
              style={{ width: `${overallStats.overallPercentage}%` }}
            />
          </div>

          <div className="batch-progress-footer">
            <span className="stats-indicator">
              ✓ {overallStats.completedCount} {t('batchDecrypt.itemCompleted').toLowerCase()} • 
              ✕ {overallStats.failedCount} {t('batchDecrypt.itemFailed').toLowerCase()}
            </span>
            <button
              type="button"
              className="btn btn-outline cancel-btn"
              onClick={onCancelBatch}
            >
              {t('batchDecrypt.stopBatch')}
            </button>
          </div>
        </div>
      )}

      {/* Completion Outcome Banner */}
      {isCompleted && !isRunning && (
        <div className={`batch-card outcome-card ${overallStats.failedCount === 0 ? 'outcome-success' : 'outcome-warning'}`}>
          <div className="outcome-icon" aria-hidden="true">
            {overallStats.failedCount === 0 ? '🎉' : '⚠️'}
          </div>
          <div className="outcome-text">
            <h4 className="outcome-title">{t('batchDecrypt.batchFinishedTitle')}</h4>
            <p className="outcome-desc">
              {t('batchDecrypt.batchFinishedDesc', {
                successCount: overallStats.completedCount,
                totalCount: overallStats.totalFiles,
              })}
              {overallStats.failedCount > 0 && ` ${t('batchDecrypt.batchHasErrors', { failedCount: overallStats.failedCount })}`}
            </p>
          </div>
          <div className="outcome-actions">
            {overallStats.failedCount > 0 && onRetryFailed && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onRetryFailed}
              >
                {t('batchDecrypt.retryFailed')}
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={onResetQueue}
            >
              {t('batchDecrypt.newBatch')}
            </button>
          </div>
        </div>
      )}

      {/* Batch Form Settings (Destination, Password) */}
      {!isRunning && queue.length > 0 && (
        <form className="batch-settings-form" onSubmit={handleStart} noValidate>
          {/* Step 1: Destination Selection */}
          <div className="batch-card form-step-card">
            <div className="step-header">
              <span className="step-number" aria-hidden="true">1</span>
              <div>
                <h4 className="step-heading">{t('batchDecrypt.destinationHeading')}</h4>
                <p className="step-desc">{t('decrypt.step3Desc')}</p>
              </div>
            </div>

            <div className="step-body dest-mode-selection">
              <label className={`dest-radio-card ${destMode === 'source' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="decryptDestMode"
                  value="source"
                  checked={destMode === 'source'}
                  onChange={() => setDestMode('source')}
                />
                <div className="dest-radio-content">
                  <strong>{t('batchDecrypt.sameFolderAsSource')}</strong>
                  <span className="dest-radio-sub">
                    Chaque document restauré sera extrait directement dans le répertoire de son conteneur <code>.sfel</code>.
                  </span>
                </div>
              </label>

              <label className={`dest-radio-card ${destMode === 'custom' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="decryptDestMode"
                  value="custom"
                  checked={destMode === 'custom'}
                  onChange={() => setDestMode('custom')}
                />
                <div className="dest-radio-content">
                  <strong>{t('batchDecrypt.customFolder')}</strong>
                  <span className="dest-radio-sub">
                    Rassemblez l'ensemble des fichiers restaurés dans un dossier spécifique.
                  </span>
                </div>
              </label>

              {destMode === 'custom' && (
                <div className="custom-dest-input-row">
                  <input
                    type="text"
                    className="text-input"
                    value={customDestDir}
                    onChange={(e) => setCustomDestDir(e.target.value)}
                    placeholder="ex: C:\Users\Documents\Restaurés"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleBrowseCustomDir}
                  >
                    {t('batchDecrypt.browseDestination')}
                  </button>
                </div>
              )}
              {clientErrors.destDir && (
                <p className="client-error-text" role="alert">
                  {clientErrors.destDir}
                </p>
              )}
            </div>
          </div>

          {/* Step 2: Decryption Password */}
          <div className="batch-card form-step-card">
            <div className="step-header">
              <span className="step-number" aria-hidden="true">2</span>
              <div>
                <h4 className="step-heading">{t('decrypt.step2Title')}</h4>
                <p className="step-desc">{t('decrypt.step2Desc')}</p>
              </div>
            </div>

            <div className="step-body">
              <PasswordInput
                password={password}
                onChange={(p) => {
                  setPassword(p);
                  setClientErrors((prev) => ({ ...prev, password: null }));
                }}
                withConfirmation={false}
                disabled={isRunning}
                placeholder={t('password.placeholder')}
              />
              {clientErrors.password && (
                <p className="client-error-text" role="alert">
                  {clientErrors.password}
                </p>
              )}
            </div>
          </div>

          {/* Submit Action */}
          <div className="batch-submit-row">
            <button
              type="submit"
              className="btn btn-primary btn-lg start-batch-btn"
              disabled={queue.length === 0 || isRunning}
            >
              🔓 {t('batchDecrypt.startBatch', { count: queue.length })}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default BatchDecryptQueue;