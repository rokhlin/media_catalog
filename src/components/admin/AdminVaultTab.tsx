import React, { useState, useCallback } from 'react';
import { useVault } from '../../services/vaultContext';
import { useAuth } from '../../services/authContext';
import { useLanguage } from '../../i18n/LanguageContext';
import InputSourcesGallery, { type GalleryMediaFile } from '../gallery/MediaGallery';
import type { UISettings } from '../../models';

interface AdminVaultTabProps {
  mediaFiles?: GalleryMediaFile[];
  onRefreshMedia?: () => void;
  onStartSingleAnalysis?: (filePath: string) => void;
  uiSettings?: UISettings;
  onReloadFaces?: () => Promise<void>;
  onViewInFamilyTree?: (personName: string, personId?: string) => void;
}

export default function AdminVaultTab({
  mediaFiles = [],
  onRefreshMedia,
  onStartSingleAnalysis,
  uiSettings,
  onReloadFaces,
  onViewInFamilyTree,
}: AdminVaultTabProps) {
  const {
    vaultStatus,
    isUnlocked,
    isConfigured,
    remainingSeconds,
    unlockVault,
    lockVault,
    setupVault,
    vaultFetch,
    fetchVaultStatus,
  } = useVault();
  const { isAdmin, canAccessVault } = useAuth();
  const { t } = useLanguage();

  // Unlock state
  const [pinInput, setPinInput] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isSubmittingUnlock, setIsSubmittingUnlock] = useState(false);

  // Setup state
  const [setupPin, setSetupPin] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');
  const [setupFolder, setSetupFolder] = useState('vault');
  const [setupAutoLock, setSetupAutoLock] = useState<number>(15);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isSubmittingSetup, setIsSubmittingSetup] = useState(false);

  // Config editing state
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [editFolder, setEditFolder] = useState(vaultStatus?.vaultFolder || 'vault');
  const [editAutoLock, setEditAutoLock] = useState<number>(vaultStatus?.autoLockMinutes || 15);
  const [currentPinForChange, setCurrentPinForChange] = useState('');
  const [newPinForChange, setNewPinForChange] = useState('');
  const [confirmPinForChange, setConfirmPinForChange] = useState('');
  const [configMsg, setConfigMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const formatRemaining = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleKeyPress = useCallback(
    async (digit: string) => {
      setUnlockError(null);
      if (pinInput.length >= 8) return;
      const nextPin = pinInput + digit;
      setPinInput(nextPin);

      if (nextPin.length === 4 && isConfigured) {
        setIsSubmittingUnlock(true);
        const res = await unlockVault(nextPin);
        setIsSubmittingUnlock(false);
        if (res.success) {
          setPinInput('');
          if (onRefreshMedia) onRefreshMedia();
        } else {
          setUnlockError(res.error || t('vaultIncorrectPin' as any) || 'Incorrect PIN');
          setPinInput('');
        }
      }
    },
    [pinInput, isConfigured, unlockVault, onRefreshMedia, t]
  );

  const handleManualUnlock = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!pinInput) return;
      setIsSubmittingUnlock(true);
      setUnlockError(null);
      const res = await unlockVault(pinInput);
      setIsSubmittingUnlock(false);
      if (res.success) {
        setPinInput('');
        if (onRefreshMedia) onRefreshMedia();
      } else {
        setUnlockError(res.error || t('vaultIncorrectPin' as any) || 'Incorrect PIN');
      }
    },
    [pinInput, unlockVault, onRefreshMedia, t]
  );

  const handleSetupSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!setupPin || setupPin.length < 4) {
        setSetupError(t('vaultPinMinLength' as any) || 'PIN must be at least 4 digits');
        return;
      }
      if (setupPin !== setupConfirm) {
        setSetupError(t('vaultPinMismatch' as any) || 'PIN confirmation does not match');
        return;
      }

      setIsSubmittingSetup(true);
      setSetupError(null);
      const res = await setupVault(setupPin, setupFolder, setupAutoLock);
      setIsSubmittingSetup(false);
      if (res.success) {
        await unlockVault(setupPin);
        if (onRefreshMedia) onRefreshMedia();
      } else {
        setSetupError(res.error || 'Failed to setup vault');
      }
    },
    [setupPin, setupConfirm, setupFolder, setupAutoLock, setupVault, unlockVault, onRefreshMedia, t]
  );

  const handleSaveConfig = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setConfigMsg(null);

      const payload: any = {
        vaultFolder: editFolder.trim(),
        autoLockMinutes: Number(editAutoLock) || 15,
      };

      if (newPinForChange) {
        if (newPinForChange.length < 4) {
          setConfigMsg({ type: 'error', text: t('vaultPinMinLength' as any) || 'New PIN must be at least 4 digits' });
          return;
        }
        if (newPinForChange !== confirmPinForChange) {
          setConfigMsg({ type: 'error', text: t('vaultPinMismatch' as any) || 'New PIN confirmation does not match' });
          return;
        }
        payload.currentPin = currentPinForChange;
        payload.newPin = newPinForChange;
      }

      setIsSavingConfig(true);
      try {
        const res = await vaultFetch('/api/vault/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok) {
          setConfigMsg({ type: 'success', text: 'Vault settings updated successfully' });
          setCurrentPinForChange('');
          setNewPinForChange('');
          setConfirmPinForChange('');
          await fetchVaultStatus();
        } else {
          setConfigMsg({ type: 'error', text: data.message || 'Failed to update vault configuration' });
        }
      } catch (err: any) {
        setConfigMsg({ type: 'error', text: err.message || 'Network error' });
      } finally {
        setIsSavingConfig(false);
      }
    },
    [editFolder, editAutoLock, newPinForChange, confirmPinForChange, currentPinForChange, vaultFetch, fetchVaultStatus, t]
  );

  const vaultItems = mediaFiles.filter((m) => m.is_vault);

  if (!isAdmin && !canAccessVault) {
    return (
      <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#9aa0a6' }}>
        <span style={{ fontSize: '3rem' }}>🔒</span>
        <h3 style={{ color: '#fff', marginTop: '0.5rem' }}>Vault Access Restricted</h3>
        <p>Your user account lacks the required <code>vault_access</code> permission.</p>
      </div>
    );
  }

  return (
    <div className="admin-vault-tab-container" id="admin-vault-pane">
      {/* 1. Header & Status Bar */}
      <div
        className="admin-card"
        style={{
          background: isUnlocked
            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(24, 28, 38, 0.95) 100%)'
            : 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(24, 28, 38, 0.95) 100%)',
          border: isUnlocked ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '2.5rem' }}>{isUnlocked ? '🔓' : '🔒'}</span>
            <div>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '1.25rem' }}>
                {t('vaultTitle' as any) || 'Secret Vault Locker'}
                <span
                  style={{
                    fontSize: '0.78rem',
                    marginLeft: '0.75rem',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '6px',
                    fontWeight: 600,
                    background: isUnlocked ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)',
                    color: isUnlocked ? '#6ee7b7' : '#fcd34d',
                  }}
                >
                  {isUnlocked ? 'SESSION ACTIVE' : isConfigured ? 'LOCKED' : 'NOT CONFIGURED'}
                </span>
              </h3>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.88rem', color: '#9aa0a6' }}>
                {isUnlocked
                  ? `${vaultStatus?.itemsCount || vaultItems.length} protected item(s) currently unlocked and visible.`
                  : isConfigured
                  ? 'Private vault media files are encrypted and excluded from all searches and gallery views.'
                  : 'Set up master PIN protection for private media.'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {isUnlocked && (
              <>
                <div style={{ textAlign: 'right', marginRight: '0.5rem' }}>
                  <div style={{ fontSize: '0.78rem', color: '#9aa0a6' }}>Auto-lock in:</div>
                  <strong style={{ fontSize: '1.1rem', color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>
                    {formatRemaining(remainingSeconds)}
                  </strong>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsConfigOpen((prev) => !prev)}
                  title="Configure vault folder and auto-lock"
                >
                  ⚙️ Settings
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ borderColor: 'rgba(239, 68, 68, 0.5)', color: '#fca5a5' }}
                  onClick={async () => {
                    await lockVault();
                    if (onRefreshMedia) onRefreshMedia();
                  }}
                >
                  🔒 Lock Now
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. Unconfigured Setup Wizard */}
      {!isConfigured && !isUnlocked && (
        <div className="admin-card" style={{ maxWidth: '600px', margin: '0 auto 2rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>✨ {t('vaultSetupTitle' as any) || 'Setup Master PIN & Vault'}</h3>
          <p className="admin-subtitle" style={{ marginBottom: '1.25rem' }}>
            Initialize master PIN protection to isolate personal photos and secret folders from regular indexing.
          </p>

          {setupError && (
            <div className="login-error-alert" style={{ marginBottom: '1rem' }}>
              <span>⚠️</span>
              <span>{setupError}</span>
            </div>
          )}

          <form onSubmit={handleSetupSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="login-form-group">
              <label>{t('vaultNewPinLabel' as any) || 'Create Master PIN (min 4 digits)'}</label>
              <input
                type="password"
                className="login-input"
                value={setupPin}
                onChange={(e) => setSetupPin(e.target.value)}
                placeholder="••••"
                maxLength={16}
                required
              />
            </div>

            <div className="login-form-group">
              <label>{t('vaultConfirmPinLabel' as any) || 'Confirm PIN'}</label>
              <input
                type="password"
                className="login-input"
                value={setupConfirm}
                onChange={(e) => setSetupConfirm(e.target.value)}
                placeholder="••••"
                maxLength={16}
                required
              />
            </div>

            <div className="login-form-group">
              <label>{t('vaultFolderLabel' as any) || 'Designated Vault Folder Name'}</label>
              <input
                type="text"
                className="login-input"
                value={setupFolder}
                onChange={(e) => setSetupFolder(e.target.value)}
                placeholder="vault"
              />
              <span style={{ fontSize: '0.78rem', color: '#9aa0a6' }}>
                Files inside folders matching this name will be automatically protected.
              </span>
            </div>

            <div className="login-form-group">
              <label>Auto-Lock Inactivity Timeout</label>
              <select
                className="login-input"
                value={setupAutoLock}
                onChange={(e) => setSetupAutoLock(Number(e.target.value))}
                style={{ background: '#1e222d', color: '#fff' }}
              >
                <option value={5}>5 Minutes</option>
                <option value={10}>10 Minutes</option>
                <option value={15}>15 Minutes (Default)</option>
                <option value={30}>30 Minutes</option>
                <option value={60}>1 Hour</option>
              </select>
            </div>

            <button type="submit" className="btn btn-primary" disabled={isSubmittingSetup} style={{ marginTop: '0.5rem' }}>
              {isSubmittingSetup ? 'Configuring Vault...' : '🔐 Create & Protect Vault'}
            </button>
          </form>
        </div>
      )}

      {/* 3. Locked Keypad Interface */}
      {isConfigured && !isUnlocked && (
        <div className="admin-card" style={{ maxWidth: '440px', margin: '0 auto 2rem', textAlign: 'center' }}>
          <span style={{ fontSize: '3rem' }}>🔒</span>
          <h3 style={{ margin: '0.5rem 0 0.25rem', color: '#fff' }}>Enter Vault PIN</h3>
          <p className="admin-subtitle" style={{ marginBottom: '1.25rem' }}>
            Enter your PIN or Master Passphrase to view and manage secret media items.
          </p>

          {unlockError && (
            <div className="login-error-alert" style={{ marginBottom: '1rem', textAlign: 'left' }}>
              <span>⚠️</span>
              <span>{unlockError}</span>
            </div>
          )}

          {/* PIN Indicator Dots */}
          <div className="vault-pin-display" aria-label={`Entered ${pinInput.length} digits`}>
            {[0, 1, 2, 3].map((idx) => (
              <span key={idx} className={`vault-pin-dot ${idx < pinInput.length ? 'filled' : ''}`} />
            ))}
          </div>

          {/* Interactive Keypad */}
          <div className="vault-keypad-grid" style={{ marginBottom: '1.25rem' }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                className="vault-keypad-btn"
                onClick={() => handleKeyPress(digit)}
                disabled={isSubmittingUnlock}
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              className="vault-keypad-btn action-btn"
              onClick={() => setPinInput('')}
              title="Clear"
              disabled={isSubmittingUnlock || pinInput.length === 0}
            >
              C
            </button>
            <button
              type="button"
              className="vault-keypad-btn"
              onClick={() => handleKeyPress('0')}
              disabled={isSubmittingUnlock}
            >
              0
            </button>
            <button
              type="button"
              className="vault-keypad-btn action-btn"
              onClick={() => setPinInput((p) => p.slice(0, -1))}
              title="Backspace"
              disabled={isSubmittingUnlock || pinInput.length === 0}
            >
              ⌫
            </button>
          </div>

          {/* Fallback Form */}
          <form onSubmit={handleManualUnlock} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="password"
              className="login-input"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="Or type passphrase / PIN..."
            />
            <button type="submit" className="btn btn-primary" disabled={isSubmittingUnlock || !pinInput} style={{ whiteSpace: 'nowrap' }}>
              {isSubmittingUnlock ? '...' : 'Unlock'}
            </button>
          </form>
        </div>
      )}

      {/* 4. Configuration Card (When Unlocked or Toggled) */}
      {isUnlocked && isConfigOpen && (
        <div className="admin-card" style={{ marginBottom: '1.5rem', background: 'rgba(255, 255, 255, 0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>⚙️ Vault Privacy & Security Settings</h3>
            <button type="button" className="btn btn-secondary" onClick={() => setIsConfigOpen(false)} style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}>
              ✖ Close Settings
            </button>
          </div>

          {configMsg && (
            <div className={configMsg.type === 'success' ? 'vault-unlocked-banner' : 'login-error-alert'} style={{ marginBottom: '1rem' }}>
              <span>{configMsg.type === 'success' ? '✓' : '⚠️'}</span>
              <span>{configMsg.text}</span>
            </div>
          )}

          <form onSubmit={handleSaveConfig} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="login-form-group">
                <label>Designated Vault Folder Name</label>
                <input
                  type="text"
                  className="login-input"
                  value={editFolder}
                  onChange={(e) => setEditFolder(e.target.value)}
                  placeholder="vault"
                />
              </div>

              <div className="login-form-group">
                <label>Auto-Lock Timeout</label>
                <select
                  className="login-input"
                  value={editAutoLock}
                  onChange={(e) => setEditAutoLock(Number(e.target.value))}
                  style={{ background: '#1e222d', color: '#fff' }}
                >
                  <option value={5}>5 Minutes</option>
                  <option value={10}>10 Minutes</option>
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes</option>
                  <option value={60}>1 Hour</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderLeft: '1px solid rgba(255, 255, 255, 0.08)', paddingLeft: '1.25rem' }}>
              <div className="login-form-group">
                <label>Change Master PIN (Optional)</label>
                <input
                  type="password"
                  className="login-input"
                  value={currentPinForChange}
                  onChange={(e) => setCurrentPinForChange(e.target.value)}
                  placeholder="Current PIN"
                />
              </div>

              <div className="login-form-group">
                <input
                  type="password"
                  className="login-input"
                  value={newPinForChange}
                  onChange={(e) => setNewPinForChange(e.target.value)}
                  placeholder="New PIN (min 4 digits)"
                />
              </div>

              <div className="login-form-group">
                <input
                  type="password"
                  className="login-input"
                  value={confirmPinForChange}
                  onChange={(e) => setConfirmPinForChange(e.target.value)}
                  placeholder="Confirm New PIN"
                />
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={isSavingConfig}>
                {isSavingConfig ? 'Saving Settings...' : 'Save Vault Configuration'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 5. Secret Vault Media Gallery (When Unlocked) */}
      {isUnlocked && (
        <div className="admin-vault-gallery-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h4 style={{ margin: 0, color: '#fff', fontSize: '1.1rem' }}>
              🖼️ Secret Vault Media Items ({vaultItems.length})
            </h4>
          </div>

          {vaultItems.length === 0 ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#9aa0a6', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
              <span style={{ fontSize: '2.5rem' }}>📭</span>
              <h4 style={{ color: '#fff', marginTop: '0.5rem' }}>Vault is Empty</h4>
              <p style={{ maxWidth: '440px', margin: '0 auto', fontSize: '0.88rem' }}>
                You can add private media items to the Secret Vault directly from the main Media Library by opening any photo/video in the lightbox and clicking <strong>"Move to Secret Vault"</strong>.
              </p>
            </div>
          ) : (
            <InputSourcesGallery
              mediaFiles={vaultItems}
              onRefresh={onRefreshMedia}
              onStartSingleAnalysis={onStartSingleAnalysis}
              uiSettings={uiSettings}
              onReloadFaces={onReloadFaces}
              onViewInFamilyTree={onViewInFamilyTree}
            />
          )}
        </div>
      )}
    </div>
  );
}
