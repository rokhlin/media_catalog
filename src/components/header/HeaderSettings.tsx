import { useLanguage } from '../../i18n/LanguageContext';
import { Button } from '../common';

export interface HeaderSettingsProps {
  onOpenSettings?: () => void;
}

export default function HeaderSettings({ onOpenSettings }: HeaderSettingsProps) {
  const { t } = useLanguage();

  return (
    <Button
      variant="secondary"
      onClick={onOpenSettings}
      id="btn-open-settings"
      style={{ padding: '0.55rem 1.2rem', fontSize: '0.88rem' }}
    >
      ⚙️ {t('btnSettings')}
    </Button>
  );
}

export { HeaderSettings };
