import InputSourcesGallery, { type GalleryMediaFile } from '../components/gallery';
import type { PersonItem, UISettings } from '../models';
import { useLanguage } from '../i18n/LanguageContext';
import { Button } from '../components/common';

export interface VaultScreenProps {
  isUnlocked: boolean;
  isConfigured: boolean;
  onOpenVaultModal: () => void;
  mediaFiles: GalleryMediaFile[];
  isLoading: boolean;
  isBackgroundLoading: boolean;
  onRefresh: (force?: boolean) => void | Promise<void>;
  onFetchMore: () => void;
  onStartSingleAnalysis: (
    filePath: string,
    onSuccess?: () => void,
    onError?: (errMsg: string) => void
  ) => Promise<boolean | void> | void;
  onSwitchToControls: () => void;
  persons: PersonItem[];
  uiSettings: UISettings;
  disabled?: boolean;
  onReloadFaces?: () => Promise<void>;
  onViewInFamilyTree?: (personName: string, personId?: string) => void;
  scannedFilesCount?: number;
  activeInputFolders?: string[];
}

export default function VaultScreen({
  isUnlocked,
  isConfigured,
  onOpenVaultModal,
  mediaFiles,
  isLoading,
  isBackgroundLoading,
  onRefresh,
  onFetchMore,
  onStartSingleAnalysis,
  onSwitchToControls,
  persons,
  uiSettings,
  disabled,
  onReloadFaces,
  onViewInFamilyTree,
  scannedFilesCount,
  activeInputFolders,
}: VaultScreenProps) {
  const { t } = useLanguage();
  const vaultFiles = mediaFiles.filter((m) => m.is_vault);

  return (
    <div className="tab-pane active" id="pane-vault">
      {!isUnlocked ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '60vh',
            gap: '1.25rem',
            textAlign: 'center',
            background: 'rgba(0, 0, 0, 0.25)',
            borderRadius: '16px',
            border: '1px dashed rgba(255, 255, 255, 0.15)',
            padding: '2rem',
          }}
        >
          <span style={{ fontSize: '3.5rem' }}>🔒</span>
          <div>
            <h2 style={{ margin: '0 0 0.5rem', color: '#fff' }}>{t('vaultScreenLockedTitle')}</h2>
            <p style={{ margin: 0, color: '#9aa0a6', maxWidth: '420px' }}>
              {t('vaultScreenLockedDesc')}
            </p>
          </div>
          <Button
            variant="primary"
            onClick={onOpenVaultModal}
            style={{ padding: '0.75rem 1.75rem', fontSize: '1rem', borderRadius: '12px' }}
            id="btn-unlock-vault-pane"
          >
            🔓 {isConfigured ? t('btnUnlockVaultScreen') : t('btnSetupMasterPinScreen')}
          </Button>
        </div>
      ) : (
        <InputSourcesGallery
          mediaFiles={vaultFiles}
          isLoading={isLoading}
          isBackgroundLoading={isBackgroundLoading}
          totalKnownFiles={vaultFiles.length}
          onRefresh={onRefresh}
          onFetchMore={onFetchMore}
          onStartSingleAnalysis={onStartSingleAnalysis}
          onSwitchToControls={onSwitchToControls}
          persons={persons}
          uiSettings={uiSettings}
          disabled={disabled}
          onReloadFaces={onReloadFaces}
          onViewInFamilyTree={onViewInFamilyTree}
          scannedFilesCount={scannedFilesCount || 0}
          activeInputFolders={activeInputFolders || []}
        />
      )}
    </div>
  );
}

export { VaultScreen };
