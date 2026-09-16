import { useLanguage } from '../../i18n/LanguageContext';

export default function HeaderLanguage() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div
      className="lang-switcher-wrap"
      role="group"
      aria-label={t('langSwitchTooltip')}
      title={t('langSwitchTooltip')}
    >
      <button
        type="button"
        className={`lang-btn ${language === 'en' ? 'active' : ''}`}
        onClick={() => setLanguage('en')}
        id="btn-lang-en"
        title="English"
      >
        🇬🇧 EN
      </button>
      <button
        type="button"
        className={`lang-btn ${language === 'ru' ? 'active' : ''}`}
        onClick={() => setLanguage('ru')}
        id="btn-lang-ru"
        title="Русский"
      >
        🇷🇺 RU
      </button>
    </div>
  );
}

export { HeaderLanguage };
