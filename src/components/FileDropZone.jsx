import React, { useState, useRef } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { formatBytes, getFilenameFromPath, getFileExtension } from '../utils/formatters';
import { useI18n } from '../hooks/useI18n';
import './FileDropZone.css';

function isTauriEnvironment() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

export function FileDropZone({
  onFileSelect,
  onFilesSelect = null,
  selectedFile = null,
  onClear = null,
  accept = null, // e.g., ['.sfel'] or ['sfel']
  multiple = false,
  allowDirectory = false,
  label = null,
  description = null,
  disabled = false,
}) {
  const { t } = useI18n();
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const displayLabel = label || t('dropzone.dragPrompt');
  const displayDescription = description || (accept ? `${t('dropzone.selected')} (${accept.join(', ')})` : 'AES-256-GCM / Argon2id streaming');

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const processFiles = (fileList) => {
    if (!fileList || fileList.length === 0) return;

    const validFiles = [];
    for (const fileObj of fileList) {
      if (accept && accept.length > 0) {
        const ext = getFileExtension(fileObj.name || fileObj.path);
        const cleanAccept = accept.map((a) => a.replace(/^\./, '').toLowerCase());
        if (!cleanAccept.includes(ext.toLowerCase())) continue;
      }
      validFiles.push(fileObj);
    }

    if (validFiles.length === 0 && fileList.length > 0) {
      alert(`Please select valid files ending with: ${accept.join(', ')}`);
      return;
    }

    if (multiple && onFilesSelect) {
      onFilesSelect(validFiles);
    } else if (onFileSelect && validFiles.length > 0) {
      onFileSelect(validFiles[0]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled) return;

    const files = Array.from(e.dataTransfer.files || []);
    if (files && files.length > 0) {
      const mapped = files.map((file) => ({
        path: file.path || file.name,
        name: file.name,
        size: file.size || 0,
      }));
      processFiles(mapped);
    }
  };

  const handleBrowse = async () => {
    if (disabled) return;

    if (isTauriEnvironment()) {
      try {
        let filters = [];
        if (accept && accept.length > 0) {
          filters.push({
            name: 'Allowed Files',
            extensions: accept.map((ext) => ext.replace(/^\./, '')),
          });
        }

        const selected = await open({
          multiple: Boolean(multiple),
          directory: false,
          filters: filters.length > 0 ? filters : undefined,
        });

        if (selected) {
          if (Array.isArray(selected)) {
            const mapped = selected.map((filePath) => ({
              path: filePath,
              name: getFilenameFromPath(filePath),
              size: 0,
            }));
            processFiles(mapped);
          } else if (typeof selected === 'string') {
            processFiles([
              {
                path: selected,
                name: getFilenameFromPath(selected),
                size: 0,
              },
            ]);
          }
        }
        return;
      } catch (err) {
        console.warn('Tauri open dialog failed, falling back to file input', err);
      }
    }

    // Fallback to standard input
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleBrowseFolder = async (e) => {
    e.stopPropagation();
    if (disabled) return;

    if (isTauriEnvironment()) {
      try {
        const selected = await open({
          multiple: false,
          directory: true,
        });

        if (selected && typeof selected === 'string') {
          const folderObj = {
            path: selected,
            name: getFilenameFromPath(selected),
            size: 0,
            isDirectory: true,
          };
          if (onFileSelect) {
            onFileSelect(folderObj);
          } else if (multiple && onFilesSelect) {
            onFilesSelect([folderObj]);
          }
        }
        return;
      } catch (err) {
        console.warn('Tauri folder dialog failed', err);
      }
    }

    const manualFolder = window.prompt(t('dropzone.folderPrompt'));
    if (manualFolder && manualFolder.trim()) {
      const clean = manualFolder.trim();
      const folderObj = {
        path: clean,
        name: getFilenameFromPath(clean),
        size: 0,
        isDirectory: true,
      };
      if (onFileSelect) {
        onFileSelect(folderObj);
      } else if (multiple && onFilesSelect) {
        onFilesSelect([folderObj]);
      }
    }
  };

  const handleInputChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const mapped = files.map((file) => ({
        path: file.name,
        name: file.name,
        size: file.size,
      }));
      processFiles(mapped);
    }
  };

  const handleKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleBrowse();
    }
  };

  return (
    <div className="file-drop-zone-container">
      <input
        ref={fileInputRef}
        type="file"
        className="sr-only"
        onChange={handleInputChange}
        disabled={disabled}
        multiple={multiple}
        accept={accept ? accept.join(',') : undefined}
        tabIndex="-1"
      />

      {!selectedFile ? (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={label}
          aria-disabled={disabled}
          className={`drop-zone ${isDragOver ? 'drag-over' : ''} ${disabled ? 'disabled' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleBrowse}
          onKeyDown={handleKeyDown}
        >
          <div className="drop-icon-wrapper" aria-hidden="true">
            <svg
              className="drop-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div className="drop-content">
            <p className="drop-title">{displayLabel}</p>
            <p className="drop-desc">{displayDescription}</p>
          </div>
          <div className="drop-actions-row">
            <button
              type="button"
              className="btn btn-secondary browse-btn"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                handleBrowse();
              }}
            >
              📄 {t('dropzone.browseBtn')}
            </button>

            {allowDirectory && (
              <button
                type="button"
                className="btn btn-secondary browse-btn browse-folder-btn"
                disabled={disabled}
                onClick={handleBrowseFolder}
              >
                📁 {t('dropzone.browseFolderBtn')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="selected-file-card">
          <div className="file-icon-wrapper" aria-hidden="true">
            {selectedFile.isDirectory ? (
              <svg
                className="file-card-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            ) : (
              <svg
                className="file-card-icon"
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
            )}
          </div>

          <div className="file-details">
            <span className="file-name" title={selectedFile.name || selectedFile.path}>
              {selectedFile.name || getFilenameFromPath(selectedFile.path)}
            </span>
            <div className="file-meta">
              {selectedFile.isDirectory ? (
                <span className="file-size folder-badge">📁 {t('dropzone.folderBadge')}</span>
              ) : (
                selectedFile.size > 0 && (
                  <span className="file-size">{formatBytes(selectedFile.size)}</span>
                )
              )}
              <span className="file-path-preview" title={selectedFile.path}>
                {selectedFile.path}
              </span>
            </div>
          </div>

          {onClear && (
            <button
              type="button"
              className="clear-file-btn"
              onClick={onClear}
              disabled={disabled}
              aria-label={t('dropzone.changeFile')}
              title={t('dropzone.changeFile')}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="clear-icon"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default FileDropZone;
