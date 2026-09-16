import React, { useState, useCallback } from 'react';
import { useAuth } from '../../services/authContext';
import { useLanguage } from '../../i18n/LanguageContext';
import './LoginModal.css';

export interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
  const { login } = useAuth();
  const { t } = useLanguage();

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubmitting) return;

      if (!username.trim()) {
        setError(t('authUsernameRequired' as any) || 'Username is required');
        return;
      }
      if (!password) {
        setError(t('authPasswordRequired' as any) || 'Password is required');
        return;
      }

      setIsSubmitting(true);
      setError(null);

      try {
        const res = await login(username.trim(), password);
        if (res.success) {
          onClose();
          if (onSuccess) onSuccess();
        } else {
          setError(res.error || t('authInvalidCredentials' as any) || 'Invalid username or password');
        }
      } catch (err: any) {
        setError(err?.message || t('authServerUnreachable' as any) || 'Authentication error');
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, username, password, login, onClose, onSuccess, t]
  );

  const handleQuickAdmin = useCallback(() => {
    if (isSubmitting) return;
    setUsername('admin');
    setPassword('admin');
    setError(null);
  }, [isSubmitting]);

  const handleOverlayClose = useCallback(() => {
    if (!isSubmitting) {
      onClose();
    }
  }, [isSubmitting, onClose]);

  if (!isOpen) return null;

  return (
    <div className="login-modal-overlay" onClick={handleOverlayClose} role="dialog" aria-modal="true" id="modal-login">
      <div className="login-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="login-modal-header">
          <div className="login-header-title-wrap">
            <span className="login-header-icon" aria-hidden="true">🔐</span>
            <div>
              <h2>{t('authLoginTitle' as any) || 'Sign In'}</h2>
              <p>{t('authLoginSubtitle' as any) || 'Access administrative & editing features'}</p>
            </div>
          </div>
          <button
            type="button"
            className="login-modal-close"
            onClick={handleOverlayClose}
            aria-label="Close"
            disabled={isSubmitting}
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="login-modal-body">
            {error && (
              <div className="login-error-alert" role="alert">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <div className="login-form-group">
              <label htmlFor="login-username">{t('authUsernameLabel' as any) || 'Username'}</label>
              <div className="login-input-wrap">
                <input
                  id="login-username"
                  type="text"
                  className="login-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  autoFocus
                  autoComplete="username"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="login-form-group">
              <label htmlFor="login-password">{t('authPasswordLabel' as any) || 'Password'}</label>
              <div className="login-input-wrap">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="login-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  aria-busy={isSubmitting}
                />
                <button
                  type="button"
                  className="login-pwd-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  disabled={isSubmitting}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {isSubmitting && (
              <div className="login-verifying-notice" role="status" aria-live="polite">
                <span className="login-spinner" aria-hidden="true" />
                <span>{t('authVerifyingPassword' as any) || 'Verifying credentials...'}</span>
              </div>
            )}
          </div>

          <div className="login-modal-footer">
            <button
              type="submit"
              className="btn-login-submit"
              disabled={isSubmitting}
              id="btn-submit-login"
            >
              {isSubmitting ? (
                <span className="btn-login-content-submitting">
                  <span className="login-spinner-sm" aria-hidden="true" />
                  {t('authSigningIn' as any) || 'Signing in...'}
                </span>
              ) : (
                t('authSignInButton' as any) || 'Sign In'
              )}
            </button>

            <button
              type="button"
              className="btn-quick-admin"
              onClick={handleQuickAdmin}
              disabled={isSubmitting}
              title="Auto-fill default administrator credentials"
            >
              🔑 {t('authQuickAdminDemo' as any) || 'Fill Default Admin (admin / admin)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
