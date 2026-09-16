import InputSourcesGallery, { type GalleryMediaFile } from '../components/gallery';
import type { PersonItem, UISettings } from '../models';

export interface GalleryScreenProps {
  mediaFiles: GalleryMediaFile[];
  isLoading: boolean;
  isBackgroundLoading: boolean;
  totalKnownFiles: number | null;
  onRefresh: () => void;
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
  currentLoadingFile?: string | null;
  currentLoadingFilename?: string | null;
  scannedFilesCount?: number;
  activeInputFolders?: string[];
  isEngineConnected?: boolean;
}

export default function GalleryScreen({
  mediaFiles,
  isLoading,
  isBackgroundLoading,
  totalKnownFiles,
  onRefresh,
  onFetchMore,
  onStartSingleAnalysis,
  onSwitchToControls,
  persons,
  uiSettings,
  disabled,
  onReloadFaces,
  onViewInFamilyTree,
  currentLoadingFile,
  currentLoadingFilename,
  scannedFilesCount,
  activeInputFolders,
  isEngineConnected,
}: GalleryScreenProps) {
  return (
    <div className="tab-pane active" id="pane-main">
      <InputSourcesGallery
        mediaFiles={mediaFiles}
        isLoading={isLoading}
        isBackgroundLoading={isBackgroundLoading}
        totalKnownFiles={totalKnownFiles}
        onRefresh={onRefresh}
        onFetchMore={onFetchMore}
        onStartSingleAnalysis={onStartSingleAnalysis}
        onSwitchToControls={onSwitchToControls}
        persons={persons}
        uiSettings={uiSettings}
        disabled={disabled}
        onReloadFaces={onReloadFaces}
        onViewInFamilyTree={onViewInFamilyTree}
        currentLoadingFile={currentLoadingFile}
        currentLoadingFilename={currentLoadingFilename}
        scannedFilesCount={scannedFilesCount}
        activeInputFolders={activeInputFolders}
        isEngineConnected={isEngineConnected}
      />
    </div>
  );
}

export { GalleryScreen };
