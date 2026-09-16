import { useState, useEffect, useRef, useMemo } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';

export type LogFilterLevel = 'ALL' | 'INFO' | 'DEBUG' | 'WARN' | 'ERROR';

interface ParsedLogLine {
  id: string;
  raw: string;
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  context: string;
  message: string;
  details?: string;
  stack?: string;
}

export interface PipelineLogsProps {
  isOpen: boolean;
  onClose: () => void;
  logs?: string[];
  onRefreshLogs?: () => void;
  onClearLogs?: () => Promise<void> | void;
  isRefreshing?: boolean;
}

export default function PipelineLogs({
  isOpen,
  onClose,
  logs = [],
  onRefreshLogs,
  onClearLogs,
  isRefreshing = false,
}: PipelineLogsProps) {
  const { t } = useLanguage();
  const [autoScroll, setAutoScroll] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<LogFilterLevel>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedErrorIds, setExpandedErrorIds] = useState<Set<string>>(new Set());
  const consoleRef = useRef<HTMLDivElement | null>(null);

  // Parse raw log lines into structured entries
  const parsedLogs = useMemo<ParsedLogLine[]>(() => {
    if (!logs || logs.length === 0) return [];

    const result: ParsedLogLine[] = [];
    let currentEntry: ParsedLogLine | null = null;

    for (let i = 0; i < logs.length; i++) {
      const line = logs[i];
      if (!line || !line.trim()) continue;

      // Check if line starts with timestamp like [2026-08-30 18:30:15] or [18:30:15]
      const headerMatch = line.match(/^\[(.*?)\]\s*(?:\[(DEBUG|INFO|WARN|ERROR)\])?\s*(?:\[(.*?)\])?\s*(.*)$/i);

      if (headerMatch) {
        if (currentEntry) {
          result.push(currentEntry);
        }

        const timestampStr = headerMatch[1] || '';
        let levelStr = (headerMatch[2] || '').toUpperCase();
        const contextStr = headerMatch[3] || '';
        let messageStr = headerMatch[4] || '';

        // If level wasn't explicitly in [LEVEL] bracket, infer from message or default to INFO
        if (!levelStr) {
          const lower = line.toLowerCase();
          if (lower.includes('error') || lower.includes('failed') || lower.includes('exception') || lower.includes('fatal')) {
            levelStr = 'ERROR';
          } else if (lower.includes('warn')) {
            levelStr = 'WARN';
          } else if (lower.includes('debug') || lower.includes('trace')) {
            levelStr = 'DEBUG';
          } else {
            levelStr = 'INFO';
          }
        }

        const validLevel = (['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(levelStr)
          ? levelStr
          : 'INFO') as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

        currentEntry = {
          id: `log-${i}`,
          raw: line,
          timestamp: timestampStr,
          level: validLevel,
          context: contextStr,
          message: messageStr,
        };
      } else if (currentEntry) {
        // Multi-line continuation (e.g. Details: or Stack Trace:)
        if (line.includes('Stack Trace:') || line.includes('Traceback (most recent call last):') || line.trim().startsWith('at ') || line.trim().startsWith('File "')) {
          currentEntry.stack = (currentEntry.stack ? currentEntry.stack + '\n' : '') + line;
        } else if (line.includes('Details:') || line.includes('Diagnosis:') || line.includes('Suggestion:')) {
          currentEntry.details = (currentEntry.details ? currentEntry.details + '\n' : '') + line;
        } else {
          currentEntry.details = (currentEntry.details ? currentEntry.details + '\n' : '') + line;
        }
        currentEntry.raw += '\n' + line;
      } else {
        // Standalone unformatted line
        const lower = line.toLowerCase();
        const level = lower.includes('error') || lower.includes('failed')
          ? 'ERROR'
          : lower.includes('warn')
          ? 'WARN'
          : lower.includes('debug')
          ? 'DEBUG'
          : 'INFO';

        result.push({
          id: `log-${i}`,
          raw: line,
          timestamp: '',
          level: level as any,
          context: '',
          message: line,
        });
      }
    }

    if (currentEntry) {
      result.push(currentEntry);
    }

    return result;
  }, [logs]);

  // Counts for filters
  const counts = useMemo(() => {
    const total = parsedLogs.length;
    let info = 0;
    let debug = 0;
    let warn = 0;
    let error = 0;

    for (const log of parsedLogs) {
      if (log.level === 'INFO') info++;
      else if (log.level === 'DEBUG') debug++;
      else if (log.level === 'WARN') warn++;
      else if (log.level === 'ERROR') error++;
    }

    return { total, info, debug, warn, error };
  }, [parsedLogs]);

  // Filtered and searched logs
  const filteredLogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return parsedLogs.filter((entry) => {
      // Level filter
      if (selectedFilter !== 'ALL') {
        if (selectedFilter === 'WARN' && entry.level !== 'WARN') return false;
        if (selectedFilter === 'ERROR' && entry.level !== 'ERROR') return false;
        if (selectedFilter === 'INFO' && entry.level !== 'INFO') return false;
        if (selectedFilter === 'DEBUG' && entry.level !== 'DEBUG') return false;
      }

      // Search filter
      if (query) {
        const inMessage = entry.message.toLowerCase().includes(query);
        const inContext = entry.context.toLowerCase().includes(query);
        const inDetails = entry.details ? entry.details.toLowerCase().includes(query) : false;
        const inStack = entry.stack ? entry.stack.toLowerCase().includes(query) : false;
        return inMessage || inContext || inDetails || inStack;
      }

      return true;
    });
  }, [parsedLogs, selectedFilter, searchQuery]);

  // Auto-scroll when filtered logs update
  useEffect(() => {
    if (isOpen && autoScroll && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll, isOpen]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Save logs to a downloadable file
  const handleSaveLogs = () => {
    if (!filteredLogs || filteredLogs.length === 0) return;
    const content = filteredLogs.map((l) => l.raw).join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    a.href = url;
    a.download = `pipeline_logs_${selectedFilter.toLowerCase()}_${timestamp}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Copy logs to clipboard
  const handleCopyLogs = async () => {
    if (!filteredLogs || filteredLogs.length === 0) return;
    try {
      await navigator.clipboard.writeText(filteredLogs.map((l) => l.raw).join('\n'));
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy logs to clipboard:', err);
    }
  };

  // Clear logs action
  const handleClearLogs = async () => {
    if (!onClearLogs) return;
    if (window.confirm(t('confirmClearLogs'))) {
      setIsClearing(true);
      try {
        await onClearLogs();
        setExpandedErrorIds(new Set());
      } finally {
        setIsClearing(false);
      }
    }
  };

  // Toggle single error details expansion
  const toggleErrorExpansion = (id: string) => {
    setExpandedErrorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle all error details expansion
  const toggleAllDetails = () => {
    const hasExpanded = expandedErrorIds.size > 0;
    if (hasExpanded) {
      setExpandedErrorIds(new Set());
    } else {
      const allWithDetails = new Set(
        filteredLogs.filter((l) => l.details || l.stack || l.level === 'ERROR').map((l) => l.id)
      );
      setExpandedErrorIds(allWithDetails);
    }
  };

  if (!isOpen) return null;

  const hasLogs = Boolean(parsedLogs.length > 0);
  const hasDetailedLogs = filteredLogs.some((l) => l.details || l.stack || l.level === 'ERROR');

  return (
    <div className="modal-overlay active" onClick={onClose} id="pipeline-logs-modal-overlay">
      <div
        className="modal-card logs-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '1080px',
          width: '94vw',
          height: '88vh',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '1.4rem',
          gap: '0.8rem',
        }}
      >
        {/* Header */}
        <div
          className="modal-header"
          style={{
            paddingBottom: '0.6rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.6rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📋 {t('logsTitle')}
            </h2>
            <span className="badge-pill badge-pill-secondary" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}>
              {filteredLogs.length} / {counts.total} {t('totalEntriesLabel')}
            </span>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <label className="checkbox-group" style={{ fontSize: '0.82rem', marginRight: '0.3rem' }}>
              <input
                type="checkbox"
                id="modal-auto-scroll"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              {t('autoScroll')}
            </label>

            {hasDetailedLogs && (
              <button
                className="btn btn-secondary"
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                onClick={toggleAllDetails}
                type="button"
                title="Expand or collapse all error details"
              >
                {expandedErrorIds.size > 0 ? `▲ ${t('hideErrorDetails')}` : `▼ ${t('showErrorDetails')}`}
              </button>
            )}

            {/* Save / Download logs button */}
            <button
              className="btn btn-secondary"
              style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
              onClick={handleSaveLogs}
              disabled={filteredLogs.length === 0}
              type="button"
              title={t('btnSaveLogs')}
            >
              💾 {t('btnSaveLogs')}
            </button>

            {/* Copy to clipboard */}
            <button
              className="btn btn-secondary"
              style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
              onClick={handleCopyLogs}
              disabled={filteredLogs.length === 0}
              type="button"
              title="Copy to clipboard"
            >
              {isCopied ? '✓ Copied' : '📋 Copy'}
            </button>

            {/* Clear logs button */}
            {onClearLogs && (
              <button
                className="btn btn-secondary"
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', color: '#f87171' }}
                onClick={handleClearLogs}
                disabled={!hasLogs || isClearing}
                type="button"
                title={t('btnClearLogs')}
              >
                🗑️ {t('btnClearLogs')}
              </button>
            )}

            {/* Refresh button */}
            {onRefreshLogs && (
              <button
                className="btn btn-secondary"
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                onClick={onRefreshLogs}
                disabled={isRefreshing}
                type="button"
                title={t('btnRefreshLogs')}
              >
                {isRefreshing ? t('btnRefreshingLogs') : `🔄 ${t('btnRefreshLogs')}`}
              </button>
            )}

            {/* Close button */}
            <button
              className="close-btn"
              onClick={onClose}
              type="button"
              title={t('close')}
              style={{ fontSize: '1.4rem', lineHeight: 1, marginLeft: '0.2rem' }}
            >
              &times;
            </button>
          </div>
        </div>

        {/* Filter Toolbar: Split into Debug / Info / Warn / Error & Search Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.8rem',
            flexWrap: 'wrap',
          }}
        >
          {/* Level Filter Buttons */}
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`filter-btn ${selectedFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setSelectedFilter('ALL')}
              style={{
                padding: '0.3rem 0.75rem',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: '1px solid var(--border-color)',
                background: selectedFilter === 'ALL' ? 'var(--primary, #3b82f6)' : 'rgba(255, 255, 255, 0.05)',
                color: selectedFilter === 'ALL' ? '#ffffff' : 'var(--text-main, #e2e8f0)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {t('filterAll')} <span style={{ opacity: 0.8, fontSize: '0.75rem' }}>({counts.total})</span>
            </button>

            <button
              type="button"
              className={`filter-btn ${selectedFilter === 'INFO' ? 'active' : ''}`}
              onClick={() => setSelectedFilter('INFO')}
              style={{
                padding: '0.3rem 0.75rem',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: '1px solid var(--border-color)',
                background: selectedFilter === 'INFO' ? '#059669' : 'rgba(255, 255, 255, 0.05)',
                color: selectedFilter === 'INFO' ? '#ffffff' : '#34d399',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              🟢 {t('filterInfo')} <span style={{ opacity: 0.8, fontSize: '0.75rem' }}>({counts.info})</span>
            </button>

            <button
              type="button"
              className={`filter-btn ${selectedFilter === 'DEBUG' ? 'active' : ''}`}
              onClick={() => setSelectedFilter('DEBUG')}
              style={{
                padding: '0.3rem 0.75rem',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: '1px solid var(--border-color)',
                background: selectedFilter === 'DEBUG' ? '#6366f1' : 'rgba(255, 255, 255, 0.05)',
                color: selectedFilter === 'DEBUG' ? '#ffffff' : '#a5b4fc',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              🟣 {t('filterDebug')} <span style={{ opacity: 0.8, fontSize: '0.75rem' }}>({counts.debug})</span>
            </button>

            <button
              type="button"
              className={`filter-btn ${selectedFilter === 'WARN' ? 'active' : ''}`}
              onClick={() => setSelectedFilter('WARN')}
              style={{
                padding: '0.3rem 0.75rem',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: '1px solid var(--border-color)',
                background: selectedFilter === 'WARN' ? '#d97706' : 'rgba(255, 255, 255, 0.05)',
                color: selectedFilter === 'WARN' ? '#ffffff' : '#fbbf24',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              🟡 {t('filterWarn')} <span style={{ opacity: 0.8, fontSize: '0.75rem' }}>({counts.warn})</span>
            </button>

            <button
              type="button"
              className={`filter-btn ${selectedFilter === 'ERROR' ? 'active' : ''}`}
              onClick={() => setSelectedFilter('ERROR')}
              style={{
                padding: '0.3rem 0.75rem',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: '1px solid var(--border-color)',
                background: selectedFilter === 'ERROR' ? '#dc2626' : 'rgba(255, 255, 255, 0.05)',
                color: selectedFilter === 'ERROR' ? '#ffffff' : '#f87171',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              🔴 {t('filterError')} <span style={{ opacity: 0.8, fontSize: '0.75rem' }}>({counts.error})</span>
            </button>
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '360px' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchLogsPlaceholder')}
              style={{
                width: '100%',
                padding: '0.4rem 2rem 0.4rem 0.75rem',
                fontSize: '0.82rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--card-bg, rgba(15, 23, 42, 0.7))',
                color: 'var(--text-main, #f8fafc)',
                outline: 'none',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                &times;
              </button>
            )}
          </div>
        </div>

        {/* Console content */}
        <div
          className="console-container"
          id="console"
          ref={consoleRef}
          style={{
            flex: 1,
            height: '100%',
            minHeight: '340px',
            margin: '0',
            overflowY: 'auto',
            borderRadius: '12px',
            background: 'var(--console-bg, #05070c)',
            padding: '0.9rem',
            boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.6)',
          }}
        >
          {filteredLogs.length > 0 ? (
            filteredLogs.map((entry) => {
              const isError = entry.level === 'ERROR';
              const isWarn = entry.level === 'WARN';
              const isDebug = entry.level === 'DEBUG';
              const hasExtra = Boolean(entry.details || entry.stack || isError);
              const isExpanded = expandedErrorIds.has(entry.id);

              return (
                <div
                  key={entry.id}
                  className={`console-entry ${isError ? 'console-entry-error' : isWarn ? 'console-entry-warn' : isDebug ? 'console-entry-debug' : 'console-entry-info'}`}
                  style={{
                    marginBottom: '0.45rem',
                    padding: '0.45rem 0.6rem',
                    borderRadius: '6px',
                    background: isError
                      ? 'rgba(239, 68, 68, 0.08)'
                      : isWarn
                      ? 'rgba(245, 158, 11, 0.06)'
                      : isDebug
                      ? 'rgba(99, 102, 241, 0.04)'
                      : 'transparent',
                    borderLeft: isError
                      ? '3px solid #ef4444'
                      : isWarn
                      ? '3px solid #f59e0b'
                      : isDebug
                      ? '3px solid #818cf8'
                      : '3px solid transparent',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: '0.55rem',
                      flexWrap: 'wrap',
                      fontSize: '0.84rem',
                      lineHeight: '1.45',
                    }}
                  >
                    {/* Timestamp */}
                    {entry.timestamp && (
                      <span style={{ color: 'var(--text-muted, #64748b)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                        [{entry.timestamp}]
                      </span>
                    )}

                    {/* Level Pill */}
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '0.1rem 0.45rem',
                        borderRadius: '4px',
                        letterSpacing: '0.03em',
                        color: '#ffffff',
                        background:
                          entry.level === 'ERROR'
                            ? '#dc2626'
                            : entry.level === 'WARN'
                            ? '#d97706'
                            : entry.level === 'DEBUG'
                            ? '#6366f1'
                            : '#059669',
                      }}
                    >
                      {entry.level}
                    </span>

                    {/* Context Tag */}
                    {entry.context && (
                      <span style={{ color: isError ? '#fca5a5' : '#38bdf8', fontWeight: 600, fontSize: '0.8rem' }}>
                        [{entry.context}]
                      </span>
                    )}

                    {/* Message Body */}
                    <span
                      style={{
                        flex: 1,
                        color: isError ? '#fca5a5' : isWarn ? '#fde68a' : isDebug ? '#c7d2fe' : 'var(--console-text, #38bdf8)',
                        fontWeight: isError ? 600 : 400,
                        wordBreak: 'break-word',
                      }}
                    >
                      {entry.message}
                    </span>

                    {/* Details Expansion Toggle */}
                    {hasExtra && (
                      <button
                        type="button"
                        onClick={() => toggleErrorExpansion(entry.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: isError ? '#f87171' : 'var(--text-muted, #94a3b8)',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          padding: '0 0.3rem',
                        }}
                      >
                        {isExpanded ? `▲ ${t('hideErrorDetails')}` : `▼ ${t('showErrorDetails')}`}
                      </button>
                    )}
                  </div>

                  {/* Expanded Detailed Error Explanation & Stack Trace */}
                  {hasExtra && isExpanded && (
                    <div
                      style={{
                        marginTop: '0.5rem',
                        padding: '0.6rem 0.8rem',
                        borderRadius: '6px',
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        fontSize: '0.8rem',
                        fontFamily: 'monospace',
                        color: '#e2e8f0',
                      }}
                    >
                      {entry.details && (
                        <div style={{ marginBottom: entry.stack ? '0.5rem' : 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          <span style={{ color: '#fbbf24', fontWeight: 600 }}>📋 Diagnostic Details:</span>
                          <div style={{ marginTop: '0.2rem', color: '#cbd5e1' }}>{entry.details}</div>
                        </div>
                      )}

                      {entry.stack && (
                        <div style={{ marginTop: '0.4rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          <span style={{ color: '#f87171', fontWeight: 600 }}>🔍 {t('stackTraceLabel')}:</span>
                          <pre
                            style={{
                              margin: '0.3rem 0 0 0',
                              padding: '0.4rem 0.6rem',
                              borderRadius: '4px',
                              background: 'rgba(0, 0, 0, 0.6)',
                              color: '#fca5a5',
                              fontSize: '0.75rem',
                              lineHeight: '1.4',
                              overflowX: 'auto',
                            }}
                          >
                            {entry.stack}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="console-line" style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '1rem 0.5rem' }}>
              {hasLogs ? t('noLogsMatchFilter') : t('noLogsAvailable')}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="modal-footer"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '0.5rem',
            borderTop: '1px solid var(--border-color)',
            flexWrap: 'wrap',
            gap: '0.6rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <span>{autoScroll ? '🟢 Auto-scroll active' : '⏸️ Auto-scroll paused'}</span>
            <span>•</span>
            <span>
              Showing {filteredLogs.length} of {parsedLogs.length} lines
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ padding: '0.45rem 1.1rem', fontSize: '0.85rem' }}
            >
              {t('btnClose')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
