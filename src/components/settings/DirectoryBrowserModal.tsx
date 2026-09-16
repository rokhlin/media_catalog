import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';

export interface DirectoryBrowserModalProps {
  isOpen: boolean;
  title?: string;
  initialPath?: string;
  mode?: 'folder' | 'file';
  onSelect: (selectedPath: string) => void;
  onClose: () => void;
}

interface BrowseData {
  current_path: string;
  parent_path: string | null;
  shortcuts: Array<{ label: string; path: string }>;
  directories: string[];
  files: string[];
  error?: string;
}

export default function DirectoryBrowserModal({
  isOpen,
  title,
  initialPath = '',
  mode = 'folder',
  onSelect,
  onClose,
}: DirectoryBrowserModalProps) {
  const { t } = useLanguage();
  const [pathInput, setPathInput] = useState(initialPath);
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [browseData, setBrowseData] = useState<BrowseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const fetchDirectory = useCallback(async (targetPath: string) => {
    setLoading(true);
    setSelectedFile(null);
    try {
      const url = `/api/fs/browse?path=${encodeURIComponent(targetPath)}&mode=${mode}`;
      const res = await fetch(url);
      if (res.ok) {
        const data: BrowseData = await res.json();
        setBrowseData(data);
        setCurrentPath(data.current_path);
        setPathInput(data.current_path);
      } else {
        setBrowseData((prev) => ({
          current_path: targetPath,
          parent_path: null,
          shortcuts: prev?.shortcuts || [],
          directories: [],
          files: [],
          error: `HTTP error ${res.status}`,
        }));
      }
    } catch (err: any) {
      setBrowseData((prev) => ({
        current_path: targetPath,
        parent_path: null,
        shortcuts: prev?.shortcuts || [],
        directories: [],
        files: [],
        error: err.message || 'Network error',
      }));
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    if (isOpen) {
      const startPath = initialPath.trim();
      setPathInput(startPath);
      setCurrentPath(startPath);
      fetchDirectory(startPath);
    }
  }, [isOpen, initialPath, fetchDirectory]);

  if (!isOpen) return null;

  const handleNavigate = (path: string) => {
    fetchDirectory(path);
  };

  const handleFolderClick = (folderName: string) => {
    if (!currentPath) {
      handleNavigate(folderName);
      return;
    }
    // Handle Windows UNC or Windows backslash paths
    const isBackslash = currentPath.includes('\\');
    const separator = isBackslash ? '\\' : '/';
    const cleanBase = currentPath.endsWith(separator)
      ? currentPath.slice(0, -1)
      : currentPath;
    handleNavigate(`${cleanBase}${separator}${folderName}`);
  };

  const handleFileClick = (fileName: string) => {
    setSelectedFile(fileName);
  };

  const handleUp = () => {
    if (browseData?.parent_path) {
      handleNavigate(browseData.parent_path);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pathInput.trim()) {
      handleNavigate(pathInput.trim());
    }
  };

  const handleConfirmSelect = () => {
    if (mode === 'file') {
      if (!selectedFile) {
        // Use path in input if provided
        if (pathInput.trim()) {
          onSelect(pathInput.trim());
          onClose();
        }
        return;
      }
      const isBackslash = currentPath.includes('\\');
      const separator = isBackslash ? '\\' : '/';
      const cleanBase = currentPath.endsWith(separator)
        ? currentPath.slice(0, -1)
        : currentPath;
      onSelect(`${cleanBase}${separator}${selectedFile}`);
      onClose();
    } else {
      // Use either the current valid path or the edited input path
      const chosen = pathInput.trim() || currentPath;
      onSelect(chosen);
      onClose();
    }
  };

  const modalTitle = title || (mode === 'file' ? t('browserTitleFile') : t('browserTitle'));

  // Build breadcrumb segments
  const renderBreadcrumbs = () => {
    if (!currentPath) return null;
    const isBackslash = currentPath.includes('\\');
    const isUnc = currentPath.startsWith('\\\\') || currentPath.startsWith('//');
    const separator = isBackslash ? '\\' : '/';

    if (isUnc) {
      return (
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {currentPath}
        </span>
      );
    }

    const parts = currentPath.split(/[/\\]/).filter(Boolean);
    const crumbs: Array<{ label: string; fullPath: string }> = [];

    let accumulated = currentPath.startsWith('/') ? '/' : '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === 0 && /^[a-zA-Z]:$/.test(part)) {
        accumulated = `${part}\\`;
      } else {
        accumulated = accumulated.endsWith('/') || accumulated.endsWith('\\')
          ? `${accumulated}${part}`
          : `${accumulated}${separator}${part}`;
      }
      crumbs.push({ label: part, fullPath: accumulated });
    }

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        <button
          type="button"
          onClick={() => handleNavigate('/')}
          className="btn btn-secondary"
          style={{ padding: '2px 6px', fontSize: '0.75rem' }}
        >
          {isBackslash ? '🏠 Root' : '📂 /'}
        </button>
        {crumbs.map((crumb, idx) => (
          <React.Fragment key={idx}>
            <span style={{ opacity: 0.5 }}>{separator}</span>
            <button
              type="button"
              onClick={() => handleNavigate(crumb.fullPath)}
              className="btn btn-secondary"
              style={{
                padding: '2px 6px',
                fontSize: '0.75rem',
                fontWeight: idx === crumbs.length - 1 ? 600 : 400,
                color: idx === crumbs.length - 1 ? 'var(--primary-color)' : 'inherit',
              }}
            >
              {crumb.label}
            </button>
          </React.Fragment>
        ))}
      </div>
    );
  };

  return (
    <div className="modal-overlay active" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '720px',
          width: '90vw',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div className="modal-header" style={{ paddingBottom: '0.75rem' }}>
          <h3>📁 {modalTitle}</h3>
          <button className="close-btn" onClick={onClose} type="button">
            &times;
          </button>
        </div>

        {/* Quick Location Shortcuts */}
        {browseData?.shortcuts && browseData.shortcuts.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '0.5rem 0' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', alignSelf: 'center', marginRight: '4px' }}>
              {t('quickLocations')}:
            </span>
            {browseData.shortcuts.map((sc, idx) => (
              <button
                key={idx}
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                onClick={() => handleNavigate(sc.path)}
              >
                📍 {sc.label}
              </button>
            ))}
          </div>
        )}

        {/* Path navigation form */}
        <form onSubmit={handleFormSubmit} style={{ display: 'flex', gap: '6px', margin: '0.4rem 0' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleUp}
            disabled={!browseData?.parent_path || loading}
            title={t('btnUp')}
            style={{ padding: '0.4rem 0.75rem' }}
          >
            ⬆️ {t('btnUp')}
          </button>
          <input
            type="text"
            className="input-control"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            placeholder={
              import.meta.env.DEV
                ? "e.g. \\\\ZIMABOARD\\shares\\Photo or C:\\Media"
                : "e.g. /app/media_input or /app/media_output"
            }
            style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem' }}
          />
          <button type="submit" className="btn btn-primary" style={{ padding: '0.4rem 0.85rem' }} disabled={loading}>
            {loading ? '⏳' : `➡️ ${t('btnGo')}`}
          </button>
        </form>

        {/* Breadcrumb row */}
        <div style={{ margin: '0.3rem 0 0.6rem 0' }}>
          {renderBreadcrumbs()}
        </div>

        {/* Directory & Files listing container */}
        <div
          style={{
            flex: 1,
            minHeight: '260px',
            maxHeight: '380px',
            overflowY: 'auto',
            background: 'rgba(0, 0, 0, 0.18)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '0.5rem',
          }}
        >
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
              ⏳ {t('loadingDirectory')}
            </div>
          ) : browseData?.error ? (
            <div style={{ padding: '1rem', color: '#f87171', fontSize: '0.9rem' }}>
              ⚠️ {browseData.error}
              <div style={{ marginTop: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                You can still use the path entered above if it is accessible over the network.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {/* Directories */}
              {browseData?.directories.map((dir, idx) => (
                <div
                  key={`dir-${idx}`}
                  onClick={() => handleFolderClick(dir)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '0.45rem 0.65rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontSize: '1.1rem' }}>📁</span>
                  <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{dir}</span>
                </div>
              ))}

              {/* Files (if mode === 'file') */}
              {mode === 'file' &&
                browseData?.files.map((file, idx) => {
                  const isSelected = selectedFile === file;
                  return (
                    <div
                      key={`file-${idx}`}
                      onClick={() => handleFileClick(file)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '0.45rem 0.65rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        userSelect: 'none',
                        background: isSelected ? 'rgba(88, 166, 255, 0.2)' : 'transparent',
                        border: isSelected ? '1px solid var(--primary-color)' : '1px solid transparent',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <span style={{ fontSize: '1.1rem' }}>📄</span>
                      <span style={{ fontSize: '0.9rem' }}>{file}</span>
                    </div>
                  );
                })}

              {browseData?.directories.length === 0 && (mode !== 'file' || browseData?.files.length === 0) && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  📁 {t('emptyDirectory')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Selection */}
        <div
          className="modal-footer"
          style={{
            marginTop: '0.75rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {mode === 'file' ? 'Selected:' : 'Target:'}{' '}
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--primary-color)' }}>
              {mode === 'file' && selectedFile
                ? `${currentPath.replace(/[/\\]+$/, '')}/${selectedFile}`
                : pathInput || currentPath}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('btnCancel')}
            </button>
            <button
              type="button"
              className="btn btn-accent"
              onClick={handleConfirmSelect}
              disabled={mode === 'file' && !selectedFile && !pathInput.trim()}
            >
              ✓ {mode === 'file' ? t('btnSelectFile') : t('btnSelectFolder')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
