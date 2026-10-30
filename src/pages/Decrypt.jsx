import React, { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import FileDropZone from '../components/FileDropZone';
import PasswordInput from '../components/PasswordInput';
import ProgressBar from '../components/ProgressBar';
import StatusMessage from '../components/StatusMessage';
import { useDecrypt } from '../hooks/useDecrypt';
import { useI18n } from '../contexts/I18nContext';
import { getFilenameFromPath } from '../utils/formatters';
import { validateDestination } from '../utils/validators';
import './Decrypt.css';

function isTauriEnvironment() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

export function Decrypt() {
  const { t } = useI18n();
  const [selectedFile, setSelectedFile] = useState(null);
  const [password, setPassword] = useState('');
  const [destinationPath, setDestinationPath] = useState('');
  const [clientErrors, setClientErrors] = useState({});

  const {
    status,
    progress,
    error,
    result,
    decrypt,
    cancel,
    reset,
  } = useDecrypt();

  // Auto-suggest destination path when file is selected
  useEffect(() => {
    if (selectedFile?.path) {
      // If ends with .sfel, strip it; otherwise suggest restored_
      const originalPath = selectedFile.path;
      if (originalPath.toLowerCase().endsWith('.sfel')) {
        setDestinationPath(originalPath.slice(0, -5));
      } else {
        setDestinationPath(`${originalPath}.decrypted`);
      }
    } else {
      setDestinationPath('');
    }
  }, [selectedFile]);

  const handleSelectDestination = async () => {
    if (status === 'running') return;

    if (isTauriEnvironment()) {
      try {
        // Open folder picker or file save
        const chosen = await open({
          directory: true,
          multiple: false,
        });

        if (chosen && typeof chosen === 'string') {
          // If a directory was chosen, append the suggested filename
          const baseName = selectedFile
            ? getFilenameFromPath(selectedFile.path).replace(/\.sfel$/i, '')
            : 'decrypted_file';
          const sep = chosen.includes('/') ? '/' : '\\';
          setDestinationPath(`${chosen}${sep}${baseName}`);
        }
        return;
      } catch (err) {
        console.warn('Tauri directory dialog error', err);
      }
    }

    // Fallback prompt for browser / manual editing
    const promptPath = window.prompt(
      'Enter destination output path:',
      destinationPath || (selectedFile?.path ? selectedFile.path.replace(/\.sfel$/i, '') : '')
    );
    if (promptPath) {
      setDestinationPath(promptPath);
    }
  };

  const handleStartDecrypt = async (e) => {
    e.preventDefault();
    const errors = {};

    if (!selectedFile || !selectedFile.path) {
      errors.file = 'Please select a .sfel file to decrypt.';
    }

    if (!password) {
      errors.password = 'Password is required to decrypt.';
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

    await decrypt({
      inputPath: selectedFile.path,
      outputPath: destinationPath,
      password: password,
      fileSize: selectedFile.size || 0,
    });
  };

  const handleResetFlow = () => {
    reset();
    setSelectedFile(null);
    setPassword('');
    setDestinationPath('');
    setClientErrors({});
  };

  const isFormValid =
    Boolean(selectedFile?.path) &&
    password.length > 0 &&
    Boolean(destinationPath.trim());

  return (
    <div className="decrypt-page-container">
      {/* Page Title & Subtitle */}
      <div className="page-header-block">
        <h2 className="flow-title">{t('decrypt.pageTitle')}</h2>
        <p className="flow-subtitle">{t('decrypt.pageSubtitle')}</p>
      </div>

      {/* Success State */}
      {status === 'success' && result && (
        <div className="flow-outcome-container">
          <StatusMessage
            type="success"
            title={t('decrypt.successTitle')}
            message={t('decrypt.successMsg')}
            outputPath={result.outputPath}
            actionButton={
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleResetFlow}
              >
                {t('decrypt.decryptAnother')}
              </button>
            }
          />
        </div>
      )}

      {/* Error State */}
      {status === 'error' && error && (
        <div className="flow-outcome-container">
          <StatusMessage
            type="error"
            title={t('decrypt.errorTitle')}
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
            label="Decryption Progress"
          />
        </div>
      )}

      {/* Form (Active when not completed or running) */}
      {status !== 'running' && status !== 'success' && (
        <form className="flow-form" onSubmit={handleStartDecrypt} noValidate>
          {/* Step 1: File Selection */}
          <div className="form-step-card">
            <div className="step-header">
              <span className="step-number" aria-hidden="true">1</span>
              <div>
                <h3 className="step-heading">{t('decrypt.step1Title')}</h3>
                <p className="step-desc">{t('decrypt.step1Desc')}</p>
              </div>
            </div>

            <div className="step-body">
              <FileDropZone
                selectedFile={selectedFile}
                accept={['.sfel']}
                label="Drop .sfel file here or click to browse"
                description="Only files ending with .sfel are recognized as SFEL archives"
                onFileSelect={(f) => {
                  setSelectedFile(f);
                  setClientErrors((prev) => ({ ...prev, file: null }));
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

          {/* Step 2: Password Input (No confirmation for Decrypt) */}
          <div className="form-step-card">
            <div className="step-header">
              <span className="step-number" aria-hidden="true">2</span>
              <div>
                <h3 className="step-heading">{t('decrypt.step2Title')}</h3>
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
                placeholder={t('password.placeholder')}
                disabled={status === 'running'}
              />
              {clientErrors.password && (
                <p className="client-error-text" role="alert">
                  {clientErrors.password}
                </p>
              )}
            </div>
          </div>

          {/* Step 3: Destination Selection */}
          <div className="form-step-card">
            <div className="step-header">
              <span className="step-number" aria-hidden="true">3</span>
              <div>
                <h3 className="step-heading">{t('decrypt.step3Title')}</h3>
                <p className="step-desc">{t('decrypt.step3Desc')}</p>
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
                  placeholder="Restored file destination path"
                  disabled={status === 'running' || !selectedFile}
                  title={destinationPath}
                />
                <button
                  type="button"
                  className="btn btn-secondary browse-dest-btn"
                  onClick={handleSelectDestination}
                  disabled={status === 'running' || !selectedFile}
                >
                  {t('common.browse')}
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
                <path d="M7 11V7a5 5 0 0 1 9.9-1" />
              </svg>
              <span>{t('decrypt.startBtn')}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default Decrypt;
