import React from 'react';
import { formatBytes, formatTime } from '../utils/formatters';
import { useI18n } from '../hooks/useI18n';
import './ProgressBar.css';

export function ProgressBar({
  percentage = 0,
  bytesProcessed = 0,
  totalBytes = 0,
  stageDescription = null,
  elapsedSeconds = 0,
  onCancel = null,
  isCancelling = false,
  label = null,
}) {
  const { t } = useI18n();
  const safePercent = Math.min(100, Math.max(0, Math.round(percentage)));
  const displayStage = stageDescription || t('common.loading');
  const displayLabel = label || t('progress.title') || 'Progress';

  return (
    <div className="progress-container" aria-label={displayLabel}>
      <div className="progress-header">
        <div className="progress-stage-info">
          <div className="stage-pulse-dot" aria-hidden="true" />
          <span className="stage-title">{displayStage}</span>
        </div>
        <span className="progress-percent" aria-live="polite">
          {safePercent}%
        </span>
      </div>

      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={safePercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${safePercent}% - ${displayStage}`}
      >
        <div
          className="progress-bar-fill"
          style={{ width: `${safePercent}%` }}
        />
      </div>

      <div className="progress-footer">
        <div className="progress-metrics">
          {totalBytes > 0 && (
            <span className="metric-item">
              <span className="metric-label">{t('common.fileSize') || 'Data'}:</span>
              <span className="metric-value">
                {formatBytes(bytesProcessed)} / {formatBytes(totalBytes)}
              </span>
            </span>
          )}

          <span className="metric-item">
            <span className="metric-label">{t('common.duration') || 'Time'}:</span>
            <span className="metric-value">{formatTime(elapsedSeconds)}</span>
          </span>
        </div>

        {onCancel && (
          <button
            type="button"
            className="btn btn-outline cancel-btn"
            onClick={onCancel}
            disabled={isCancelling}
          >
            {isCancelling ? t('common.cancelling') : t('common.cancel')}
          </button>
        )}
      </div>
    </div>
  );
}

export default ProgressBar;
