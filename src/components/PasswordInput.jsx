import React, { useState, useId } from 'react';
import { validatePassword } from '../utils/validators';
import { useI18n } from '../hooks/useI18n';
import './PasswordInput.css';

export function PasswordInput({
  password,
  onChange,
  confirmPassword = '',
  onConfirmChange = null,
  withConfirmation = false,
  disabled = false,
  id = null,
  label = null,
  placeholder = null,
  required = true,
}) {
  const { t } = useI18n();
  const generatedId = useId();
  const inputId = id || generatedId;
  const confirmId = `${inputId}-confirm`;

  const displayLabel = label || t('password.label');
  const displayPlaceholder = placeholder || t('password.placeholder');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const evaluation = validatePassword(password);
  const passwordsMatch = !withConfirmation || (password.length > 0 && password === confirmPassword);
  const showMismatch = withConfirmation && confirmPassword.length > 0 && password !== confirmPassword;

  const strengthKeys = ['veryWeak', 'weak', 'fair', 'strong', 'veryStrong'];
  const strengthText = t(`password.${strengthKeys[evaluation.score] || 'weak'}`);

  const getCrackTimeText = () => {
    const b = evaluation.entropyBits;
    if (b < 28) return t('password.instant');
    if (b < 36) return t('password.seconds');
    if (b < 45) return t('password.hours');
    if (b < 55) return t('password.months');
    if (b < 65) return t('password.decades');
    if (b < 80) return t('password.millions');
    return t('password.centuries');
  };

  const getStrengthClass = (score) => {
    switch (score) {
      case 0:
      case 1:
        return 'strength-weak';
      case 2:
        return 'strength-fair';
      case 3:
        return 'strength-good';
      case 4:
        return 'strength-strong';
      default:
        return '';
    }
  };

  return (
    <div className="password-group-container">
      {/* Primary Password Input */}
      <div className="form-field">
        <div className="label-row">
          <label htmlFor={inputId} className="input-label">
            {displayLabel}
            {required && <span className="required-star" aria-hidden="true">*</span>}
          </label>
          {password.length > 0 && (
            <span className={`strength-badge ${getStrengthClass(evaluation.score)}`}>
              {strengthText}
            </span>
          )}
        </div>

        <div className="input-with-button">
          <input
            id={inputId}
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={displayPlaceholder}
            autoComplete="new-password"
            className="text-input"
            required={required}
            aria-describedby={`${inputId}-help`}
          />
          <button
            type="button"
            className="visibility-toggle-btn"
            onClick={() => setShowPassword(!showPassword)}
            disabled={disabled}
            aria-label={showPassword ? t('password.hide') : t('password.show')}
            title={showPassword ? t('password.hide') : t('password.show')}
          >
            {showPassword ? (
              <svg
                className="eye-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg
                className="eye-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>

        {/* Strength Meter Bar */}
        {password.length > 0 && (
          <>
            <div className="strength-meter-bar" aria-hidden="true">
              <div
                className={`strength-fill ${getStrengthClass(evaluation.score)}`}
                style={{ width: `${Math.max(15, (evaluation.score / 4) * 100)}%` }}
              />
            </div>
            <div className="entropy-stats-row">
              <span className="entropy-stat-tag">
                🔒 ~<strong>{evaluation.entropyBits} {t('password.entropyBits')}</strong>
              </span>
              <span className="entropy-stat-tag crack-time">
                ⏱️ {t('password.bruteForceTime')} : <strong>{getCrackTimeText()}</strong>
              </span>
            </div>
          </>
        )}

        <div id={`${inputId}-help`} className="field-hint">
          {password.length === 0 ? (
            <span>{t('password.placeholder')}</span>
          ) : (
            <span>{evaluation.feedback.join(' • ')}</span>
          )}
        </div>
      </div>

      {/* Confirmation Password Input (Optional) */}
      {withConfirmation && onConfirmChange && (
        <div className="form-field confirm-field">
          <div className="label-row">
            <label htmlFor={confirmId} className="input-label">
              {t('password.confirmLabel')}
              {required && <span className="required-star" aria-hidden="true">*</span>}
            </label>
            {confirmPassword.length > 0 && (
              <span
                className={`match-indicator ${passwordsMatch ? 'match-ok' : 'match-error'}`}
              >
                {passwordsMatch ? t('password.match') : t('password.mismatch')}
              </span>
            )}
          </div>

          <div className="input-with-button">
            <input
              id={confirmId}
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => onConfirmChange(e.target.value)}
              disabled={disabled}
              placeholder={t('password.confirmPlaceholder')}
              autoComplete="new-password"
              className={`text-input ${showMismatch ? 'input-error' : ''}`}
              required={required}
              aria-invalid={showMismatch}
              aria-describedby={showMismatch ? `${confirmId}-error` : undefined}
            />
            <button
              type="button"
              className="visibility-toggle-btn"
              onClick={() => setShowConfirm(!showConfirm)}
              disabled={disabled}
              aria-label={showConfirm ? t('password.hide') : t('password.show')}
              title={showConfirm ? t('password.hide') : t('password.show')}
            >
              {showConfirm ? (
                <svg
                  className="eye-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg
                  className="eye-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          {showMismatch && (
            <p id={`${confirmId}-error`} className="error-text" role="alert">
              {t('password.mismatch')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default PasswordInput;
