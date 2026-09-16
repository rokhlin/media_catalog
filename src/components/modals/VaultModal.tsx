import React, { useState, useCallback, useEffect } from 'react';
import { useVault } from '../../services/vaultContext';
import { useLanguage } from '../../i18n/LanguageContext';
import './VaultModal.css';

export interface VaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUnlocked?: () => void;
}

export default function VaultModal({ isOpen, onClose, onUnlocked }: VaultModalProps) {
  const { vaultStatus, isUnlocked, isConfigured, remainingSeconds, unlockVault, lockVault, setupVault } = useVault();
  const { t } = useLanguage();

  const [pinInput, setPinInput] = useState('');
  const [setupPin, setSetupPin] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');
  const [vaultFolder, setVaultFolder] = useState('vault');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPinInput('');
      setError(null);
    }
  }, [isOpen]);

  const handleKeyPress = useCallback(
    async (digit: string) => {
      setError(null);
      if (pinInput.length >= 8) return;
      const nextPin = pinInput + digit;
      setPinInput(nextPin);

      // Auto-submit if PIN length is 4 or more
      if (nextPin.length === 4 && isConfigured) {
        setIsSubmitting(true);
        try {
          const res = await unlockVault(nextPin);
          if (res.success) {
            onClose();
            if (onUnlocked) onUnlocked();
          } else {
            setError(res.error || t('vaultIncorrectPin' as any) || 'Incorrect PIN');
            setPinInput('');
          }
        } finally {
          setIsSubmitting(false);
        }
      }
    },
    [pinInput, isConfigured, unlockVault, onClose, onUnlocked, t]
  );

  const handleBackspace = useCallback(() => {
    setError(null);
    setPinInput((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setError(null);
    setPinInput('');
  }, []);

  const handleManualUnlock = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!pinInput || isSubmitting) return;
      setIsSubmitting(true);
      setError(null);
      try {
        const res = await unlockVault(pinInput);
        if (res.success) {
          onClose();
          if (onUnlocked) onUnlocked();
        } else {
          setError(res.error || t('vaultIncorrectPin' as any) || 'Incorrect PIN');
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [pinInput, isSubmitting, unlockVault, onClose, onUnlocked, t]
  );

  const handleSetupSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubmitting) return;
      if (!setupPin || setupPin.length < 4) {
        setError(t('vaultPinMinLength' as any) || 'PIN must be at least 4 digits');
        return;
      }
      if (setupPin !== setupConfirm) {
        setError(t('vaultPinMismatch' as any) || 'PIN confirmation does not match');
        return;
      }

      setIsSubmitting(true);
      setError(null);
      try {
        const res = await setupVault(setupPin, vaultFolder);
        if (res.success) {
          // Automatically unlock with newly created PIN
          await unlockVault(setupPin);
          onClose();
          if (onUnlocked) onUnlocked();
        } else {
          setError(res.error || 'Failed to setup vault');
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [setupPin, setupConfirm, vaultFolder, isSubmitting, setupVault, unlockVault, onClose, onUnlocked, t]
  );

  if (!isOpen) return null;

  const formatRemaining = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="vault-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" id="modal-vault">
      <div className="vault-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="vault-modal-header">
          <div className="vault-header-title-wrap">
            <span className="vault-header-icon" aria-hidden="true">
              {isUnlocked ? '🔓' : '🔒'}
            </span>
            <div>
              <h2>{t('vaultTitle' as any) || 'Secret Vault Locker'}</h2>
              <p>
                {isUnlocked
                  ? t('vaultUnlockedSubtitle' as any) || 'Vault is currently unlocked'
                  : isConfigured
                  ? t('vaultLockedSubtitle' as any) || 'Enter PIN or Master Passphrase to view hidden media'
                  : t('vaultSetupSubtitle' as any) || 'Initialize master PIN protection for private media'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="vault-modal-close"
            onClick={onClose}
            aria-label="Close"
            disabled={isSubmitting}
          >
            &times;
          </button>
        </div>

        <div className="vault-modal-body">
          {error && (
            <div className="login-error-alert" role="alert">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {isUnlocked ? (
            <div className="vault-unlocked-banner">
              <div>
                <strong>{t('vaultSessionActive' as any) || 'Vault Session Active'}</strong>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', opacity: 0.9 }}>
                  {t('vaultAutoLockNotice' as any) || 'Private media items are currently visible and accessible.'}
                </p>
              </div>
              <div>
                <span style={{ fontSize: '0.85rem' }}>{t('vaultAutoLockIn' as any) || 'Auto-locks in'}: </span>
                <span className="vault-countdown-badge">{formatRemaining(remainingSeconds)}</span>
              </div>
              <div style={{ fontSize: '0.82rem', color: '#9aa0a6', marginTop: '0.5rem' }}>
                {vaultStatus?.itemsCount || 0} {t('vaultProtectedFilesCount' as any) || 'protected file(s) in vault'}
              </div>
            </div>
          ) : !isConfigured ? (
            <form onSubmit={handleSetupSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="login-form-group">
                <label>{t('vaultNewPinLabel' as any) || 'Create Master PIN (min 4 digits)'}</label>
                <input
                  type="password"
                  className="login-input"
                  value={setupPin}
                  onChange={(e) => setSetupPin(e.target.value)}
                  placeholder="1234"
                  maxLength={16}
                  autoFocus
                  disabled={isSubmitting}
                />
              </div>

              <div className="login-form-group">
                <label>{t('vaultConfirmPinLabel' as any) || 'Confirm PIN'}</label>
                <input
                  type="password"
                  className="login-input"
                  value={setupConfirm}
                  onChange={(e) => setSetupConfirm(e.target.value)}
                  placeholder="1234"
                  maxLength={16}
                  disabled={isSubmitting}
                />
              </div>

              <div className="login-form-group">
                <label>{t('vaultFolderLabel' as any) || 'Designated Vault Folder Name'}</label>
                <input
                  type="text"
                  className="login-input"
                  value={vaultFolder}
                  onChange={(e) => setVaultFolder(e.target.value)}
                  placeholder="vault"
                  disabled={isSubmitting}
                />
                <span style={{ fontSize: '0.78rem', color: '#9aa0a6' }}>
                  {t('vaultFolderHelp' as any) || 'Files inside folders named "vault" will be automatically excluded from searches.'}
                </span>
              </div>

              <button
                type="submit"
                className="btn-login-submit"
                disabled={isSubmitting}
                style={{ marginTop: '0.5rem' }}
              >
                {isSubmitting
                  ? t('vaultSettingUp' as any) || 'Setting up...'
                  : t('vaultSetupButton' as any) || 'Create & Protect Vault'}
              </button>
            </form>
          ) : (
            <div>
              {/* PIN Indicator Dots */}
              <div className="vault-pin-display" aria-label={`Entered ${pinInput.length} digits`}>
                {[0, 1, 2, 3].map((idx) => (
                  <span
                    key={idx}
                    className={`vault-pin-dot ${idx < pinInput.length ? 'filled' : ''}`}
                  />
                ))}
              </div>

              {/* Interactive Keypad */}
              <div className="vault-keypad-grid">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    className="vault-keypad-btn"
                    onClick={() => handleKeyPress(digit)}
                    disabled={isSubmitting}
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  className="vault-keypad-btn action-btn"
                  onClick={handleClear}
                  title="Clear"
                  disabled={isSubmitting || pinInput.length === 0}
                >
                  C
                </button>
                <button
                  type="button"
                  className="vault-keypad-btn"
                  onClick={() => handleKeyPress('0')}
                  disabled={isSubmitting}
                >
                  0
                </button>
                <button
                  type="button"
                  className="vault-keypad-btn action-btn"
                  onClick={handleBackspace}
                  title="Backspace"
                  disabled={isSubmitting || pinInput.length === 0}
                >
                  ⌫
                </button>
              </div>

              {/* Fallback password input for longer passphrases */}
              <form onSubmit={handleManualUnlock} style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="password"
                    className="login-input"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    placeholder={t('vaultEnterPassphrasePlaceholder' as any) || 'Or type passphrase / PIN...'}
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isSubmitting || !pinInput}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {t('vaultUnlockButton' as any) || 'Unlock'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        <div className="vault-modal-footer">
          {isUnlocked ? (
            <button
              type="button"
              className="btn-vault-lock"
              onClick={async () => {
                await lockVault();
                onClose();
              }}
            >
              🔒 {t('vaultLockNowButton' as any) || 'Lock Secret Vault Now'}
            </button>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('btnClose' as any) || 'Close'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
