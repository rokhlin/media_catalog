import type { DateFormatStyle } from '../types/tree.types.js';

export interface ParsedDateInfo {
  isValid: boolean;
  standardValue: string; // ISO normalized: YYYY-MM-DD, YYYY-MM, or YYYY
  detectedFormat: string;
  year?: number;
  month?: number; // 1-12
  day?: number; // 1-31
  isoNormalized?: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_SHORT_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const MONTH_NAMES_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

const MONTH_SHORT_NAMES_RU = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'
];

/**
 * Universal date parser that detects format automatically:
 * - YYYY-MM-DD, YYYY-MM, YYYY
 * - DD.MM.YYYY, DD.MM, DD, MM.YYYY
 * - MM/DD/YYYY, MM/DD
 */
export function parseFlexibleDate(input?: string | null): ParsedDateInfo {
  if (!input || !input.trim()) {
    return { isValid: false, standardValue: '', detectedFormat: 'EMPTY' };
  }

  const str = input.trim();

  // 1. YYYY-MM-DD
  let match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const y = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const d = parseInt(match[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const std = `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
      return { isValid: true, standardValue: std, isoNormalized: std, detectedFormat: 'YYYY-MM-DD', year: y, month: m, day: d };
    }
  }

  // 2. YYYY-MM
  match = str.match(/^(\d{4})-(\d{1,2})$/);
  if (match) {
    const y = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (m >= 1 && m <= 12) {
      const std = `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}`;
      return { isValid: true, standardValue: std, isoNormalized: std, detectedFormat: 'YYYY-MM', year: y, month: m };
    }
  }

  // 3. YYYY (4 digits)
  match = str.match(/^(\d{4})$/);
  if (match) {
    const y = parseInt(match[1], 10);
    const std = y.toString().padStart(4, '0');
    return { isValid: true, standardValue: std, isoNormalized: std, detectedFormat: 'YYYY', year: y };
  }

  // 4. DD.MM.YYYY
  match = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (match) {
    const d = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const y = parseInt(match[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const std = `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
      return { isValid: true, standardValue: std, isoNormalized: std, detectedFormat: 'DD.MM.YYYY', year: y, month: m, day: d };
    }
  }

  // 5. MM.YYYY
  match = str.match(/^(\d{1,2})\.(\d{4})$/);
  if (match) {
    const m = parseInt(match[1], 10);
    const y = parseInt(match[2], 10);
    if (m >= 1 && m <= 12) {
      const std = `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}`;
      return { isValid: true, standardValue: std, isoNormalized: std, detectedFormat: 'MM.YYYY', year: y, month: m };
    }
  }

  // 6. DD.MM
  match = str.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (match) {
    const d = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const std = `--${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
      return { isValid: true, standardValue: std, detectedFormat: 'DD.MM', month: m, day: d };
    }
  }

  // 7. MM/DD/YYYY
  match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const m = parseInt(match[1], 10);
    const d = parseInt(match[2], 10);
    const y = parseInt(match[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const std = `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
      return { isValid: true, standardValue: std, isoNormalized: std, detectedFormat: 'MM/DD/YYYY', year: y, month: m, day: d };
    }
  }

  // 8. MM/DD
  match = str.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (match) {
    const m = parseInt(match[1], 10);
    const d = parseInt(match[2], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const std = `--${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
      return { isValid: true, standardValue: std, detectedFormat: 'MM/DD', month: m, day: d };
    }
  }

  // 9. DD (Single/double digit day)
  match = str.match(/^(\d{1,2})$/);
  if (match) {
    const d = parseInt(match[1], 10);
    if (d >= 1 && d <= 31) {
      return { isValid: true, standardValue: `---${d.toString().padStart(2, '0')}`, detectedFormat: 'DD', day: d };
    }
  }

  return { isValid: false, standardValue: str, detectedFormat: 'UNKNOWN' };
}

/**
 * Format a standard or flexible date string into the user's preferred display style.
 */
export function formatTreeDate(
  dateStr?: string | null,
  style: DateFormatStyle = 'YYYY-MM-DD',
  language: 'en' | 'ru' = 'en',
): string {
  if (!dateStr || !dateStr.trim()) return '';

  const parsed = parseFlexibleDate(dateStr);
  if (!parsed.isValid) return dateStr;

  const { year, month, day } = parsed;
  const isRu = language === 'ru';
  const monthNames = isRu ? MONTH_NAMES_RU : MONTH_NAMES;
  const monthShortNames = isRu ? MONTH_SHORT_NAMES_RU : MONTH_SHORT_NAMES;

  // Partial cases: only day
  if (!year && !month && day) {
    return isRu ? `${day}-й день` : `Day ${day}`;
  }

  // Partial cases: month & day (no year)
  if (!year && month && day) {
    const mName = monthNames[month - 1];
    switch (style) {
      case 'DD Month YYYY':
        return `${day} ${mName}`;
      case 'DD.MM.YYYY':
        return `${day.toString().padStart(2, '0')}.${month.toString().padStart(2, '0')}`;
      case 'MM/DD/YYYY':
        return `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}`;
      case 'YYYY-MM-DD':
      default:
        return `${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
  }

  // Partial cases: year only
  if (year && !month && !day) {
    return `${year}`;
  }

  // Partial cases: year and month (no day)
  if (year && month && !day) {
    const mName = monthShortNames[month - 1];
    switch (style) {
      case 'DD Month YYYY':
        return `${mName} ${year}`;
      case 'DD.MM.YYYY':
        return `${month.toString().padStart(2, '0')}.${year}`;
      case 'MM/DD/YYYY':
        return `${month.toString().padStart(2, '0')}/${year}`;
      case 'YYYY-MM-DD':
      default:
        return `${year}-${month.toString().padStart(2, '0')}`;
    }
  }

  // Full date: year, month, day
  if (year && month && day) {
    const dStr = day.toString().padStart(2, '0');
    const mStr = month.toString().padStart(2, '0');
    const mName = monthNames[month - 1];

    switch (style) {
      case 'DD Month YYYY':
        return `${day} ${mName} ${year}`;
      case 'DD.MM.YYYY':
        return `${dStr}.${mStr}.${year}`;
      case 'MM/DD/YYYY':
        return `${mStr}/${dStr}/${year}`;
      case 'YYYY-MM-DD':
      default:
        return `${year}-${mStr}-${dStr}`;
    }
  }

  return dateStr;
}

