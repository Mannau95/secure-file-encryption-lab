import React, { useState, useEffect } from 'react';
import { useI18n } from '../hooks/useI18n';
import { computeFileSha256, compareSha256 } from '../utils/hash';
import './Sha256Inspector.css';

export function Sha256Inspector({
  filePath = null,
  hash = null,
  label = null,
  expectedHash = null,
  allowVerify = true,
  description = null,
  matchHint = null,
}) {
  const { t } = useI18n();

  const [currentHash, setCurrentHash] = useState(hash);
  const [isComputing, setIsComputing] = useState(false);
  const [verifyInput, setVerifyInput] = useState(expectedHash || '');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (hash) {
      setCurrentHash(hash);
      return;
    }

    if (filePath) {
      let isCancelled = false;
      setIsComputing(true);

      computeFileSha256(filePath)
        .then((computed) => {
          if (!isCancelled && computed) {
            setCurrentHash(computed);
          }
        })
        .finally(() => {
          if (!isCancelled) {
            setIsComputing(false);
          }
        });

      return () => {
        isCancelled = true;
      };
    }
  }, [filePath, hash]);

  const handleCopy = async () => {
    if (!currentHash) return;
    try {
      await navigator.clipboard.writeText(currentHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('Failed to copy hash to clipboard', e);
    }
  };

  const hasVerifyInput = Boolean(verifyInput.trim());
  const isMatch = hasVerifyInput && currentHash && compareSha256(currentHash, verifyInput);

  return (
    <div className="sha256-inspector-card">
      <div className="sha256-header">
        <div className="sha256-title-row">
          <span className="sha256-shield-icon" aria-hidden="true">🛡️</span>
          <span className="sha256-label">{label || t('sha256.inspectorTitle')}</span>
        </div>

        {currentHash && (
          <button
            type="button"
            className="btn btn-secondary btn-xs btn-copy-hash"
            onClick={handleCopy}
            title={t('sha256.copy')}
          >
            {copied ? `✓ ${t('sha256.copied')}` : `📋 ${t('sha256.copy')}`}
          </button>
        )}
      </div>

      {description && <p className="sha256-description">{description}</p>}

      {/* Hash Value Box */}
      <div className="sha256-hash-box">
        {isComputing ? (
          <div className="sha256-computing-state">
            <span className="sha256-spinner" aria-hidden="true" />
            <span>{t('sha256.computing')}</span>
          </div>
        ) : currentHash ? (
          <code className="sha256-code" title={currentHash}>
            {currentHash}
          </code>
        ) : (
          <span className="sha256-placeholder">—</span>
        )}
      </div>

      {/* Verification Tool */}
      {allowVerify && currentHash && (
        <div className="sha256-verify-section">
          <input
            type="text"
            className="text-input verify-input"
            value={verifyInput}
            onChange={(e) => setVerifyInput(e.target.value)}
            placeholder={t('sha256.verifyPlaceholder')}
            spellCheck="false"
          />

          {hasVerifyInput && (
            <div className={`sha256-result-badge ${isMatch ? 'badge-match' : 'badge-mismatch'}`}>
              {isMatch ? t('sha256.matchSuccess') : t('sha256.matchMismatch')}
            </div>
          )}

          {isMatch && matchHint && (
            <p className="sha256-match-hint">{matchHint}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default Sha256Inspector;