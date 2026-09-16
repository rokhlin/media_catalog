import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAuth } from '../../services/authContext';

export interface HeaderProfileProps {
  onOpenLogin?: () => void;
}

export default function HeaderProfile({ onOpenLogin }: HeaderProfileProps) {
  const { t } = useLanguage();
  const { currentUser, isAuthenticated, logout } = useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUserMenuOpen]);

  if (!isAuthenticated || !currentUser) {
    return (
      <button
        type="button"
        className="btn btn-secondary"
        onClick={onOpenLogin}
        id="btn-header-login"
        style={{ padding: '0.55rem 1rem', fontSize: '0.88rem' }}
      >
        🔑 {t('authSignIn' as any) || 'Sign In'}
      </button>
    );
  }

  return (
    <div className="theme-switcher-container" ref={userMenuRef}>
      <button
        type="button"
        className={`btn btn-secondary ${isUserMenuOpen ? 'active' : ''}`}
        onClick={() => setIsUserMenuOpen((prev) => !prev)}
        id="btn-user-profile"
        style={{ padding: '0.5rem 0.9rem', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}
      >
        <span>👤</span>
        <span style={{ fontWeight: 600, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {currentUser.displayName || currentUser.username}
        </span>
        <span
          style={{
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            padding: '0.1rem 0.35rem',
            borderRadius: '4px',
            background:
              currentUser.role === 'admin'
                ? 'rgba(168, 85, 247, 0.3)'
                : currentUser.role === 'editor'
                ? 'rgba(59, 130, 246, 0.3)'
                : 'rgba(16, 185, 129, 0.3)',
            color:
              currentUser.role === 'admin'
                ? '#d8b4fe'
                : currentUser.role === 'editor'
                ? '#93c5fd'
                : '#6ee7b7',
          }}
        >
          {currentUser.role}
        </span>
      </button>

      {isUserMenuOpen && (
        <div className="theme-dropdown-menu" style={{ width: '220px' }}>
          <div className="theme-dropdown-header">
            <strong>{currentUser.displayName || currentUser.username}</strong>
            <div style={{ fontSize: '0.78rem', color: '#9aa0a6' }}>@{currentUser.username}</div>
          </div>
          <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#cbd5e1', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div>Role: <strong style={{ textTransform: 'capitalize' }}>{currentUser.role}</strong></div>
          </div>
          <div className="theme-dropdown-footer" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <button
              type="button"
              className="btn-dropdown-customize"
              onClick={() => {
                setIsUserMenuOpen(false);
                if (onOpenLogin) onOpenLogin();
              }}
              style={{ textAlign: 'left' }}
            >
              🔄 {t('authSwitchAccount' as any) || 'Switch Account'}
            </button>
            <button
              type="button"
              className="btn-dropdown-customize"
              onClick={() => {
                setIsUserMenuOpen(false);
                logout();
              }}
              style={{ textAlign: 'left', color: '#fca5a5' }}
            >
              🚪 {t('authSignOut' as any) || 'Sign Out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { HeaderProfile };