export interface CelebrationMatch {
  isUpcomingOrToday: boolean;
  isToday: boolean;
  daysRemaining: number;
  type: 'BIRTHDAY' | 'ANNIVERSARY' | 'MEMORIAL';
  label: string;
  title: string;
  icon: string;
  yearsCount?: number;
}

/**
 * Check if a date has an upcoming or current celebration within `daysThreshold` days.
 * Supports passing either a date string or a Person record with CelebrationBadgeConfig.
 */
export function checkCelebration(
  dateOrPerson?: string | { birth_date?: string | null; death_date?: string | null; is_living?: number | boolean } | null,
  typeOrConfig: 'BIRTHDAY' | 'ANNIVERSARY' | 'MEMORIAL' | any = 'BIRTHDAY',
  daysThreshold: number = 7,
  referenceDate: Date = new Date(),
  language: 'en' | 'ru' = 'en',
): CelebrationMatch | null {
  if (!dateOrPerson) return null;

  // If a person record is passed
  if (typeof dateOrPerson === 'object') {
    const config = typeof typeOrConfig === 'object' ? typeOrConfig : null;
    if (config && !config.enabled) return null;

    const isLiving = dateOrPerson.is_living !== 0 && dateOrPerson.is_living !== false;
    const threshold = config ? config.daysThreshold : daysThreshold;

    if (!isLiving) {
      if (config && !config.showMemorial) return null;
      if (dateOrPerson.death_date) {
        return checkCelebration(dateOrPerson.death_date, 'MEMORIAL', threshold, referenceDate, language);
      }
      return null;
    }

    if (config && !config.showBirthday) return null;
    if (dateOrPerson.birth_date) {
      return checkCelebration(dateOrPerson.birth_date, 'BIRTHDAY', threshold, referenceDate, language);
    }
    return null;
  }

  const dateStr = dateOrPerson;
  const type = typeof typeOrConfig === 'string' ? typeOrConfig : 'BIRTHDAY';
  const threshold = typeof typeOrConfig === 'object' ? typeOrConfig.daysThreshold : daysThreshold;

  const parsed = parseFlexibleDate(dateStr);
  if (!parsed.isValid || !parsed.month || !parsed.day) return null;

  const currentYear = referenceDate.getFullYear();
  const today = new Date(currentYear, referenceDate.getMonth(), referenceDate.getDate());

  // Event date this year
  let eventThisYear = new Date(currentYear, parsed.month - 1, parsed.day);
  let targetYear = currentYear;

  // If already passed more than 1 day this year, check next year's celebration
  const diffMs = eventThisYear.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    targetYear = currentYear + 1;
    eventThisYear = new Date(targetYear, parsed.month - 1, parsed.day);
  }

  const finalDiffDays = Math.round((eventThisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (finalDiffDays >= 0 && finalDiffDays <= threshold) {
    const isToday = finalDiffDays === 0;
    const yearsCount = parsed.year ? targetYear - parsed.year : undefined;
    const isRu = language === 'ru';

    let icon = '🎂';
    let label = isRu ? 'День рождения' : 'Birthday';
    if (type === 'ANNIVERSARY') {
      icon = '💍';
      label = isRu ? 'Годовщина свадьбы' : 'Wedding Anniversary';
    } else if (type === 'MEMORIAL') {
      icon = '🕯️';
      label = isRu ? 'День памяти' : 'Memorial';
    }

    let title: string;
    if (isRu) {
      const yrsStr = yearsCount ? ` (${yearsCount} лет)` : '';
      title = isToday
        ? `${icon} ${label} сегодня!${yrsStr}`
        : `${icon} ${label} через ${finalDiffDays} дн.${yrsStr}`;
    } else {
      const yrsStr = yearsCount ? ` (${yearsCount} yrs)` : '';
      title = isToday
        ? `${icon} ${label} Today!${yrsStr}`
        : `${icon} ${label} in ${finalDiffDays} ${finalDiffDays === 1 ? 'day' : 'days'}${yrsStr}`;
    }

    return {
      isUpcomingOrToday: true,
      isToday,
      daysRemaining: finalDiffDays,
      type: type as 'BIRTHDAY' | 'ANNIVERSARY' | 'MEMORIAL',
      label,
      title,
      icon,
      yearsCount,
    };
  }

  return null;
}
