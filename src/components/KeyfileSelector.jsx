import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { useI18n } from '../hooks/useI18n';
import { getFilenameFromPath } from '../utils/formatters';
import './KeyfileSelector.css';

function isTauriEnvironment() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

export function KeyfileSelector({
  keyfilePath = '',
  onChange,
  allowGenerate = true,
  disabled = false,
}) {
  const { t } = useI18n();
  const [isGenerating, setIsGenerating] = useState(false);
  const [genFeedback, setGenFeedback] = useState(null);

  const handleBrowseKeyfile = async () => {
    if (disabled) return;
    if (isTauriEnvironment()) {
      try {
        const selected = await open({
          multiple: false,
          directory: false,
        });
        if (selected && typeof selected === 'string') {
          onChange(selected);
          setGenFeedback(null);
        }
        return;
      } catch (err) {
        console.warn('Tauri keyfile open dialog failed', err);
      }
    }

    const manual = window.prompt(t('keyfile.promptPath'), keyfilePath || '');
    if (manual && manual.trim()) {
      onChange(manual.trim());
      setGenFeedback(null);
    }
  };

  const handleGenerateKeyfile = async () => {
    if (disabled || isGenerating) return;
    let targetPath = '';

    if (isTauriEnvironment()) {
      try {
        const chosen = await save({
          defaultPath: 'master.sfel.key',
          filters: [
            {
              name: 'SFEL Cryptographic Keyfile',
              extensions: ['key', 'bin'],
            },
          ],
        });
        if (chosen && typeof chosen === 'string') {
          targetPath = chosen;
        }
      } catch (err) {
        console.warn('Tauri save keyfile dialog failed', err);
      }
    } else {
      const manual = window.prompt(t('keyfile.savePrompt'), 'master.sfel.key');
      if (manual && manual.trim()) {
        targetPath = manual.trim();
      }
    }

    if (!targetPath) return;

    setIsGenerating(true);
    setGenFeedback(null);

    try {
      if (isTauriEnvironment()) {
        const report = await invoke('cmd_generate_keyfile', {
          destPath: targetPath,
          dest_path: targetPath,
        });
        const finalPath = report?.path || targetPath;
        onChange(finalPath);
        setGenFeedback({
          type: 'success',
          message: t('keyfile.generatedSuccess', {
            name: getFilenameFromPath(finalPath),
          }),
        });
      } else {
        onChange(targetPath);
        setGenFeedback({
          type: 'success',
          message: t('keyfile.generatedSuccess', {
            name: getFilenameFromPath(targetPath),
          }),
        });
      }
    } catch (err) {
      const msg = typeof err === 'string' ? err : err?.message || 'Failed to generate keyfile';
      setGenFeedback({ type: 'error', message: msg });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClear = () => {
    if (disabled) return;
    onChange('');
    setGenFeedback(null);
  };

  return (
    <div className="keyfile-selector-card">
      <div className="keyfile-header-row">
        <div className="keyfile-title-group">
          <span className="keyfile-icon" aria-hidden="true">🗝️</span>
          <span className="keyfile-title">{t('keyfile.title')}</span>
          <span className="keyfile-optional-pill">{t('keyfile.optionalBadge')}</span>
        </div>

        <div className="keyfile-actions">
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={handleBrowseKeyfile}
            disabled={disabled}
          >
            📂 {t('keyfile.selectBtn')}
          </button>

          {allowGenerate && (
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={handleGenerateKeyfile}
              disabled={disabled || isGenerating}
              title={t('keyfile.generateHint')}
            >
              ✨ {isGenerating ? t('common.loading') : t('keyfile.generateBtn')}
            </button>
          )}
        </div>
      </div>

      <p className="keyfile-desc">{t('keyfile.description')}</p>

      {keyfilePath ? (
        <div className="keyfile-selected-pill">
          <span className="keyfile-selected-name" title={keyfilePath}>
            🔑 {getFilenameFromPath(keyfilePath)}
          </span>
          <span className="keyfile-selected-path" title={keyfilePath}>
            {keyfilePath}
          </span>
          <button
            type="button"
            className="keyfile-remove-btn"
            onClick={handleClear}
            disabled={disabled}
            title={t('common.clear')}
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="keyfile-empty-note">{t('keyfile.noneSelected')}</div>
      )}

      {genFeedback && (
        <div className={`keyfile-feedback ${genFeedback.type}`}>
          {genFeedback.type === 'success' ? '✓ ' : '⚠ '}
          {genFeedback.message}
        </div>
      )}
    </div>
  );
}

export default KeyfileSelector;
