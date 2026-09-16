import { useLanguage } from '../../i18n/LanguageContext';
import { Button } from '../common';

export interface HeaderLogsToggleProps {
  showLogs?: boolean;
  onToggleLogs?: () => void;
}

export default function HeaderLogsToggle({ showLogs = false, onToggleLogs }: HeaderLogsToggleProps) {
  const { t } = useLanguage();

  return (
    <Button
      variant="secondary"
      active={showLogs}
      className="btn-logs-toggle"
      onClick={onToggleLogs}
      id="btn-logs-toggle"
      title={showLogs ? t('btnHideLogs') : t('btnShowLogs')}
      style={{ padding: '0.55rem 1.1rem', fontSize: '0.88rem' }}
    >
      📋 {showLogs ? t('btnHideLogs') : t('btnShowLogs')}
    </Button>
  );
}

export { HeaderLogsToggle };
