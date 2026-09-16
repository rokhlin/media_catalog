import { memo, useState, useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useFamilyTreeStore } from '../../../state/useFamilyTreeStore.js';
import { useLanguage } from '../../../../../i18n/LanguageContext.js';
import { localizeKinshipTerm } from '../../../utils/kinshipUtils.js';
import type { AutocompletePersonItem } from '../../../types/tree.types.js';

export const TreeSearchBar = memo(() => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AutocompletePersonItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const { fitView } = useReactFlow();
  const { selectPerson, setHighlightedPersonId, activeTreeId } = useFamilyTreeStore();
  const { language, t } = useLanguage();
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      setHighlightedPersonId(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/family-tree/public/autocomplete?query=${encodeURIComponent(query)}&treeId=${encodeURIComponent(activeTreeId)}`,
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setIsOpen(data.length > 0);
        }
      } catch {
        // ignore
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, activeTreeId, setHighlightedPersonId]);

  // Click outside listener
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleSelect = (item: AutocompletePersonItem) => {
    setQuery(item.fullName);
    setIsOpen(false);
    selectPerson(item.id, true);
    setHighlightedPersonId(item.id);
    fitView({
      nodes: [{ id: `p_${item.id}` }],
      duration: 600,
      maxZoom: 1.2,
    });
  };

  return (
    <div
      ref={searchRef}
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        zIndex: 20,
        width: 280,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: 'var(--card-bg-solid)',
          border: '1px solid var(--border-color)',
          borderRadius: 12,
          padding: '6px 12px',
          backdropFilter: 'blur(12px)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <span style={{ marginRight: 8, fontSize: 14, color: 'var(--text-muted)' }}>🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchRelativesPlaceholder')}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: 12,
            width: '100%',
            padding: '7px 12px',
          }}
        />
        {query && (
          <button
            type="button"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 12,
            }}
            onClick={() => {
              setQuery('');
              setHighlightedPersonId(null);
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Autocomplete Dropdown */}
      {isOpen && results.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            background: 'var(--card-bg-solid)',
            border: '1px solid var(--border-color)',
            borderRadius: 10,
            maxHeight: 280,
            overflowY: 'auto',
            backdropFilter: 'blur(16px)',
            boxShadow: 'var(--shadow-modal)',
            padding: '4px',
          }}
        >
          {results.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                transition: 'background 0.1s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--nav-tab-active-bg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
              onClick={() => handleSelect(p)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {p.avatarUrl ? (
                  <img
                    src={p.avatarUrl}
                    alt={p.fullName}
                    style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#ffffff',
                    }}
                  >
                    {p.firstName[0]}
                  </div>
                )}

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {p.fullName}
                  </div>
                  {p.birthYear && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {p.isLiving ? `${t('bornPrefix')} ${p.birthYear}` : t('statusDeceased')}
                    </div>
                  )}
                </div>
              </div>

              {p.kinshipTerm && (
                <span
                  style={{
                    background: 'var(--nav-tab-active-bg)',
                    border: '1px solid var(--primary-color, #6366f1)',
                    color: 'var(--primary-color, #6366f1)',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 6,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {localizeKinshipTerm(p.kinshipTerm, language)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

TreeSearchBar.displayName = 'TreeSearchBar';
