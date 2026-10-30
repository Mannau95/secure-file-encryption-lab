import React, { useState, useRef } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { formatBytes, getFilenameFromPath, getFileExtension } from '../utils/formatters';
import './FileDropZone.css';

function isTauriEnvironment() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

export function FileDropZone({
  onFileSelect,
  selectedFile = null,
  onClear = null,
  accept = null, // e.g., ['.sfel'] or ['sfel']
  label = 'Drop file here or click to browse',
  description = 'Supports files of any size with low-memory chunked streaming',
  disabled = false,
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

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

  const processFile = (fileObj) => {
    if (!fileObj) return;

    if (accept && accept.length > 0) {
      const ext = getFileExtension(fileObj.name || fileObj.path);
      const cleanAccept = accept.map((a) => a.replace(/^\./, '').toLowerCase());
      if (!cleanAccept.includes(ext.toLowerCase())) {
        alert(`Please select a valid file ending with: ${accept.join(', ')}`);
        return;
      }
    }

    onFileSelect(fileObj);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      // HTML5 file object may have path property in electron/tauri
      const filePath = file.path || file.name;
      processFile({
        path: filePath,
        name: file.name,
        size: file.size,
      });
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
          multiple: false,
          directory: false,
          filters: filters.length > 0 ? filters : undefined,
        });

        if (selected && typeof selected === 'string') {
          processFile({
            path: selected,
            name: getFilenameFromPath(selected),
            size: 0, // In desktop app, size will be read by backend or stat
          });
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

  const handleInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile({
        path: file.name, // In web fallback, path is name
        name: file.name,
        size: file.size,
      });
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
            <p className="drop-title">{label}</p>
            <p className="drop-desc">{description}</p>
          </div>
          <button
            type="button"
            className="btn btn-secondary browse-btn"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              handleBrowse();
            }}
          >
            Browse Files
          </button>
        </div>
      ) : (
        <div className="selected-file-card">
          <div className="file-icon-wrapper" aria-hidden="true">
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
          </div>

          <div className="file-details">
            <span className="file-name" title={selectedFile.name || selectedFile.path}>
              {selectedFile.name || getFilenameFromPath(selectedFile.path)}
            </span>
            <div className="file-meta">
              {selectedFile.size > 0 && (
                <span className="file-size">{formatBytes(selectedFile.size)}</span>
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
              aria-label="Remove selected file"
              title="Remove file"
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
