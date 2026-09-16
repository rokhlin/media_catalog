import SystemSettings, { type SettingsTab } from '../components/settings';
import type { SettingsData, UISettings } from '../models';

export interface SettingsScreenProps {
  settings: SettingsData | null;
  onSaveSettings: (settings: SettingsData) => Promise<boolean>;
  onPickFolder?: (title?: string) => Promise<string>;
  isRunning: boolean;
  isPaused: boolean;
  currentTask: string | null | undefined;
  onStartSync: (force: boolean) => void;
  onPauseSync: () => void;
  onResumeSync: () => void;
  onStopSync: () => void;
  onStartSingleAnalysis: (filePath: string) => void;
  onPickSingleFile?: () => Promise<string>;
  pickerPending: boolean;
  uiSettings: UISettings;
  onSaveUiSettings: (settings: UISettings) => void;
  initialTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onRefreshMedia: () => Promise<void> | void;
  onRescanSeries: () => Promise<void> | void;
  scanProgress: {
    is_scanning: boolean;
    scanned_count: number;
    current_file: string | null;
    current_filename: string | null;
    current_folder: string | null;
  } | null;
  onNavigateToTreeSettings?: () => void;
}

export default function SettingsScreen({
  settings,
  onSaveSettings,
  onPickFolder,
  isRunning,
  isPaused,
  currentTask,
  onStartSync,
  onPauseSync,
  onResumeSync,
  onStopSync,
  onStartSingleAnalysis,
  onPickSingleFile,
  pickerPending,
  uiSettings,
  onSaveUiSettings,
  initialTab,
  onTabChange,
  onRefreshMedia,
  onRescanSeries,
  scanProgress,
  onNavigateToTreeSettings,
}: SettingsScreenProps) {
  return (
    <div className="tab-pane active" id="pane-settings">
      <SystemSettings
        settings={settings}
        onSaveSettings={onSaveSettings}
        onPickFolder={onPickFolder}
        isRunning={isRunning}
        isPaused={isPaused}
        currentTask={currentTask}
        onStartSync={onStartSync}
        onPauseSync={onPauseSync}
        onResumeSync={onResumeSync}
        onStopSync={onStopSync}
        onStartSingleAnalysis={onStartSingleAnalysis}
        onPickSingleFile={onPickSingleFile}
        pickerPending={pickerPending}
        uiSettings={uiSettings}
        onSaveUiSettings={onSaveUiSettings}
        initialTab={initialTab}
        onTabChange={onTabChange}
        onRefreshMedia={onRefreshMedia}
        onRescanSeries={onRescanSeries}
        scanProgress={scanProgress}
        onNavigateToTreeSettings={onNavigateToTreeSettings}
      />
    </div>
  );
}

export { SettingsScreen };
