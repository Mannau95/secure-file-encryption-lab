import React, { useState, useEffect } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import FileDropZone from '../components/FileDropZone';
import PasswordInput from '../components/PasswordInput';
import ProgressBar from '../components/ProgressBar';
import StatusMessage from '../components/StatusMessage';
import BatchQueue from '../components/BatchQueue';
import Sha256Inspector from '../components/Sha256Inspector';
import { useEncrypt } from '../hooks/useEncrypt';
import { useBatchEncrypt } from '../hooks/useBatchEncrypt';
import { useI18n } from '../contexts/I18nContext';
import { getFilenameFromPath, truncatePath } from '../utils/formatters';
import { validatePassword, validateDestination } from '../utils/validators';
import './Encrypt.css';

function isTauriEnvironment() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

export function Encrypt() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('single'); // 'single' | 'batch'
  const [selectedFile, setSelectedFile] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [destinationPath, setDestinationPath] = useState('');
  const [profile, setProfile] = useState('standard');
  const [clientErrors, setClientErrors] = useState({});

  const {
    status,
    progress,
    error,
    result,
    encrypt,
    cancel,
    reset,
  } = useEncrypt();

  const batch = useBatchEncrypt();

  // Auto-suggest destination path when file is selected
  useEffect(() => {
    if (selectedFile?.path) {
      // Suggest <filepath>.sfel
      setDestinationPath(`${selectedFile.path}.sfel`);
    } else {
      setDestinationPath('');
    }
  }, [selectedFile]);

  const handleSelectDestination = async () => {
    if (status === 'running') return;

    if (isTauriEnvironment() && selectedFile) {
      try {
        const defaultName = `${selectedFile.name || getFilenameFromPath(selectedFile.path)}.sfel`;
        const chosen = await save({
          defaultPath: defaultName,
          filters: [
            {
              name: 'SFEL Encrypted Container',
              extensions: ['sfel'],
            },
          ],
        });

        if (chosen && typeof chosen === 'string') {
          setDestinationPath(chosen);
        }
        return;
      } catch (err) {
        console.warn('Tauri save dialog error', err);
      }
    }

    // Fallback prompt for browser / manual editing
    const promptPath = window.prompt(
      'Enter destination output path:',
      destinationPath || `${selectedFile?.path || 'encrypted'}.sfel`
    );
    if (promptPath) {
      setDestinationPath(promptPath);
    }
  };

  const handleStartEncrypt = async (e) => {
    e.preventDefault();
    const errors = {};

    if (!selectedFile || !selectedFile.path) {
      errors.file = 'Please choose a file to encrypt.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    } else if (password !== confirmPassword) {
      errors.passwordMatch = 'Passwords do not match.';
    }

    const destValidation = validateDestination(destinationPath);
    if (!destValidation.isValid) {
      errors.destination = destValidation.error;
    }

    if (Object.keys(errors).length > 0) {
      setClientErrors(errors);
      return;
    }

    setClientErrors({});

    await encrypt({
      inputPath: selectedFile.path,
      outputPath: destinationPath,
      password: password,
      fileSize: selectedFile.size || 0,
      profile: profile,
    });
  };

  const handleResetFlow = () => {
    reset();
    setSelectedFile(null);
    setPassword('');
    setConfirmPassword('');
    setDestinationPath('');
    setClientErrors({});
  };

  const isFormValid =
    Boolean(selectedFile?.path) &&
    password.length > 0 &&
    password === confirmPassword &&
    Boolean(destinationPath.trim());

  return (
    <div className="encrypt-page-container">
      {/* Page Title & Subtitle */}
      <div className="page-header-block">
        <h2 className="flow-title">{t('encrypt.pageTitle')}</h2>
        <p className="flow-subtitle">{t('encrypt.pageSubtitle')}</p>

        {/* Mode Switcher Tabs */}
        <div className="encrypt-mode-tabs" role="tablist" aria-label="Mode de chiffrement">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'single'}
            className={`mode-tab-btn ${activeTab === 'single' ? 'active' : ''}`}
            onClick={() => setActiveTab('single')}
            disabled={status === 'running' || batch.status === 'running'}
          >
            <span>📄</span>
            <span>{t('batch.tabSingle')}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'batch'}
            className={`mode-tab-btn ${activeTab === 'batch' ? 'active' : ''}`}
            onClick={() => {
              if (selectedFile && batch.queue.length === 0) {
                batch.addFiles([selectedFile]);
              }
              setActiveTab('batch');
            }}
            disabled={status === 'running' || batch.status === 'running'}
          >
            <span>📚</span>
            <span>{t('batch.tabBatch')}</span>
            {batch.queue.length > 0 && (
              <span className="mode-tab-badge">{batch.queue.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* BATCH QUEUE TAB */}
      {activeTab === 'batch' && (
        <BatchQueue
          queue={batch.queue}
          status={batch.status}
          currentIndex={batch.currentIndex}
          currentProgress={batch.currentProgress}
          overallStats={batch.overallStats}
          onAddFiles={batch.addFiles}
          onRemoveFile={batch.removeFile}
          onClearQueue={batch.clearQueue}
          onStartBatch={batch.startBatch}
          onCancelBatch={batch.cancelBatch}
          onResetQueue={batch.resetQueueStatus}
          onRetryFailed={batch.retryFailed}
        />
      )}

      {/* SINGLE FILE TAB */}
      {activeTab === 'single' && (
        <>
          {/* Success State */}
          {status === 'success' && result && (
            <div className="flow-outcome-container">
              <StatusMessage
                type="success"
                title={t('encrypt.successTitle')}
                message={t('encrypt.successMsg')}
                outputPath={result.outputPath}
                actionButton={
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleResetFlow}
                  >
                    {t('encrypt.encryptAnother')}
                  </button>
                }
              />
              {result.sha256 && (
                <Sha256Inspector
                  hash={result.sha256}
                  label={t('sha256.sourceLabel')}
                  description={t('sha256.sourceHint')}
                  allowVerify={false}
                />
              )}
            </div>
          )}

          {/* Error State */}
          {status === 'error' && error && (
            <div className="flow-outcome-container">
              <StatusMessage
                type="error"
                title={t('encrypt.errorTitle')}
                message={error}
                actionButton={
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => reset()}
                  >
                    {t('common.tryAgain')}
                  </button>
                }
              />
            </div>
          )}

          {/* Running / In-Progress State */}
          {status === 'running' && (
            <div className="flow-progress-section">
              <ProgressBar
                percentage={progress.percentage}
                bytesProcessed={progress.bytesProcessed}
                totalBytes={progress.totalBytes}
                stageDescription={progress.stageDescription}
                elapsedSeconds={progress.elapsedSeconds}
                onCancel={cancel}
              />
            </div>
          )}

          {/* Form (Active when not completed or running) */}
          {status !== 'running' && status !== 'success' && (
            <form className="flow-form" onSubmit={handleStartEncrypt} noValidate>
              {/* Step 1: File Selection */}
              <div className="form-step-card">
                <div className="step-header">
                  <span className="step-number" aria-hidden="true">1</span>
                  <div>
                    <h3 className="step-heading">{t('encrypt.step1Title')}</h3>
                    <p className="step-desc">{t('encrypt.step1Desc')}</p>
                  </div>
                </div>

                <div className="step-body">
                  <FileDropZone
                    multiple={true}
                    selectedFile={selectedFile}
                    onFileSelect={(f) => {
                      setSelectedFile(f);
                      setClientErrors((prev) => ({ ...prev, file: null }));
                    }}
                    onFilesSelect={(files) => {
                      if (files.length === 1) {
                        setSelectedFile(files[0]);
                        setClientErrors((prev) => ({ ...prev, file: null }));
                      } else if (files.length > 1) {
                        batch.addFiles(files);
                        setActiveTab('batch');
                      }
                    }}
                    onClear={() => {
                      setSelectedFile(null);
                      setDestinationPath('');
                    }}
                    disabled={status === 'running'}
                  />
                  {clientErrors.file && (
                    <p className="client-error-text" role="alert">
                      {clientErrors.file}
                    </p>
                  )}
                </div>
              </div>

              {/* Step 2: Password Input */}
              <div className="form-step-card">
            <div className="step-header">
              <span className="step-number" aria-hidden="true">2</span>
              <div>
                <h3 className="step-heading">{t('encrypt.step2Title')}</h3>
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
                disabled={status === 'running'}
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
            </div>
          </div>

          {/* Step 3: Argon2id Security Profile */}
          <div className="form-step-card">
            <div className="step-header">
              <span className="step-number" aria-hidden="true">3</span>
              <div>
                <h3 className="step-heading">{t('encrypt.step3Title')}</h3>
                <p className="step-desc">{t('encrypt.step3Desc')}</p>
              </div>
            </div>

            <div className="step-body">
              <div className="profiles-grid">
                <label className={`profile-card ${profile === 'fast' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="argon2-profile"
                    value="fast"
                    checked={profile === 'fast'}
                    onChange={() => setProfile('fast')}
                    className="profile-radio"
                  />
                  <div className="profile-badge">{t('encrypt.profiles.fastBadge')}</div>
                  <div className="profile-title">{t('encrypt.profiles.fastTitle')}</div>
                  <div className="profile-spec">{t('encrypt.profiles.fastSpec')}</div>
                  <p className="profile-desc">{t('encrypt.profiles.fastDesc')}</p>
                </label>

                <label className={`profile-card ${profile === 'standard' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="argon2-profile"
                    value="standard"
                    checked={profile === 'standard'}
                    onChange={() => setProfile('standard')}
                    className="profile-radio"
                  />
                  <div className="profile-badge recommended">{t('encrypt.profiles.standardBadge')}</div>
                  <div className="profile-title">{t('encrypt.profiles.standardTitle')}</div>
                  <div className="profile-spec">{t('encrypt.profiles.standardSpec')}</div>
                  <p className="profile-desc">{t('encrypt.profiles.standardDesc')}</p>
                </label>

                <label className={`profile-card ${profile === 'paranoid' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="argon2-profile"
                    value="paranoid"
                    checked={profile === 'paranoid'}
                    onChange={() => setProfile('paranoid')}
                    className="profile-radio"
                  />
                  <div className="profile-badge paranoid">{t('encrypt.profiles.paranoidBadge')}</div>
                  <div className="profile-title">{t('encrypt.profiles.paranoidTitle')}</div>
                  <div className="profile-spec">{t('encrypt.profiles.paranoidSpec')}</div>
                  <p className="profile-desc">{t('encrypt.profiles.paranoidDesc')}</p>
                </label>
              </div>
            </div>
          </div>

          {/* Step 4: Destination Selection */}
          <div className="form-step-card">
            <div className="step-header">
              <span className="step-number" aria-hidden="true">4</span>
              <div>
                <h3 className="step-heading">{t('encrypt.step4Title')}</h3>
                <p className="step-desc">{t('encrypt.step4Desc')}</p>
              </div>
            </div>

            <div className="step-body">
              <div className="destination-input-group">
                <input
                  type="text"
                  className="text-input dest-input"
                  value={destinationPath}
                  onChange={(e) => {
                    setDestinationPath(e.target.value);
                    setClientErrors((prev) => ({ ...prev, destination: null }));
                  }}
                  placeholder="Output .sfel file path"
                  disabled={status === 'running' || !selectedFile}
                  title={destinationPath}
                />
                <button
                  type="button"
                  className="btn btn-secondary browse-dest-btn"
                  onClick={handleSelectDestination}
                  disabled={status === 'running' || !selectedFile}
                >
                  {t('common.browseDestination')}
                </button>
              </div>
              {clientErrors.destination && (
                <p className="client-error-text" role="alert">
                  {clientErrors.destination}
                </p>
              )}
            </div>
          </div>

          {/* Action Row */}
          <div className="form-action-bar">
            <button
              type="submit"
              className="btn btn-primary start-op-btn"
              disabled={!isFormValid || status === 'running'}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="btn-icon"
                aria-hidden="true"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>{t('encrypt.startBtn')}</span>
            </button>
          </div>
        </form>
      )}
        </>
      )}
    </div>
  );
}

export default Encrypt;
