import React, { useState, useId } from 'react';
import { validatePassword } from '../utils/validators';
import './PasswordInput.css';

export function PasswordInput({
  password,
  onChange,
  confirmPassword = '',
  onConfirmChange = null,
  withConfirmation = false,
  disabled = false,
  id = null,
  label = 'Password',
  placeholder = 'Enter encryption password',
  required = true,
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const confirmId = `${inputId}-confirm`;

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const evaluation = validatePassword(password);
  const passwordsMatch = !withConfirmation || (password.length > 0 && password === confirmPassword);
  const showMismatch = withConfirmation && confirmPassword.length > 0 && password !== confirmPassword;

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
            {label}
            {required && <span className="required-star" aria-hidden="true">*</span>}
          </label>
          {password.length > 0 && (
            <span className={`strength-badge ${getStrengthClass(evaluation.score)}`}>
              {evaluation.label}
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
            placeholder={placeholder}
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
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            title={showPassword ? 'Hide password' : 'Show password'}
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
                🔒 ~<strong>{evaluation.entropyBits} bits</strong> d'entropie
              </span>
              <span className="entropy-stat-tag crack-time">
                ⏱️ Brute-force : <strong>{evaluation.crackTime}</strong>
              </span>
            </div>
          </>
        )}

        <div id={`${inputId}-help`} className="field-hint">
          {password.length === 0 ? (
            <span>Use a strong password. It will be derived via Argon2id (64 MiB, 3 passes).</span>
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
              Confirm Password
              {required && <span className="required-star" aria-hidden="true">*</span>}
            </label>
            {confirmPassword.length > 0 && (
              <span
                className={`match-indicator ${passwordsMatch ? 'match-ok' : 'match-error'}`}
              >
                {passwordsMatch ? 'Passwords match' : 'Do not match'}
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
              placeholder="Re-enter password to confirm"
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
              aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
              title={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
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
              Passwords do not match. Please verify your password.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default PasswordInput;
