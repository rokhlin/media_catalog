import { useLanguage } from '../../i18n/LanguageContext';
import { useVault } from '../../services/vaultContext';

export interface HeaderVaultToggleProps {
  onOpenVault?: () => void;
}

export default function HeaderVaultToggle({ onOpenVault }: HeaderVaultToggleProps) {
  const { t } = useLanguage();
  const { isUnlocked, isConfigured } = useVault();

  if (!onOpenVault) return null;

  return (
    <button
      type="button"
      className={`btn btn-secondary ${isUnlocked ? 'active' : ''}`}
      onClick={onOpenVault}
      title={
        isUnlocked
          ? t('vaultUnlockedTitle' as any) || 'Secret Vault Unlocked'
          : isConfigured
          ? t('vaultLockedTitle' as any) || 'Unlock Secret Vault'
          : t('vaultSetupTitle' as any) || 'Setup Secret Vault'
      }
      id="btn-header-vault"
      style={{ padding: '0.55rem 0.9rem', fontSize: '0.88rem' }}
    >
      {isUnlocked ? '🔓' : '🔒'} {t('vaultShortLabel' as any) || 'Vault'}
    </button>
  );
}

export { HeaderVaultToggle };
