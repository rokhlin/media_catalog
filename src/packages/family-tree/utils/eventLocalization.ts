import type { Language } from '../../../models/i18n.js';

/**
 * Localizes Family Tree life event types (e.g. BIRTH, MARRIAGE, CHILD_BORN).
 */
export function localizeEventType(eventType: string, language: Language = 'en'): string {
  if (!eventType) return '';

  if (language === 'ru') {
    switch (eventType.toUpperCase()) {
      case 'BIRTH':
        return 'Рождение';
      case 'DEATH':
        return 'Кончина';
      case 'MARRIAGE':
        return 'Брак';
      case 'DIVORCE':
        return 'Развод';
      case 'RELATIONSHIP':
        return 'Отношения';
      case 'CHILD_BORN':
        return 'Рождение ребёнка';
      case 'GRADUATION':
        return 'Образование';
      case 'RELOCATION':
        return 'Переезд';
      case 'TRAVEL':
        return 'Путешествие';
      case 'CAREER':
        return 'Карьера';
      case 'MILITARY':
        return 'Военная служба';
      case 'CUSTOM':
        return 'Событие';
      default:
        return eventType.replace(/_/g, ' ');
    }
  }

  switch (eventType.toUpperCase()) {
    case 'BIRTH':
      return 'Birth';
    case 'DEATH':
      return 'Death';
    case 'MARRIAGE':
      return 'Marriage';
    case 'DIVORCE':
      return 'Divorce';
    case 'RELATIONSHIP':
      return 'Relationship';
    case 'CHILD_BORN':
      return 'Child Born';
    case 'GRADUATION':
      return 'Graduation';
    case 'RELOCATION':
      return 'Relocation';
    case 'TRAVEL':
      return 'Travel';
    case 'CAREER':
      return 'Career';
    case 'MILITARY':
      return 'Military';
    case 'CUSTOM':
      return 'Life Event';
    default:
      return eventType.replace(/_/g, ' ');
  }
}

/**
 * Localizes synthetic or system-generated event titles (e.g. "Birth of X", "Son Y was born").
 */
export function localizeEventTitle(title: string, language: Language = 'en'): string {
  if (!title) return '';
  if (language !== 'ru') return title;

  const trimmed = title.trim();

  // 1. Birth: "Birth of <Name>"
  const birthMatch = trimmed.match(/^Birth of (.+)$/i);
  if (birthMatch) {
    return `Рождение ${birthMatch[1].trim()}`;
  }

  // 2. Passing: "Passing of <Name>"
  const passingMatch = trimmed.match(/^Passing of (.+)$/i);
  if (passingMatch) {
    return `Кончина ${passingMatch[1].trim()}`;
  }

  // 3. Marriage: "Married <Name>"
  const marriedMatch = trimmed.match(/^Married (.+)$/i);
  if (marriedMatch) {
    return `Брак с ${marriedMatch[1].trim()}`;
  }

  // 4. Partnership: "Partnership with <Name>"
  const partnerMatch = trimmed.match(/^Partnership with (.+)$/i);
  if (partnerMatch) {
    return `Партнёрство с ${partnerMatch[1].trim()}`;
  }

  // 5. Divorce: "Divorced from <Name>"
  const divorceMatch = trimmed.match(/^Divorced from (.+)$/i);
  if (divorceMatch) {
    return `Развод с ${divorceMatch[1].trim()}`;
  }

  // 6. Separation: "Separated from <Name>"
  const sepMatch = trimmed.match(/^Separated from (.+)$/i);
  if (sepMatch) {
    return `Расторжение союза с ${sepMatch[1].trim()}`;
  }

  // 7. Child born: "Son <Name> was born", "Daughter <Name> was born", "Child <Name> was born"
  const sonMatch = trimmed.match(/^Son (.+) was born$/i);
  if (sonMatch) {
    return `Родился сын ${sonMatch[1].trim()}`;
  }
  const daughterMatch = trimmed.match(/^Daughter (.+) was born$/i);
  if (daughterMatch) {
    return `Родилась дочь ${daughterMatch[1].trim()}`;
  }
  const childMatch = trimmed.match(/^Child (.+) was born$/i);
  if (childMatch) {
    return `Родился ребёнок ${childMatch[1].trim()}`;
  }

  // 8. Celebrated birth: "Celebrated the birth of <Name>"
  const celBirthMatch = trimmed.match(/^Celebrated the birth of (.+)$/i);
  if (celBirthMatch) {
    return `Рождение ${celBirthMatch[1].trim()}`;
  }

  return title;
}

