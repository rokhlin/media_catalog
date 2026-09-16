import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { GalleryMediaFile } from '../../models/media';
import { useLanguage } from '../../i18n/LanguageContext';
import { getMediaDate, formatDateKey, getThumbnailSrc, type CalendarDay } from './calendarUtils';
import './TimelineCalendarView.css';

export interface TimelineCalendarViewProps {
  files: GalleryMediaFile[];
  onSelectMedia: (file: GalleryMediaFile) => void;
  className?: string;
}

export { getMediaDate, formatDateKey, getThumbnailSrc, type CalendarDay };

export const TimelineCalendarView: React.FC<TimelineCalendarViewProps> = ({
  files,
  onSelectMedia,
  className = '',
}) => {
  const { language, t } = useLanguage();

  // Index files by date key (YYYY-MM-DD)
  const { filesByDate, availableYears, initialYear, initialMonth } = useMemo(() => {
    const map = new Map<string, GalleryMediaFile[]>();
    const yearsSet = new Set<number>();
    let latestDate: Date | null = null;

    for (const file of files) {
      const d = getMediaDate(file);
      if (!d) continue;

      const key = formatDateKey(d);
      const list = map.get(key);
      if (list) {
        list.push(file);
      } else {
        map.set(key, [file]);
      }

      yearsSet.add(d.getFullYear());
      if (!latestDate || d.getTime() > latestDate.getTime()) {
        latestDate = d;
      }
    }

    const currentYear = new Date().getFullYear();
    yearsSet.add(currentYear);
    const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);

    const initY = latestDate ? latestDate.getFullYear() : currentYear;
    const initM = latestDate ? latestDate.getMonth() : new Date().getMonth();

    return {
      filesByDate: map,
      availableYears: sortedYears,
      initialYear: initY,
      initialMonth: initM,
    };
  }, [files]);

  // Current viewed month and year
  const [currentYear, setCurrentYear] = useState(initialYear);
  const [currentMonth, setCurrentMonth] = useState(initialMonth); // 0-indexed

  // Day preview modal state
  const [selectedDayModal, setSelectedDayModal] = useState<CalendarDay | null>(null);

  // Close modal on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedDayModal) {
        setSelectedDayModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDayModal]);

  // Month navigation handlers
  const handlePrevMonth = useCallback(() => {
    setCurrentMonth((prev) => {
      if (prev === 0) {
        setCurrentYear((y) => y - 1);
        return 11;
      }
      return prev - 1;
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentMonth((prev) => {
      if (prev === 11) {
        setCurrentYear((y) => y + 1);
        return 0;
      }
      return prev + 1;
    });
  }, []);

  const handleGoToday = useCallback(() => {
    const today = new Date();
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
  }, []);

  // Compute grid calendar days
  const calendarDays = useMemo<CalendarDay[]>(() => {
    const todayKey = formatDateKey(new Date());
    const days: CalendarDay[] = [];

    // First day of current month
    const firstDay = new Date(currentYear, currentMonth, 1);
    // 0 = Sunday, 1 = Monday, ... 6 = Saturday
    // Convert to Monday-first: Monday = 0, ... Sunday = 6
    const startDayOfWeek = (firstDay.getDay() + 6) % 7;

    // Number of days in current month
    const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    // Days in previous month
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    // 1. Trailing days from previous month
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const prevDate = new Date(currentYear, currentMonth - 1, daysInPrevMonth - i);
      const key = formatDateKey(prevDate);
      days.push({
        date: prevDate,
        dateKey: key,
        dayNumber: prevDate.getDate(),
        isCurrentMonth: false,
        isToday: key === todayKey,
        files: filesByDate.get(key) || [],
      });
    }

    // 2. Days of current month
    for (let day = 1; day <= daysInCurrentMonth; day++) {
      const date = new Date(currentYear, currentMonth, day);
      const key = formatDateKey(date);
      days.push({
        date,
        dateKey: key,
        dayNumber: day,
        isCurrentMonth: true,
        isToday: key === todayKey,
        files: filesByDate.get(key) || [],
      });
    }

    // 3. Leading days for next month to complete 7-column grid
    const remainingDays = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remainingDays; i++) {
      const nextDate = new Date(currentYear, currentMonth + 1, i);
      const key = formatDateKey(nextDate);
      days.push({
        date: nextDate,
        dateKey: key,
        dayNumber: i,
        isCurrentMonth: false,
        isToday: key === todayKey,
        files: filesByDate.get(key) || [],
      });
    }

    return days;
  }, [currentYear, currentMonth, filesByDate]);

  // Total photos in the active month
  const totalMonthPhotos = useMemo(() => {
    return calendarDays
      .filter((d) => d.isCurrentMonth)
      .reduce((sum, d) => sum + d.files.length, 0);
  }, [calendarDays]);

  // Month names localized
  const monthNames = useMemo(() => {
    if (language === 'ru') {
      return [
        'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
      ];
    }
    return [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
  }, [language]);

  // Weekdays (Monday first)
  const weekdays = [
    { label: t('calendarWeekdayMon'), isWeekend: false },
    { label: t('calendarWeekdayTue'), isWeekend: false },
    { label: t('calendarWeekdayWed'), isWeekend: false },
    { label: t('calendarWeekdayThu'), isWeekend: false },
    { label: t('calendarWeekdayFri'), isWeekend: false },
    { label: t('calendarWeekdaySat'), isWeekend: true },
    { label: t('calendarWeekdaySun'), isWeekend: true },
  ];

  // Helper to format date for modal header
  const formatModalDate = (d: Date) => {
    const loc = language === 'ru' ? 'ru-RU' : 'en-US';
    return d.toLocaleDateString(loc, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };



  return (
    <div className={`timeline-calendar-wrapper ${className}`.trim()}>
      {/* Calendar Navigation & Header */}
      <div className="timeline-calendar-header">
        <div className="timeline-calendar-nav">
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={handlePrevMonth}
            title={t('calendarMonthPrev')}
            aria-label={t('calendarMonthPrev')}
          >
            ◀
          </button>
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={handleGoToday}
            title={t('calendarToday')}
          >
            🗓️ {t('calendarToday')}
          </button>
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={handleNextMonth}
            title={t('calendarMonthNext')}
            aria-label={t('calendarMonthNext')}
          >
            ▶
          </button>

          <div className="calendar-select-group">
            <select
              className="calendar-select"
              value={currentMonth}
              onChange={(e) => setCurrentMonth(Number(e.target.value))}
              aria-label="Select Month"
            >
              {monthNames.map((name, idx) => (
                <option key={idx} value={idx}>
                  {name}
                </option>
              ))}
            </select>

            <select
              className="calendar-select"
              value={currentYear}
              onChange={(e) => setCurrentYear(Number(e.target.value))}
              aria-label="Select Year"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="calendar-stats-pill">
          <span>📷</span>
          <span>
            {totalMonthPhotos} {t('calendarPhotosThisMonth')}
          </span>
        </div>
      </div>

      {/* Weekday Labels Header */}
      <div className="timeline-calendar-weekdays">
        {weekdays.map((wd, i) => (
          <div
            key={i}
            className={`calendar-weekday-col ${wd.isWeekend ? 'weekend' : ''}`}
          >
            {wd.label}
          </div>
        ))}
      </div>

      {/* Calendar Month Grid */}
      <div className="timeline-calendar-grid">
        {calendarDays.map((day, idx) => {
          const count = day.files.length;
          const hasPhotos = count > 0;
          const hasOverflowBadge = count > 10;
          const hasOnlyVideos = hasPhotos && day.files.every((f) => f.is_video);
          const mediaIcon = hasOnlyVideos ? '🎥' : '📷';

          return (
            <div
              key={`${day.dateKey}_${idx}`}
              className={`calendar-day-cell ${
                !day.isCurrentMonth ? 'other-month' : ''
              } ${day.isToday ? 'is-today' : ''} ${hasPhotos ? 'has-photos' : ''}`}
              onClick={() => {
                if (hasPhotos) {
                  setSelectedDayModal(day);
                }
              }}
              title={
                hasPhotos
                  ? `${count} ${t('calendarPhotosOnDate')} ${day.dateKey}`
                  : undefined
              }
            >
              <div className="calendar-day-header">
                <span className="calendar-day-number">{day.dayNumber}</span>
              </div>

              {/* Bottom-left photo count badge */}
              <div className="calendar-day-footer">
                {hasPhotos && (
                  <span
                    className={`calendar-photo-badge ${
                      hasOverflowBadge ? 'count-overflow' : ''
                    }`}
                    title={
                      hasOverflowBadge
                        ? `${count} photos`
                        : `${count} photos`
                    }
                  >
                    {mediaIcon} {count}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Day Photos Details Modal */}
      {selectedDayModal && (
        <div
          className="calendar-day-modal-overlay"
          onClick={() => setSelectedDayModal(null)}
        >
          <div
            className="calendar-day-modal-content"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="calendar-day-modal-header">
              <div className="calendar-day-modal-title">
                <span>📅</span>
                <span>
                  {t('calendarDayModalTitle')}{' '}
                  {formatModalDate(selectedDayModal.date)}
                </span>
                <span className="calendar-photo-badge count-overflow">
                  {selectedDayModal.files.length}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '0.9rem', borderRadius: 8 }}
                onClick={() => setSelectedDayModal(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="calendar-day-modal-body">
              {selectedDayModal.files.map((file, idx) => (
                <div
                  key={idx}
                  className="calendar-day-grid-item"
                  onClick={() => {
                    setSelectedDayModal(null);
                    onSelectMedia(file);
                  }}
                  title={`${file.filename} - ${t('clickToView')}`}
                >
                  <img
                    src={getThumbnailSrc(file, 360)}
                    alt={file.filename}
                    loading="lazy"
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = 'none';
                      const fallback = target.nextElementSibling as HTMLElement;
                      if (fallback) fallback.style.display = 'flex';
                    }}
                  />
                  <div
                    className="calendar-grid-fallback photo-placeholder"
                    style={{
                      display: 'none',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%',
                      height: '100%',
                      flexDirection: 'column',
                      background: file.is_video
                        ? 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)'
                        : 'linear-gradient(135deg, #1e293b, #0f172a)',
                      color: file.is_video ? '#c7d2fe' : 'var(--text-muted, #94a3b8)',
                    }}
                  >
                    <span style={{ fontSize: '1.8rem' }}>{file.is_video ? '🎥' : '📷'}</span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        marginTop: '4px',
                        textAlign: 'center',
                        padding: '0 4px',
                        maxWidth: '90%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {file.filename}
                    </span>
                  </div>
                  {file.is_video && (
                    <span className="calendar-day-grid-item-badge">
                      🎥 {file.duration ? `${Math.round(file.duration)}s` : 'Video'}
                    </span>
                  )}
                  {file.face_count && file.face_count > 0 ? (
                    <span
                      className="calendar-day-grid-item-badge"
                      style={{ bottom: file.is_video ? '28px' : '6px' }}
                    >
                      👤 {file.face_count}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimelineCalendarView;
