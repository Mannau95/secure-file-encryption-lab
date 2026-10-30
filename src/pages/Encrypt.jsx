import React, { useState, useEffect } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import FileDropZone from '../components/FileDropZone';
import PasswordInput from '../components/PasswordInput';
import ProgressBar from '../components/ProgressBar';
import StatusMessage from '../components/StatusMessage';
import { useEncrypt } from '../hooks/useEncrypt';
import { getFilenameFromPath, truncatePath } from '../utils/formatters';
import { validatePassword, validateDestination } from '../utils/validators';
import './Encrypt.css';

function isTauriEnvironment() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

export function Encrypt() {
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
        <h2 className="flow-title">Encrypt a File</h2>
        <p className="flow-subtitle">
          Securely encode your file into an authenticated <code>.sfel</code> vault using AES-256-GCM
          with Argon2id key derivation.
        </p>
      </div>

      {/* Success State */}
      {status === 'success' && result && (
        <div className="flow-outcome-container">
          <StatusMessage
            type="success"
            title="File Encrypted Successfully"
            message="Your data has been encrypted and authenticated. Keep your password safe—without it, the file cannot be decrypted."
            outputPath={result.outputPath}
            actionButton={
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleResetFlow}
              >
                Encrypt Another File
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
            title="Encryption Failed"
            message={error}
            actionButton={
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => reset()}
              >
                Try Again
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
                <h3 className="step-heading">Select Source File</h3>
                <p className="step-desc">Select any document, image, video, or archive to encrypt.</p>
              </div>
            </div>

            <div className="step-body">
              <FileDropZone
                selectedFile={selectedFile}
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

          {/* Step 2: Password Input */}
          <div className="form-step-card">
            <div className="step-header">
              <span className="step-number" aria-hidden="true">2</span>
              <div>
                <h3 className="step-heading">Set Master Password</h3>
                <p className="step-desc">
                  Choose a memorable, high-entropy password. SFEL cannot recover lost passwords.
                </p>
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
                <h3 className="step-heading">Cryptographic Strength Profile</h3>
                <p className="step-desc">Configure Argon2id memory hardness and computational work factor.</p>
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
                  <div className="profile-badge">⚡ Fast</div>
                  <div className="profile-title">Low Resource</div>
                  <div className="profile-spec">32 MiB RAM • 2 iterations</div>
                  <p className="profile-desc">Quick processing for large media or less sensitive documents.</p>
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
                  <div className="profile-badge recommended">🛡️ Recommended</div>
                  <div className="profile-title">Standard RFC 9106</div>
                  <div className="profile-spec">64 MiB RAM • 3 iterations</div>
                  <p className="profile-desc">Optimal trade-off: strong GPU resistance with ~1 sec latency.</p>
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
                  <div className="profile-badge paranoid">🔒 Paranoid</div>
                  <div className="profile-title">High Security</div>
                  <div className="profile-spec">256 MiB RAM • 5 iterations</div>
                  <p className="profile-desc">Thwarts supercomputer ASIC farms for highly sensitive data.</p>
                </label>
              </div>
            </div>
          </div>

          {/* Step 4: Destination Selection */}
          <div className="form-step-card">
            <div className="step-header">
              <span className="step-number" aria-hidden="true">4</span>
              <div>
                <h3 className="step-heading">Output Destination</h3>
                <p className="step-desc">Choose where the encrypted file will be created.</p>
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
                  Browse Destination
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
              <span>Encrypt File</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default Encrypt;
