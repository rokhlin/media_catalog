import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  localizeEventType,
  localizeEventTitle,
  localizeEventDescription,
  localizeRelationshipStatus,
  localizeRelationshipTargetType,
} from '../eventLocalization.js';

describe('eventLocalization', () => {
  describe('localizeEventType', () => {
    it('translates event types to Russian', () => {
      assert.strictEqual(localizeEventType('BIRTH', 'ru'), 'Рождение');
      assert.strictEqual(localizeEventType('DEATH', 'ru'), 'Кончина');
      assert.strictEqual(localizeEventType('MARRIAGE', 'ru'), 'Брак');
      assert.strictEqual(localizeEventType('DIVORCE', 'ru'), 'Развод');
      assert.strictEqual(localizeEventType('RELATIONSHIP', 'ru'), 'Отношения');
      assert.strictEqual(localizeEventType('CHILD_BORN', 'ru'), 'Рождение ребёнка');
      assert.strictEqual(localizeEventType('GRADUATION', 'ru'), 'Образование');
      assert.strictEqual(localizeEventType('RELOCATION', 'ru'), 'Переезд');
      assert.strictEqual(localizeEventType('TRAVEL', 'ru'), 'Путешествие');
      assert.strictEqual(localizeEventType('CAREER', 'ru'), 'Карьера');
      assert.strictEqual(localizeEventType('MILITARY', 'ru'), 'Военная служба');
      assert.strictEqual(localizeEventType('CUSTOM', 'ru'), 'Событие');
    });

    it('translates event types to English', () => {
      assert.strictEqual(localizeEventType('BIRTH', 'en'), 'Birth');
      assert.strictEqual(localizeEventType('CHILD_BORN', 'en'), 'Child Born');
      assert.strictEqual(localizeEventType('GRADUATION', 'en'), 'Graduation');
      assert.strictEqual(localizeEventType('MARRIAGE', 'en'), 'Marriage');
    });
  });

  describe('localizeEventTitle', () => {
    it('localizes lifecycle titles to Russian', () => {
      assert.strictEqual(localizeEventTitle('Birth of Anton Rokhlin', 'ru'), 'Рождение Anton Rokhlin');
      assert.strictEqual(localizeEventTitle('Birth of Liliya Rokhlin', 'ru'), 'Рождение Liliya Rokhlin');
      assert.strictEqual(localizeEventTitle('Passing of John Doe', 'ru'), 'Кончина John Doe');
      assert.strictEqual(localizeEventTitle('Married Anton Rokhlin', 'ru'), 'Брак с Anton Rokhlin');
      assert.strictEqual(localizeEventTitle('Partnership with Jane', 'ru'), 'Партнёрство с Jane');
      assert.strictEqual(localizeEventTitle('Divorced from Alice', 'ru'), 'Развод с Alice');
      assert.strictEqual(localizeEventTitle('Separated from Bob', 'ru'), 'Расторжение союза с Bob');
      assert.strictEqual(localizeEventTitle('Son Yan Rokhlin was born', 'ru'), 'Родился сын Yan Rokhlin');
      assert.strictEqual(localizeEventTitle('Daughter Maya was born', 'ru'), 'Родилась дочь Maya');
      assert.strictEqual(localizeEventTitle('Child Alex was born', 'ru'), 'Родился ребёнок Alex');
    });

    it('leaves custom titles in English unchanged', () => {
      assert.strictEqual(localizeEventTitle('Started School', 'ru'), 'Started School');
      assert.strictEqual(localizeEventTitle('Birth of Anton Rokhlin', 'en'), 'Birth of Anton Rokhlin');
    });
  });

  describe('localizeEventDescription', () => {
    it('localizes lifecycle descriptions to Russian', () => {
      assert.strictEqual(
        localizeEventDescription('Recorded birth date and place', 'ru'),
        'Запись о дате и месте рождения',
      );
      assert.strictEqual(
        localizeEventDescription('Recorded date and place of passing', 'ru'),
        'Запись о дате и месте кончины',
      );
      assert.strictEqual(
        localizeEventDescription('End of union recorded', 'ru'),
        'Запись о расторжении союза',
      );
      assert.strictEqual(
        localizeEventDescription('Union recorded: MARRIAGE', 'ru'),
        'Запись о союзе: Брак',
      );
      assert.strictEqual(
        localizeEventDescription('Union recorded: PARTNERSHIP', 'ru'),
        'Запись о союзе: Партнёрство',
      );
      assert.strictEqual(
        localizeEventDescription('Celebrated the birth of Yan Rokhlin', 'ru'),
        'Празднование рождения: Yan Rokhlin',
      );
    });

    it('preserves English descriptions when language is en', () => {
      assert.strictEqual(
        localizeEventDescription('Recorded birth date and place', 'en'),
        'Recorded birth date and place',
      );
      assert.strictEqual(
        localizeEventDescription('David Ben Gurion school', 'ru'),
        'David Ben Gurion school',
      );
    });
  });

  describe('localizeRelationshipStatus', () => {
    it('translates relationship status in Russian', () => {
      assert.strictEqual(localizeRelationshipStatus('dating', 'ru'), 'Встречаются');
      assert.strictEqual(localizeRelationshipStatus('engaged', 'ru'), 'Помолвлены');
      assert.strictEqual(localizeRelationshipStatus('married', 'ru'), 'В браке');
      assert.strictEqual(localizeRelationshipStatus('divorced', 'ru'), 'В разводе');
      assert.strictEqual(localizeRelationshipStatus('separated', 'ru'), 'Расстались');
    });
  });

  describe('localizeRelationshipTargetType', () => {
    it('translates relationship target types', () => {
      assert.strictEqual(localizeRelationshipTargetType('PERSON', 'ru'), 'Член семьи');
      assert.strictEqual(localizeRelationshipTargetType('FAMILY', 'ru'), 'Ветвь семьи');
      assert.strictEqual(localizeRelationshipTargetType('EXTERNAL_PERSON', 'ru'), 'Вне древа');
    });
  });
});
