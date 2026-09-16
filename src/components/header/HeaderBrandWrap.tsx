import { useLanguage } from '../../i18n/LanguageContext';

export interface HeaderBrandWrapProps {
  isNavExpanded?: boolean;
  onToggleNavExpanded?: () => void;
  toggleTooltip?: string;
  title?: string;
  subtitle?: string;
  displayTitle?: string;
  displaySubtitle?: string;
  className?: string;
}

export default function HeaderBrandWrap({
  isNavExpanded = true,
  onToggleNavExpanded,
  toggleTooltip,
  title,
  subtitle,
  displayTitle,
  displaySubtitle,
  className = '',
}: HeaderBrandWrapProps) {
  const { t } = useLanguage();

  const finalTitle = displayTitle ?? title ?? '';
  const finalSubtitle = displaySubtitle ?? subtitle ?? '';
  const finalTooltip =
    toggleTooltip ??
    (isNavExpanded
      ? (t('navCollapse' as any) || 'Collapse navigation')
      : (t('navExpand' as any) || 'Expand navigation'));

  return (
    <div className={`header-brand-wrap ${className}`.trim()}>
      {/* Bigger Hamburger icon in app-header with height matching logo-section */}
      <button
        type="button"
        className={`nav-hamburger-btn header-hamburger-btn ${isNavExpanded ? 'active' : ''}`}
        onClick={onToggleNavExpanded}
        title={finalTooltip}
        aria-label="Toggle navigation menu"
        aria-expanded={isNavExpanded}
        id="btn-nav-hamburger"
      >
        <span className="hamburger-icon-bars" aria-hidden="true">
          <span className="bar bar-1"></span>
          <span className="bar bar-2"></span>
          <span className="bar bar-3"></span>
        </span>
      </button>

      <div className="logo-section">
        <h1>{finalTitle}</h1>
        <p>{finalSubtitle}</p>
      </div>
    </div>
  );
}

export { HeaderBrandWrap as HeaderBrand };
