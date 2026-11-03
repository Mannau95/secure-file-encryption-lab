import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import FileDropZone from '../components/FileDropZone';
import KeyfileSelector from '../components/KeyfileSelector';
import ProgressBar from '../components/ProgressBar';
import StatusMessage from '../components/StatusMessage';
import { useI18n } from '../contexts/I18nContext';
import { formatBytes, getFilenameFromPath } from '../utils/formatters';
import './Verify.css';

function isTauriEnvironment() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

export function Verify() {
  const { t } = useI18n();
  const [selectedFile, setSelectedFile] = useState(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState(null);
  const [report, setReport] = useState(null);

  // Comparison state (reference hash or second file)
  const [compareHash, setCompareHash] = useState('');
  const [comparedFileName, setComparedFileName] = useState('');
  const [comparingFile, setComparingFile] = useState(false);
  const [copiedMainHash, setCopiedMainHash] = useState(false);
  const [copiedPlaintextHash, setCopiedPlaintextHash] = useState(false);

  // Dry-run .sfel verification state
  const [password, setPassword] = useState('');
  const [keyfilePath, setKeyfilePath] = useState('');
  const [dryRunStatus, setDryRunStatus] = useState('idle'); // 'idle' | 'running' | 'success' | 'error'
  const [dryRunProgress, setDryRunProgress] = useState({ percent: 0, bytesProcessed: 0, totalBytes: 0 });
  const [dryRunResult, setDryRunResult] = useState(null);
  const [dryRunError, setDryRunError] = useState(null);

  // Automatically inspect file when selected
  useEffect(() => {
    let cancelled = false;

    async function runInspection() {
      if (!selectedFile?.path) {
        setReport(null);
        setInspectError(null);
        setDryRunStatus('idle');
        setDryRunResult(null);
        setDryRunError(null);
        return;
      }

      setInspecting(true);
      setInspectError(null);
      setDryRunStatus('idle');
      setDryRunResult(null);
      setDryRunError(null);

      if (!isTauriEnvironment()) {
        setInspecting(false);
        setInspectError('Native Tauri runtime required to inspect local file integrity.');
        return;
      }

      try {
        const res = await invoke('cmd_inspect_file_integrity', { path: selectedFile.path });
        if (!cancelled) {
          setReport(res);
        }
      } catch (err) {
        if (!cancelled) {
          setInspectError(typeof err === 'string' ? err : err?.message || String(err));
          setReport(null);
        }
      } finally {
        if (!cancelled) {
          setInspecting(false);
        }
      }
    }

    runInspection();
    return () => {
      cancelled = true;
    };
  }, [selectedFile]);

  const handleCopyHash = async (hashValue, setCopiedFn) => {
    if (!hashValue) return;
    try {
      await navigator.clipboard.writeText(hashValue);
      setCopiedFn(true);
      setTimeout(() => setCopiedFn(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleCompareWithFile = async () => {
    if (!isTauriEnvironment() || comparingFile) return;

    try {
      const chosen = await open({
        multiple: false,
        directory: false,
      });

      if (chosen && typeof chosen === 'string') {
        setComparingFile(true);
        const secondHash = await invoke('cmd_hash_file', { path: chosen });
        setCompareHash(secondHash);
        setComparedFileName(getFilenameFromPath(chosen));
      }
    } catch (err) {
      setInspectError(typeof err === 'string' ? err : err?.message || String(err));
    } finally {
      setComparingFile(false);
    }
  };

  const handleRunDryVerify = async (e) => {
    e.preventDefault();
    if (!selectedFile?.path || !password || dryRunStatus === 'running') return;

    setDryRunStatus('running');
    setDryRunError(null);
    setDryRunResult(null);
    setDryRunProgress({ percent: 0, bytesProcessed: 0, totalBytes: report?.sfelInfo?.originalFileSize || 0 });

    let unlisten = null;
    try {
      if (isTauriEnvironment()) {
        unlisten = await listen('verify-progress', (event) => {
          const p = event.payload;
          setDryRunProgress({
            percent: p.percent || 0,
            bytesProcessed: p.bytes_processed || 0,
            totalBytes: p.total_bytes || 0,
          });
        });
      }

      const res = await invoke('cmd_verify_sfel_container', {
        sourcePath: selectedFile.path,
        password,
        keyfilePath: keyfilePath ? keyfilePath.trim() : null,
      });

      setDryRunResult(res);
      setDryRunStatus('success');
    } catch (err) {
      setDryRunError(typeof err === 'string' ? err : err?.message || String(err));
      setDryRunStatus('error');
    } finally {
      if (unlisten) unlisten();
    }
  };

  const normalizedMainHash = (report?.sha256 || '').trim().toLowerCase();
  const normalizedCompareHash = compareHash.trim().toLowerCase();
  const hasComparison = normalizedMainHash.length > 0 && normalizedCompareHash.length > 0;
  const isHashMatch = hasComparison && normalizedMainHash === normalizedCompareHash;

  return (
    <div className="verify-page">
      <div className="page-intro">
        <h2 className="page-heading">{t('verify.pageTitle')}</h2>
        <p className="page-subheading">{t('verify.pageSubtitle')}</p>
      </div>

      {/* Step 1: Select File */}
      <section className="form-section" aria-labelledby="verify-step-1">
        <div className="step-header">
          <span className="step-number">1</span>
          <div>
            <h3 id="verify-step-1" className="step-title">{t('verify.step1Title')}</h3>
            <p className="step-description">{t('verify.step1Desc')}</p>
          </div>
        </div>

        <FileDropZone
          mode="any"
          selectedFile={selectedFile}
          onFileSelect={(file) => {
            setSelectedFile(file);
            setCompareHash('');
            setComparedFileName('');
          }}
          onClear={() => {
            setSelectedFile(null);
            setReport(null);
            setCompareHash('');
            setComparedFileName('');
            setPassword('');
          }}
          disabled={inspecting || dryRunStatus === 'running'}
        />
      </section>

      {inspecting && (
        <div className="verify-loading-card" role="status">
          <span className="op-spinner" />
          <span>{t('verify.computingHash')}</span>
        </div>
      )}

      {inspectError && (
        <StatusMessage
          type="error"
          title={t('common.error')}
          message={inspectError}
          onDismiss={() => setInspectError(null)}
        />
      )}

      {/* Step 2: Integrity Report & Comparison */}
      {report && (
        <section className="form-section" aria-labelledby="verify-report-heading">
          <div className="step-header">
            <span className="step-number">2</span>
            <div>
              <h3 id="verify-report-heading" className="step-title">{t('verify.reportHeading')}</h3>
              <p className="step-description">
                <strong>{report.fileName}</strong> — {formatBytes(report.fileSize)} ({report.fileSize.toLocaleString()} {t('common.bytes')})
              </p>
            </div>
          </div>

          <div className="verify-hash-box">
            <div className="verify-hash-header">
              <span className="verify-hash-label">{t('verify.sha256Label')}</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleCopyHash(report.sha256, setCopiedMainHash)}
              >
                {copiedMainHash ? t('common.copied') : t('common.copy')}
              </button>
            </div>
            <code className="verify-hash-code">{report.sha256}</code>
          </div>

          {/* Compare with Hash or Second File */}
          <div className="verify-compare-card">
            <div className="verify-compare-top">
              <div>
                <h4 className="verify-compare-title">{t('verify.compareHeading')}</h4>
                <p className="verify-compare-desc">{t('verify.compareDesc')}</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleCompareWithFile}
                disabled={comparingFile}
              >
                {comparingFile ? t('common.loading') : t('verify.compareFileBtn')}
              </button>
            </div>

            {comparedFileName && (
              <div className="verify-compared-file-pill">
                <span>{t('verify.comparedFileLabel')}</span>
                <strong>{comparedFileName}</strong>
              </div>
            )}

            <input
              type="text"
              className={`verify-compare-input ${
                hasComparison ? (isHashMatch ? 'match' : 'mismatch') : ''
              }`}
              placeholder={t('verify.comparePlaceholder')}
              value={compareHash}
              onChange={(e) => {
                setCompareHash(e.target.value);
                if (comparedFileName) setComparedFileName('');
              }}
              spellCheck={false}
            />

            {hasComparison && (
              <div className={`verify-compare-badge ${isHashMatch ? 'match' : 'mismatch'}`} role="status">
                {isHashMatch ? t('verify.matchBadge') : t('verify.mismatchBadge')}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Step 3: .sfel Container Inspection & Dry-Run Audit (only when file is .sfel) */}
      {report?.sfelInfo && (
        <section className="form-section" aria-labelledby="verify-sfel-heading">
          <div className="step-header">
            <span className="step-number">3</span>
            <div className="verify-sfel-title-row">
              <div>
                <h3 id="verify-sfel-heading" className="step-title">{t('verify.sfelHeaderHeading')}</h3>
              </div>
              <span
                className={`verify-sfel-status-pill ${
                  report.sfelInfo.headerValid && report.sfelInfo.sizeConsistent ? 'valid' : 'invalid'
                }`}
              >
                {report.sfelInfo.headerValid && report.sfelInfo.sizeConsistent
                  ? t('verify.sfelValidBadge')
                  : t('verify.sfelInvalidBadge')}
              </span>
            </div>
          </div>

          {report.sfelInfo.validationError && (
            <StatusMessage
              type="error"
              title={t('verify.sfelInvalidBadge')}
              message={report.sfelInfo.validationError}
            />
          )}

          {report.sfelInfo.headerValid && (
            <>
              <div className="verify-meta-grid">
                <div className="verify-meta-item">
                  <span className="verify-meta-label">{t('verify.metaCipher')}</span>
                  <span className="verify-meta-value highlight">{report.sfelInfo.cipher}</span>
                </div>
                <div className="verify-meta-item">
                  <span className="verify-meta-label">{t('verify.metaMode')}</span>
                  <span className="verify-meta-value">{report.sfelInfo.mode}</span>
                </div>
                <div className="verify-meta-item">
                  <span className="verify-meta-label">{t('verify.metaChunks')}</span>
                  <span className="verify-meta-value">{report.sfelInfo.totalChunks.toLocaleString()}</span>
                </div>
                <div className="verify-meta-item">
                  <span className="verify-meta-label">{t('verify.metaArgonProfile')}</span>
                  <span className="verify-meta-value">{report.sfelInfo.argon2ProfileLabel}</span>
                </div>
                <div className="verify-meta-item">
                  <span className="verify-meta-label">{t('verify.metaOriginalName')}</span>
                  <span className="verify-meta-value">
                    {report.sfelInfo.originalName || '—'}
                    {report.sfelInfo.isFolderArchive && (
                      <span className="verify-folder-tag">{t('verify.folderArchiveTag')}</span>
                    )}
                  </span>
                </div>
                <div className="verify-meta-item">
                  <span className="verify-meta-label">{t('verify.metaOriginalSize')}</span>
                  <span className="verify-meta-value">
                    {formatBytes(report.sfelInfo.originalFileSize)} ({report.sfelInfo.originalFileSize.toLocaleString()} B)
                  </span>
                </div>
                <div className="verify-meta-item full-width">
                  <span className="verify-meta-label">{t('verify.metaSalt')}</span>
                  <code className="verify-meta-mono">{report.sfelInfo.saltHex}</code>
                </div>
                <div className="verify-meta-item full-width">
                  <span className="verify-meta-label">{t('verify.metaNonce')}</span>
                  <code className="verify-meta-mono">{report.sfelInfo.nonceHex}</code>
                </div>
              </div>

              {/* Dry-Run Cryptographic Verification Form */}
              <div className="verify-dryrun-box">
                <h4 className="verify-dryrun-title">{t('verify.dryRunHeading')}</h4>
                <p className="verify-dryrun-desc">{t('verify.dryRunDesc')}</p>

                <form onSubmit={handleRunDryVerify} className="verify-dryrun-form">
                  <div className="verify-password-field">
                    <label htmlFor="verify-dryrun-password" className="verify-field-label">
                      {t('verify.dryRunPasswordLabel')}
                    </label>
                    <input
                      id="verify-dryrun-password"
                      type="password"
                      className="destination-input"
                      placeholder={t('verify.dryRunPasswordPlaceholder')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={dryRunStatus === 'running'}
                    />
                  </div>

                  <KeyfileSelector
                    keyfilePath={keyfilePath}
                    onKeyfileChange={setKeyfilePath}
                    disabled={dryRunStatus === 'running'}
                    allowGenerate={false}
                  />

                  <div className="verify-dryrun-actions">
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={!password || dryRunStatus === 'running'}
                    >
                      {dryRunStatus === 'running' ? t('verify.dryRunRunning') : t('verify.dryRunBtn')}
                    </button>
                  </div>
                </form>

                {dryRunStatus === 'running' && (
                  <div style={{ marginTop: '1rem' }}>
                    <ProgressBar
                      percent={dryRunProgress.percent}
                      bytesProcessed={dryRunProgress.bytesProcessed}
                      totalBytes={dryRunProgress.totalBytes}
                      status="running"
                      label={t('verify.dryRunRunning')}
                    />
                  </div>
                )}

                {dryRunError && (
                  <div style={{ marginTop: '1rem' }}>
                    <StatusMessage
                      type="error"
                      title={t('common.failed')}
                      message={dryRunError}
                      onDismiss={() => setDryRunError(null)}
                    />
                  </div>
                )}

                {dryRunResult && dryRunStatus === 'success' && (
                  <div className="verify-dryrun-success" role="status">
                    <div className="verify-dryrun-success-header">
                      <span className="verify-check-icon">✓</span>
                      <div>
                        <h5>{t('verify.dryRunSuccessTitle')}</h5>
                        <p>{t('verify.dryRunSuccessDesc')}</p>
                      </div>
                    </div>

                    <div className="verify-dryrun-stats">
                      <span>
                        <strong>{t('verify.dryRunChunksVerified')}</strong> {dryRunResult.chunksVerified} ({dryRunResult.cipher})
                      </span>
                    </div>

                    <div className="verify-hash-box" style={{ marginTop: '0.75rem' }}>
                      <div className="verify-hash-header">
                        <span className="verify-hash-label">{t('verify.dryRunPlaintextSha')}</span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleCopyHash(dryRunResult.plaintextSha256, setCopiedPlaintextHash)}
                        >
                          {copiedPlaintextHash ? t('common.copied') : t('common.copy')}
                        </button>
                      </div>
                      <code className="verify-hash-code">{dryRunResult.plaintextSha256}</code>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

export default Verify;