/**
 * Localizes synthetic or system-generated event descriptions.
 */
export function localizeEventDescription(description?: string | null, language: Language = 'en'): string | null | undefined {
  if (!description) return description;
  if (language !== 'ru') return description;

  const trimmed = description.trim();

  // Recorded birth date and place
  if (/^Recorded birth date and place$/i.test(trimmed)) {
    return 'Запись о дате и месте рождения';
  }

  // Recorded date and place of passing
  if (/^Recorded date and place of passing$/i.test(trimmed)) {
    return 'Запись о дате и месте кончины';
  }

  // End of union recorded
  if (/^End of union recorded$/i.test(trimmed)) {
    return 'Запись о расторжении союза';
  }

  // Union recorded: MARRIAGE / etc.
  const unionMatch = trimmed.match(/^Union recorded:\s*(.+)$/i);
  if (unionMatch) {
    const rawType = unionMatch[1].trim().toUpperCase();
    if (rawType === 'MARRIAGE') return 'Запись о союзе: Брак';
    if (rawType === 'PARTNERSHIP') return 'Запись о союзе: Партнёрство';
    if (rawType === 'CIVIL_UNION') return 'Запись о союзе: Гражданский союз';
    if (rawType === 'DIVORCED') return 'Запись о союзе: Развод';
    if (rawType === 'SEPARATED') return 'Запись о союзе: Расставание';
    return `Запись о союзе: ${rawType}`;
  }

  // Celebrated the birth of <Name>
  const celMatch = trimmed.match(/^Celebrated the birth of (.+)$/i);
  if (celMatch) {
    return `Празднование рождения: ${celMatch[1].trim()}`;
  }

  return description;
}

/**
 * Localizes relationship status (dating, engaged, married, etc.).
 */
export function localizeRelationshipStatus(status?: string | null, language: Language = 'en'): string {
  if (!status) return '';
  const s = status.toLowerCase();

  if (language === 'ru') {
    switch (s) {
      case 'dating':
        return 'Встречаются';
      case 'engaged':
        return 'Помолвлены';
      case 'married':
        return 'В браке';
      case 'divorced':
        return 'В разводе';
      case 'separated':
        return 'Расстались';
      case 'partner':
        return 'Партнёры';
      default:
        return status;
    }
  }

  switch (s) {
    case 'dating':
      return 'Dating';
    case 'engaged':
      return 'Engaged';
    case 'married':
      return 'Married';
    case 'divorced':
      return 'Divorced';
    case 'separated':
      return 'Separated';
    case 'partner':
      return 'Partner';
    default:
      return status;
  }
}

/**
 * Localizes relationship target type (PERSON, FAMILY, EXTERNAL_PERSON, FAMILY_TO_FAMILY).
 */
export function localizeRelationshipTargetType(type?: string | null, language: Language = 'en'): string {
  if (!type) return '';
  const t = type.toUpperCase();

  if (language === 'ru') {
    switch (t) {
      case 'PERSON':
        return 'Член семьи';
      case 'FAMILY':
        return 'Ветвь семьи';
      case 'EXTERNAL_PERSON':
        return 'Вне древа';
      case 'FAMILY_TO_FAMILY':
        return 'Две семьи';
      default:
        return type.replace(/_/g, ' ');
    }
  }

  switch (t) {
    case 'PERSON':
      return 'Family Member';
    case 'FAMILY':
      return 'Family Branch';
    case 'EXTERNAL_PERSON':
      return 'External Person';
    case 'FAMILY_TO_FAMILY':
      return 'Two Families';
    default:
      return type.replace(/_/g, ' ');
  }
}
