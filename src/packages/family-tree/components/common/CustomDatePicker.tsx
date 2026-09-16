import { useState, useEffect, useRef, useMemo } from 'react';
import { parseFlexibleDate } from '../../utils/dateUtils.js';
import { useLanguage } from '../../../../i18n/LanguageContext.js';

interface CustomDatePickerProps {
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  autoFocus?: boolean;
}

export const CustomDatePicker = ({
  value,
  onChange,
  placeholder = 'e.g. 1985-04-12, 12.04.1985, 1985...',
  disabled = false,
  style,
  autoFocus = false,
}: CustomDatePickerProps) => {
  const { language, t } = useLanguage();
  const [inputValue, setInputValue] = useState(value || '');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync internal input text when external prop changes
  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  const parsed = useMemo(() => parseFlexibleDate(inputValue), [inputValue]);

  // Calendar navigation state
  const [viewYear, setViewYear] = useState(() => {
    if (parsed.isValid && parsed.year) return parsed.year;
    return new Date().getFullYear();
  });

  const [viewMonth, setViewMonth] = useState(() => {
    if (parsed.isValid && parsed.month) return parsed.month - 1;
    return new Date().getMonth();
  });

  // Close calendar popover on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setInputValue(text);
    const p = parseFlexibleDate(text);
    if (p.isValid) {
      onChange(p.standardValue);
      if (p.year) setViewYear(p.year);
      if (p.month) setViewMonth(p.month - 1);
    } else if (!text.trim()) {
      onChange('');
    }
  };

  const handleBlur = () => {
    const p = parseFlexibleDate(inputValue);
    if (p.isValid) {
      // Standardize input field representation
      setInputValue(p.standardValue);
      onChange(p.standardValue);
    }
  };

  const handleSelectDay = (day: number) => {
    const mStr = (viewMonth + 1).toString().padStart(2, '0');
    const dStr = day.toString().padStart(2, '0');
    const std = `${viewYear}-${mStr}-${dStr}`;
    setInputValue(std);
    onChange(std);
    setIsOpen(false);
  };

  const handleSetYearOnly = () => {
    const std = viewYear.toString();
    setInputValue(std);
    onChange(std);
    setIsOpen(false);
  };

  const handleSetMonthYearOnly = () => {
    const mStr = (viewMonth + 1).toString().padStart(2, '0');
    const std = `${viewYear}-${mStr}`;
    setInputValue(std);
    onChange(std);
    setIsOpen(false);
  };

  // Calendar month days calculation
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayWeekday = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sunday
  // Adjust so Monday is 0:
  const firstDayIndex = (firstDayWeekday + 6) % 7;

  const monthNames = language === 'ru' ? [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ] : [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const weekDays = language === 'ru'
    ? ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
    : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          style={{
            width: '100%',
            background: 'var(--input-bg)',
            border: parsed.isValid
              ? '1px solid var(--border-color)'
              : inputValue.trim()
                ? '1px solid #f59e0b'
                : '1px solid var(--border-color)',
            borderRadius: 8,
            padding: '8px 36px 8px 12px',
            color: 'var(--text-primary)',
            fontSize: 13,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        {/* Calendar toggle button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          style={{
            position: 'absolute',
            right: 8,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: 4,
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title={t('calendarPickerTooltip')}
        >
          📅
        </button>
      </div>

      {/* Auto-format detection helper tag */}
      {inputValue.trim() && (
        <div
          style={{
            fontSize: 10,
            marginTop: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: parsed.isValid ? 'var(--primary-color, #6366f1)' : '#f59e0b',
          }}
        >
          {parsed.isValid ? (
            <span>
              ✓ {t('dateFormatDetected')} <strong>{parsed.detectedFormat}</strong> ({language === 'ru' ? 'сохранено как' : 'saved as'} <code>{parsed.standardValue}</code>)
            </span>
          ) : (
            <span>⚠️ {t('unrecognizedDateFormat')}</span>
          )}
        </div>
      )}

      {/* Calendar Dropdown Modal */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 150,
            background: 'var(--card-bg-solid)',
            border: '1px solid var(--border-color)',
            borderRadius: 12,
            boxShadow: 'var(--shadow-modal)',
            padding: 14,
            width: 280,
            backdropFilter: 'blur(16px)',
          }}
        >
          {/* Header navigation (Year & Month selectors) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button
              type="button"
              style={{
                background: 'var(--nav-tab-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                padding: '3px 8px',
                cursor: 'pointer',
                fontSize: 11,
              }}
              onClick={() => {
                if (viewMonth === 0) {
                  setViewMonth(11);
                  setViewYear(viewYear - 1);
                } else {
                  setViewMonth(viewMonth - 1);
                }
              }}
            >
              ◀
            </button>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(parseInt(e.target.value, 10))}
                style={{
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  borderRadius: 6,
                  padding: '2px 6px',
                  fontSize: 12,
                  outline: 'none',
                }}
              >
                {monthNames.map((m, idx) => (
                  <option key={m} value={idx}>
                    {m.substring(0, 3)}
                  </option>
                ))}
              </select>

              <input
                type="number"
                value={viewYear}
                onChange={(e) => setViewYear(parseInt(e.target.value, 10) || 2000)}
                style={{
                  width: 64,
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  borderRadius: 6,
                  padding: '2px 6px',
                  fontSize: 12,
                  outline: 'none',
                }}
              />
            </div>

            <button
              type="button"
              style={{
                background: 'var(--nav-tab-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                padding: '3px 8px',
                cursor: 'pointer',
                fontSize: 11,
              }}
              onClick={() => {
                if (viewMonth === 11) {
                  setViewMonth(0);
                  setViewYear(viewYear + 1);
                } else {
                  setViewMonth(viewMonth + 1);
                }
              }}
            >
              ▶
            </button>
          </div>

          {/* Weekday headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center', marginBottom: 6 }}>
            {weekDays.map((d) => (
              <div key={d} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {Array.from({ length: firstDayIndex }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isSelected = parsed.isValid && parsed.year === viewYear && parsed.month === viewMonth + 1 && parsed.day === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  style={{
                    background: isSelected ? 'var(--primary-color, #6366f1)' : 'transparent',
                    color: isSelected ? '#ffffff' : 'var(--text-primary)',
                    border: 'none',
                    borderRadius: 6,
                    padding: '5px 0',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontWeight: isSelected ? 700 : 400,
                    transition: 'all 0.1s ease',
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Partial date shortcuts */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 12,
              paddingTop: 8,
              borderTop: '1px solid var(--border-color)',
            }}
          >
            <button
              type="button"
              onClick={handleSetYearOnly}
              style={{
                background: 'var(--nav-tab-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                padding: '3px 8px',
                fontSize: 10,
                cursor: 'pointer',
              }}
              title={t('saveApproximateYear')}
            >
              {language === 'ru' ? `Год: ${viewYear}` : `Year: ${viewYear}`}
            </button>

            <button
              type="button"
              onClick={handleSetMonthYearOnly}
              style={{
                background: 'var(--nav-tab-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                padding: '3px 8px',
                fontSize: 10,
                cursor: 'pointer',
              }}
              title={t('saveMonthYear')}
            >
              {monthNames[viewMonth].substring(0, 3)} {viewYear}
            </button>

            <button
              type="button"
              onClick={() => {
                setInputValue('');
                onChange('');
                setIsOpen(false);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--error-color, #ef4444)',
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              {t('btnClearDate')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
