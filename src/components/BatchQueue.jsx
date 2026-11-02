import React, { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { formatBytes, formatTime } from '../utils/formatters';
import { useI18n } from '../hooks/useI18n';
import PasswordInput from './PasswordInput';
import FileDropZone from './FileDropZone';
import KeyfileSelector from './KeyfileSelector';
import './BatchQueue.css';

function isTauriEnvironment() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

export function BatchQueue({
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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profile, setProfile] = useState('standard');
  const [cipher, setCipher] = useState('aes-256-gcm');
  const [keyfilePath, setKeyfilePath] = useState('');
  const [destMode, setDestMode] = useState('source'); // 'source' | 'custom'
  const [customDestDir, setCustomDestDir] = useState('');
  const [clientErrors, setClientErrors] = useState({});
  const [copiedId, setCopiedId] = useState(null);

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
      errors.queue = t('batch.emptyQueuePrompt');
    }
    if (!password) {
      errors.password = t('encrypt.step2Desc');
    } else if (password !== confirmPassword) {
      errors.passwordMatch = t('password.mismatch');
    }
    if (destMode === 'custom' && !customDestDir.trim()) {
      errors.destDir = t('batch.customFolder');
    }

    if (Object.keys(errors).length > 0) {
      setClientErrors(errors);
      return;
    }

    setClientErrors({});
    onStartBatch({
      password,
      profile,
      cipher,
      keyfilePath,
      destinationDir: destMode === 'custom' ? customDestDir.trim() : '',
    });
  };

  const getItemBadge = (itemStatus) => {
    switch (itemStatus) {
      case 'completed':
        return <span className="batch-pill pill-completed">✓ {t('batch.itemCompleted')}</span>;
      case 'encrypting':
        return (
          <span className="batch-pill pill-encrypting">
            <span className="dot-pulse" aria-hidden="true" />
            {t('batch.itemEncrypting')}
          </span>
        );
      case 'failed':
        return <span className="batch-pill pill-failed">✕ {t('batch.itemFailed')}</span>;
      case 'cancelled':
        return <span className="batch-pill pill-cancelled">⚠ {t('batch.itemCancelled')}</span>;
      default:
        return <span className="batch-pill pill-pending">{t('batch.itemPending')}</span>;
    }
  };

  return (
    <div className="batch-queue-container">
      {/* Informative Header Banner */}
      <div className="batch-header-banner">
        <div className="batch-banner-text">
          <h3 className="batch-banner-title">{t('batch.queueTitle')}</h3>
          <p className="batch-banner-desc">{t('batch.queueSubtitle')}</p>
        </div>
        <div className="batch-security-tag">
          🔒 {t('batch.sequentialNotice')}
        </div>
      </div>

      {/* Drop Zone to add files */}
      {!isRunning && (
        <div className="batch-drop-wrapper">
          <FileDropZone
            multiple={true}
            allowDirectory={true}
            onFilesSelect={onAddFiles}
            label={t('batch.emptyQueuePrompt')}
            description={t('dropzone.selected')}
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
                {t('batch.filesCount', { count: queue.length })}
              </h4>
              <span className="queue-total-size">
                ({t('batch.totalSize')} {formatBytes(overallStats.totalBytes)})
              </span>
            </div>

            {!isRunning && (
              <div className="queue-actions-row">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={onClearQueue}
                  title={t('batch.clearQueue')}
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
                  {t('batch.clearQueue')}
                </button>
              </div>
            )}
          </div>

          {/* List of files in queue */}
          <div className="queue-items-table" role="region" aria-label={t('batch.queueTitle')}>
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
                      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                      <polyline points="13 2 13 9 20 9" />
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

                    {/* Output path if completed */}
                    {item.outputPath && (
                      <div className="queue-item-output-tag" title={item.outputPath}>
                        ✓ {item.outputPath} ({formatTime(Math.round(item.durationMs / 1000))})
                      </div>
                    )}

                    {/* Source SHA-256 fingerprint if available */}
                    {item.sha256 && (
                      <div className="queue-item-sha256-row">
                        <span className="queue-sha256-label" title={t('sha256.sourceLabel')}>
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
                {t('batch.fileOfTotal', {
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
              ✓ {overallStats.completedCount} {t('batch.itemCompleted').toLowerCase()} • 
              ✕ {overallStats.failedCount} {t('batch.itemFailed').toLowerCase()}
            </span>
            <button
              type="button"
              className="btn btn-outline cancel-btn"
              onClick={onCancelBatch}
            >
              {t('batch.stopBatch')}
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
            <h4 className="outcome-title">{t('batch.batchFinishedTitle')}</h4>
            <p className="outcome-desc">
              {t('batch.batchFinishedDesc', {
                successCount: overallStats.completedCount,
                totalCount: overallStats.totalFiles,
              })}
              {overallStats.failedCount > 0 && ` ${t('batch.batchHasErrors', { failedCount: overallStats.failedCount })}`}
            </p>
          </div>
          <div className="outcome-actions">
            {overallStats.failedCount > 0 && onRetryFailed && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onRetryFailed}
              >
                {t('batch.retryFailed')}
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={onResetQueue}
            >
              {t('batch.newBatch')}
            </button>
          </div>
        </div>
      )}

      {/* Batch Form Settings (Password, Profile, Destination) */}
      {!isRunning && queue.length > 0 && (
        <form className="batch-settings-form" onSubmit={handleStart} noValidate>
          {/* Step 1: Destination Selection */}
          <div className="batch-card form-step-card">
            <div className="step-header">
              <span className="step-number" aria-hidden="true">1</span>
              <div>
                <h4 className="step-heading">{t('batch.destinationHeading')}</h4>
                <p className="step-desc">{t('encrypt.step4Desc')}</p>
              </div>
            </div>

            <div className="step-body dest-mode-selection">
              <label className={`dest-radio-card ${destMode === 'source' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="destMode"
                  value="source"
                  checked={destMode === 'source'}
                  onChange={() => setDestMode('source')}
                />
                <div className="dest-radio-content">
                  <strong>{t('batch.sameFolderAsSource')}</strong>
                  <span className="dest-radio-sub">
                    Chaque conteneur <code>.sfel</code> sera généré dans le répertoire d'origine de son fichier.
                  </span>
                </div>
              </label>

              <label className={`dest-radio-card ${destMode === 'custom' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="destMode"
                  value="custom"
                  checked={destMode === 'custom'}
                  onChange={() => setDestMode('custom')}
                />
                <div className="dest-radio-content">
                  <strong>{t('batch.customFolder')}</strong>
                  <span className="dest-radio-sub">
                    Rassemblez tous les fichiers chiffrés dans un même répertoire cible.
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
                    placeholder="ex: C:\Users\Documents\Coffre"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleBrowseCustomDir}
                  >
                    {t('batch.browseDestination')}
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

          {/* Step 2: Master Password */}
          <div className="batch-card form-step-card">
            <div className="step-header">
              <span className="step-number" aria-hidden="true">2</span>
              <div>
                <h4 className="step-heading">{t('encrypt.step2Title')}</h4>
                <p className="step-desc">{t('encrypt.step2Desc')}</p>
              </div>
            </div>

            <div className="step-body">
              <PasswordInput
                password={password}
                onChange={(p) => {
                  setPassword(p);
                  setClientErrors((prev) => ({ ...prev, password: null }));
                }}
                confirmPassword={confirmPassword}
                onConfirmChange={(cp) => {
                  setConfirmPassword(cp);
                  setClientErrors((prev) => ({ ...prev, passwordMatch: null }));
                }}
                withConfirmation={true}
                disabled={isRunning}
              />
              {clientErrors.password && (
                <p className="client-error-text" role="alert">
                  {clientErrors.password}
                </p>
              )}
              {clientErrors.passwordMatch && (
                <p className="client-error-text" role="alert">
                  {clientErrors.passwordMatch}
                </p>
              )}

              <KeyfileSelector
                keyfilePath={keyfilePath}
                onChange={setKeyfilePath}
                allowGenerate={true}
                disabled={isRunning}
              />
            </div>
          </div>

          {/* Step 3: Argon2id Profile & AEAD Cipher Selection */}
          <div className="batch-card form-step-card">
            <div className="step-header">
              <span className="step-number" aria-hidden="true">3</span>
              <div>
                <h4 className="step-heading">{t('encrypt.step3Title')}</h4>
                <p className="step-desc">{t('encrypt.step3Desc')}</p>
              </div>
            </div>

            <div className="step-body">
              <div className="cipher-selector-block" style={{ marginBottom: '1rem' }}>
                <div className="profiles-grid">
                  <label className={`profile-card ${cipher === 'aes-256-gcm' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="batch-cipher"
                      value="aes-256-gcm"
                      checked={cipher === 'aes-256-gcm'}
                      onChange={() => setCipher('aes-256-gcm')}
                      disabled={isRunning}
                    />
                    <span className="profile-badge badge-recommended">{t('encrypt.ciphers.aesBadge')}</span>
                    <span className="profile-name">{t('encrypt.ciphers.aesTitle')}</span>
                    <span className="profile-cost">{t('encrypt.ciphers.aesSpec')}</span>
                    <span className="profile-desc">{t('encrypt.ciphers.aesDesc')}</span>
                  </label>

                  <label className={`profile-card ${cipher === 'chacha20-poly1305' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="batch-cipher"
                      value="chacha20-poly1305"
                      checked={cipher === 'chacha20-poly1305'}
                      onChange={() => setCipher('chacha20-poly1305')}
                      disabled={isRunning}
                    />
                    <span className="profile-badge">{t('encrypt.ciphers.chachaBadge')}</span>
                    <span className="profile-name">{t('encrypt.ciphers.chachaTitle')}</span>
                    <span className="profile-cost">{t('encrypt.ciphers.chachaSpec')}</span>
                    <span className="profile-desc">{t('encrypt.ciphers.chachaDesc')}</span>
                  </label>
                </div>
              </div>

              <div className="profiles-grid">
                <label className={`profile-card ${profile === 'fast' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="batch-profile"
                    value="fast"
                    checked={profile === 'fast'}
                    onChange={() => setProfile('fast')}
                    disabled={isRunning}
                  />
                  <span className="profile-badge">{t('encrypt.profiles.fastBadge')}</span>
                  <span className="profile-name">{t('encrypt.profiles.fastTitle')}</span>
                  <span className="profile-cost">{t('encrypt.profiles.fastSpec')}</span>
                  <span className="profile-desc">{t('encrypt.profiles.fastDesc')}</span>
                </label>

                <label className={`profile-card ${profile === 'standard' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="batch-profile"
                    value="standard"
                    checked={profile === 'standard'}
                    onChange={() => setProfile('standard')}
                    disabled={isRunning}
                  />
                  <span className="profile-badge badge-recommended">{t('encrypt.profiles.standardBadge')}</span>
                  <span className="profile-name">{t('encrypt.profiles.standardTitle')}</span>
                  <span className="profile-cost">{t('encrypt.profiles.standardSpec')}</span>
                  <span className="profile-desc">{t('encrypt.profiles.standardDesc')}</span>
                </label>

                <label className={`profile-card ${profile === 'paranoid' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="batch-profile"
                    value="paranoid"
                    checked={profile === 'paranoid'}
                    onChange={() => setProfile('paranoid')}
                    disabled={isRunning}
                  />
                  <span className="profile-badge badge-paranoid">{t('encrypt.profiles.paranoidBadge')}</span>
                  <span className="profile-name">{t('encrypt.profiles.paranoidTitle')}</span>
                  <span className="profile-cost">{t('encrypt.profiles.paranoidSpec')}</span>
                  <span className="profile-desc">{t('encrypt.profiles.paranoidDesc')}</span>
                </label>
              </div>
            </div>
          </div>

          {/* Submit Action */}
          <div className="batch-submit-row">
            <button
              type="submit"
              className="btn btn-primary btn-lg start-batch-btn"
              disabled={queue.length === 0 || isRunning}
            >
              🔒 {t('batch.startBatch', { count: queue.length })}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default BatchQueue;