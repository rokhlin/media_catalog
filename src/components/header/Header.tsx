import type { StatusInfo } from '../../models';
import { useLanguage } from '../../i18n/LanguageContext';
import HeaderBrandWrap from './HeaderBrandWrap';
import HeaderVaultToggle from './HeaderVaultToggle';
import HeaderTheme from './HeaderTheme';
import HeaderLanguage from './HeaderLanguage';
import HeaderProfile from './HeaderProfile';
import HeaderLogsToggle from './HeaderLogsToggle';
import HeaderSettings from './HeaderSettings';
import HeaderStatusBadge from './HeaderStatusBadge';

export interface HeaderProps {
  statusInfo?: StatusInfo;
  onOpenSettings?: () => void;
  onOpenAppearanceSettings?: () => void;
  onOpenLogin?: () => void;
  onOpenVault?: () => void;
  showLogs?: boolean;
  onToggleLogs?: () => void;
  isScanning?: boolean;
  scannedFilesCount?: number;
  currentLoadingFilename?: string | null;
  isNavExpanded?: boolean;
  onToggleNavExpanded?: () => void;
  activeTab?: string;
  pageTitle?: string;
  pageSubtitle?: string;
}

export default function Header({
  statusInfo,
  onOpenSettings,
  onOpenAppearanceSettings,
  onOpenLogin,
  onOpenVault,
  showLogs = false,
  onToggleLogs,
  isScanning = false,
  scannedFilesCount = 0,
  currentLoadingFilename = null,
  isNavExpanded = true,
  onToggleNavExpanded,
  activeTab = 'main',
  pageTitle,
  pageSubtitle,
}: HeaderProps) {
  const { language, t } = useLanguage();
  const { status, current_task, error, progress } = statusInfo || {};

  let dotClass = 'status-dot active';
  let statusText = t('statusIdle');
  let progressText = '';

  if (isScanning) {
    dotClass = 'status-dot running';
    const countPart = scannedFilesCount > 0 ? ` (${scannedFilesCount.toLocaleString()})` : '';
    const filePart = currentLoadingFilename ? ` • ${currentLoadingFilename}` : '';
    statusText = language === 'ru'
      ? `Сканирование папок источников${countPart}${filePart}`
      : `Scanning input sources${countPart}${filePart}`;
  } else if (status === 'running' || status === 'paused') {
    dotClass = status === 'paused' ? 'status-dot warning' : 'status-dot running';
    const taskName = current_task === 'sync' ? t('taskSync') : t('taskSingle');
    const prefix = status === 'paused' ? t('statusPaused') : t('statusRunning');

    if (progress && progress.total > 0) {
      const fileInfo = progress.current_file ? ` • ${progress.current_file}` : '';
      statusText = `${prefix}: ${taskName}`;
      progressText = `(${progress.current}/${progress.total} - ${progress.percent}%${fileInfo})`;
    } else if (progress && progress.stage) {
      statusText = `${prefix}: ${taskName}`;
      progressText = `${progress.stage}`;
    } else {
      statusText = `${prefix}: ${taskName}...`;
    }
  } else if (status === 'completed') {
    dotClass = 'status-dot active';
    statusText = t('statusCompleted');
  } else if (status === 'stopped') {
    dotClass = 'status-dot';
    statusText = t('statusStopped');
  } else if (status === 'failed') {
    dotClass = 'status-dot error';
    statusText = `${t('statusFailed')}: ${error || 'Unknown error'}`;
  } else if (status === 'checking') {
    dotClass = 'status-dot';
    statusText = t('statusChecking');
  }

  // Combine and truncate status text to max 50 chars for clean badge display
  const fullStatusString = progressText ? `${statusText} ${progressText}` : statusText;
  const displayStatus = fullStatusString.length > 50
    ? fullStatusString.slice(0, 49) + '…'
    : fullStatusString;

  const toggleTooltip = isNavExpanded
    ? (t('navCollapse' as any) || 'Collapse navigation')
    : (t('navExpand' as any) || 'Expand navigation');

  // Dynamic page title & explanation subtitle based on activeTab
  const getPageTitleAndSubtitle = () => {
    if (pageTitle) {
      return { title: pageTitle, subtitle: pageSubtitle || '' };
    }

    const isRu = language === 'ru';
    switch (activeTab) {
      case 'main':
        return {
          title: (t as any)('galleryTitle') || (isRu ? 'Галерея медиафайлов' : 'Media Gallery'),
          subtitle: isRu
            ? 'Просмотр, фильтрация и организация каталогизированных фото и видео'
            : 'Browse, filter, view and organize cataloged media files, photos and videos',
        };
      case 'duplicates':
        return {
          title: isRu ? 'Организация файлов' : 'Organize files',
          subtitle: isRu
            ? 'Организация медиатеки по критериям, тегирование, сортировка и поиск дубликатов'
            : 'Media library organization by criteria, tagging, folder sorting, and duplicate cleanup',
        };
      case 'media_library':
        return {
          title: (t as any)('faceRegistryTitle') || (isRu ? 'Распознавание лиц и группы' : 'Face Recognition & Groups'),
          subtitle: isRu
            ? 'Кластеризация лиц, назначение персон и управление конвейером анализа'
            : 'Face cluster inspection, identity assignment and pipeline analysis',
        };
      case 'family_tree':
        return {
          title: (t as any)('navFamilyTree') || (isRu ? 'Семейное древо' : 'Family Tree'),
          subtitle: isRu
            ? 'Интерактивный генеалогический граф и хроника жизни родственников'
            : 'Interactive genealogical relationship graph and life chronology',
        };
      case 'settings':
        return {
          title: (t as any)('navSettings') || (isRu ? 'Настройки системы' : 'System Settings'),
          subtitle: isRu
            ? 'Настройка папок, путей хранения, параметров ИИ и визуальных предпочтений'
            : 'Configure input folders, storage paths, AI models and visual preferences',
        };
      case 'admin':
        return {
          title: (t as any)('adminTitle') || (isRu ? 'Панель администратора' : 'Admin Dashboard'),
          subtitle: isRu
            ? 'Мониторинг системы, управление пользователями и переключение флагов функций'
            : 'System health monitoring, user account management and feature flag controls',
        };
      case 'vault':
        return {
          title: isRu ? 'Секретное хранилище' : 'Secret Vault',
          subtitle: isRu
            ? 'Зашифрованные персональные медиафайлы с защитой по паролю или PIN'
            : 'Encrypted private folder protected by password or master PIN',
        };
      default:
        return {
          title: t('appTitle'),
          subtitle: t('appSubtitle'),
        };
    }
  };

  const { title: displayTitle, subtitle: displaySubtitle } = getPageTitleAndSubtitle();

  return (
    <header className="app-header">
      <HeaderBrandWrap
        isNavExpanded={isNavExpanded}
        onToggleNavExpanded={onToggleNavExpanded}
        toggleTooltip={toggleTooltip}
        displayTitle={displayTitle}
        displaySubtitle={displaySubtitle}
      />

      <div className="header-right-section">
        {/* visual-controls: Theme switcher, Language switcher, Vault, Auth, Logs toggle, Settings */}
        <div className="visual-controls" id="visual-controls">
          <HeaderVaultToggle onOpenVault={onOpenVault} />
          <HeaderTheme onOpenAppearanceSettings={onOpenAppearanceSettings} />
          <HeaderLanguage />
          <HeaderProfile onOpenLogin={onOpenLogin} />
          <HeaderLogsToggle showLogs={showLogs} onToggleLogs={onToggleLogs} />
          <HeaderSettings onOpenSettings={onOpenSettings} />
        </div>

        {/* status-badge placed under visual-controls, aligned right, max length: 50 chars */}
        <HeaderStatusBadge
          dotClass={dotClass}
          displayStatus={displayStatus}
          fullStatusString={fullStatusString}
        />
      </div>
    </header>
  );
}

export { Header };
