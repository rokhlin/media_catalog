import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  parseFlexibleDate,
  formatTreeDate,
  checkCelebration,
} from '../dateUtils.js';

describe('Family Tree dateUtils', () => {
  describe('parseFlexibleDate Auto-Detection', () => {
    it('detects YYYY-MM-DD', () => {
      const parsed = parseFlexibleDate('1985-04-12');
      assert.strictEqual(parsed.year, 1985);
      assert.strictEqual(parsed.month, 4);
      assert.strictEqual(parsed.day, 12);
      assert.strictEqual(parsed.detectedFormat, 'YYYY-MM-DD');
      assert.strictEqual(parsed.isoNormalized, '1985-04-12');
    });

    it('detects YYYY-MM', () => {
      const parsed = parseFlexibleDate('1985-04');
      assert.strictEqual(parsed.year, 1985);
      assert.strictEqual(parsed.month, 4);
      assert.strictEqual(parsed.day, undefined);
      assert.strictEqual(parsed.detectedFormat, 'YYYY-MM');
      assert.strictEqual(parsed.isoNormalized, '1985-04');
    });

    it('detects YYYY', () => {
      const parsed = parseFlexibleDate('1985');
      assert.strictEqual(parsed.year, 1985);
      assert.strictEqual(parsed.month, undefined);
      assert.strictEqual(parsed.day, undefined);
      assert.strictEqual(parsed.detectedFormat, 'YYYY');
      assert.strictEqual(parsed.isoNormalized, '1985');
    });

    it('detects DD.MM.YYYY', () => {
      const parsed = parseFlexibleDate('12.04.1985');
      assert.strictEqual(parsed.year, 1985);
      assert.strictEqual(parsed.month, 4);
      assert.strictEqual(parsed.day, 12);
      assert.strictEqual(parsed.detectedFormat, 'DD.MM.YYYY');
      assert.strictEqual(parsed.isoNormalized, '1985-04-12');
    });

    it('detects DD.MM', () => {
      const parsed = parseFlexibleDate('12.04');
      assert.strictEqual(parsed.year, undefined);
      assert.strictEqual(parsed.month, 4);
      assert.strictEqual(parsed.day, 12);
      assert.strictEqual(parsed.detectedFormat, 'DD.MM');
    });

    it('detects DD alone', () => {
      const parsed = parseFlexibleDate('12');
      assert.strictEqual(parsed.year, undefined);
      assert.strictEqual(parsed.month, undefined);
      assert.strictEqual(parsed.day, 12);
      assert.strictEqual(parsed.detectedFormat, 'DD');
    });

    it('detects MM.YYYY', () => {
      const parsed = parseFlexibleDate('04.1985');
      assert.strictEqual(parsed.year, 1985);
      assert.strictEqual(parsed.month, 4);
      assert.strictEqual(parsed.day, undefined);
      assert.strictEqual(parsed.detectedFormat, 'MM.YYYY');
      assert.strictEqual(parsed.isoNormalized, '1985-04');
    });

    it('detects MM/DD/YYYY', () => {
      const parsed = parseFlexibleDate('04/12/1985');
      assert.strictEqual(parsed.year, 1985);
      assert.strictEqual(parsed.month, 4);
      assert.strictEqual(parsed.day, 12);
      assert.strictEqual(parsed.detectedFormat, 'MM/DD/YYYY');
      assert.strictEqual(parsed.isoNormalized, '1985-04-12');
    });

    it('detects MM/DD', () => {
      const parsed = parseFlexibleDate('04/12');
      assert.strictEqual(parsed.year, undefined);
      assert.strictEqual(parsed.month, 4);
      assert.strictEqual(parsed.day, 12);
      assert.strictEqual(parsed.detectedFormat, 'MM/DD');
    });
  });

  describe('formatTreeDate formatting', () => {
    it('formats with YYYY-MM-DD style', () => {
      assert.strictEqual(formatTreeDate('1985-04-12', 'YYYY-MM-DD'), '1985-04-12');
      assert.strictEqual(formatTreeDate('12.04.1985', 'YYYY-MM-DD'), '1985-04-12');
    });

    it('formats with DD Month YYYY style', () => {
      assert.strictEqual(formatTreeDate('1985-04-12', 'DD Month YYYY'), '12 April 1985');
      assert.strictEqual(formatTreeDate('1985-04', 'DD Month YYYY'), 'Apr 1985');
      assert.strictEqual(formatTreeDate('1985', 'DD Month YYYY'), '1985');
    });

    it('formats with DD.MM.YYYY style', () => {
      assert.strictEqual(formatTreeDate('1985-04-12', 'DD.MM.YYYY'), '12.04.1985');
      assert.strictEqual(formatTreeDate('1985-04', 'DD.MM.YYYY'), '04.1985');
    });

    it('formats with MM/DD/YYYY style', () => {
      assert.strictEqual(formatTreeDate('1985-04-12', 'MM/DD/YYYY'), '04/12/1985');
    });
  });

  describe('checkCelebration', () => {
    it('detects today birthday', () => {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const birthDate = `1990-${month}-${day}`;

      const res = checkCelebration(
        { birth_date: birthDate, is_living: 1 },
        { enabled: true, showBirthday: true, daysThreshold: 7, badgeStyle: 'pill', badgeColor: '#f59e0b', customIcon: '' }
      );

      assert.ok(res);
      assert.strictEqual(res?.type, 'BIRTHDAY');
      assert.strictEqual(res?.isToday, true);
      assert.strictEqual(res?.daysRemaining, 0);
      assert.strictEqual(res?.label, 'Birthday');
      assert.ok(res?.title.includes('Birthday Today!'));
    });

    it('detects memorial for deceased person', () => {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const deathDate = `2010-${month}-${day}`;

      const res = checkCelebration(
        { death_date: deathDate, is_living: 0 },
        { enabled: true, showMemorial: true, daysThreshold: 7, badgeStyle: 'pill', badgeColor: '#94a3b8', customIcon: '' }
      );

      assert.ok(res);
      assert.strictEqual(res?.type, 'MEMORIAL');
      assert.strictEqual(res?.isToday, true);
    });

    it('returns null if celebration is disabled', () => {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const birthDate = `1990-${month}-${day}`;

      const res = checkCelebration(
        { birth_date: birthDate, is_living: 1 },
        { enabled: false, showBirthday: true, daysThreshold: 7, badgeStyle: 'pill', badgeColor: '#f59e0b', customIcon: '' }
      );

      assert.strictEqual(res, null);
    });

    it('formats Russian dates and celebrations properly in Russian mode', () => {
      const formattedRu = formatTreeDate('1985-09-04', 'DD Month YYYY', 'ru');
      assert.strictEqual(formattedRu, '4 сентября 1985');

      const formattedRuShort = formatTreeDate('1985-09', 'DD Month YYYY', 'ru');
      assert.strictEqual(formattedRuShort, 'сен 1985');

      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const birthDate = `1990-${month}-${day}`;

      const resRu = checkCelebration(
        { birth_date: birthDate, is_living: 1 },
        { enabled: true, showBirthday: true, daysThreshold: 7, badgeStyle: 'pill', badgeColor: '#f59e0b', customIcon: '' },
        7,
        now,
        'ru'
      );

      assert.ok(resRu);
      assert.strictEqual(resRu?.label, 'День рождения');
      assert.ok(resRu?.title.includes('сегодня!'), `Expected title to contain 'сегодня!', got: ${resRu?.title}`);
    });
  });
});
