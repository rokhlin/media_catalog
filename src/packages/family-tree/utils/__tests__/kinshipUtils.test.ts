import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeRelationshipToRoot, localizeKinshipTerm, localizeKinshipCategory } from '../kinshipUtils.js';
import type { TreeGraphData, TreeGraphPerson, TreeGraphUnion } from '../../types/tree.types.js';

describe('kinshipUtils - computeRelationshipToRoot', () => {
  const rootPerson: TreeGraphPerson = {
    id: 'p_root',
    tree_id: 't1',
    first_name: 'Arthur',
    last_name: 'Rokhlin',
    full_name: 'Arthur Rokhlin',
    gender: 'MALE',
    is_living: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  const spousePerson: TreeGraphPerson = {
    id: 'p_spouse',
    tree_id: 't1',
    first_name: 'Elena',
    last_name: 'Bayguildina',
    full_name: 'Elena Bayguildina',
    gender: 'FEMALE',
    is_living: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  const miniyar: TreeGraphPerson = {
    id: 'p_miniyar',
    tree_id: 't1',
    first_name: 'Miniyar',
    last_name: 'Bayguildin',
    full_name: 'Miniyar Bayguildin',
    gender: 'MALE',
    birth_date: null,
    is_living: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  const motherInLaw: TreeGraphPerson = {
    id: 'p_mil',
    tree_id: 't1',
    first_name: 'Zulfiya',
    last_name: 'Bayguildina',
    full_name: 'Zulfiya Bayguildina',
    gender: 'FEMALE',
    is_living: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  const brotherInLaw: TreeGraphPerson = {
    id: 'p_bil',
    tree_id: 't1',
    first_name: 'Timur',
    last_name: 'Bayguildin',
    full_name: 'Timur Bayguildin',
    gender: 'MALE',
    is_living: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  const fatherPerson: TreeGraphPerson = {
    id: 'p_father',
    tree_id: 't1',
    first_name: 'Boris',
    last_name: 'Rokhlin',
    full_name: 'Boris Rokhlin',
    gender: 'MALE',
    is_living: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  const motherPerson: TreeGraphPerson = {
    id: 'p_mother',
    tree_id: 't1',
    first_name: 'Anna',
    last_name: 'Rokhlina',
    full_name: 'Anna Rokhlina',
    gender: 'FEMALE',
    is_living: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  const sisterPerson: TreeGraphPerson = {
    id: 'p_sister',
    tree_id: 't1',
    first_name: 'Olga',
    last_name: 'Rokhlina',
    full_name: 'Olga Rokhlina',
    gender: 'FEMALE',
    is_living: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  const daughterPerson: TreeGraphPerson = {
    id: 'p_daughter',
    tree_id: 't1',
    first_name: 'Sofia',
    last_name: 'Rokhlin',
    full_name: 'Sofia Rokhlin',
    gender: 'FEMALE',
    is_living: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  const sonInLawPerson: TreeGraphPerson = {
    id: 'p_sil',
    tree_id: 't1',
    first_name: 'David',
    last_name: 'Smith',
    full_name: 'David Smith',
    gender: 'MALE',
    is_living: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  // Unions:
  // 1. Root's parents union: Boris + Anna -> children: Arthur (root), Olga (sister)
  const parentsUnion: TreeGraphUnion = {
    id: 'u_parents',
    tree_id: 't1',
    union_type: 'MARRIAGE',
    partner_ids: ['p_father', 'p_mother'],
    children: [
      { person_id: 'p_root', filiation: 'BIOLOGICAL', birth_order: 1 },
      { person_id: 'p_sister', filiation: 'BIOLOGICAL', birth_order: 2 },
    ],
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  // 2. In-laws union: Miniyar Bayguildin + Zulfiya -> children: Elena (spouse), Timur (brother-in-law)
  const inLawsUnion: TreeGraphUnion = {
    id: 'u_inlaws',
    tree_id: 't1',
    union_type: 'MARRIAGE',
    partner_ids: ['p_miniyar', 'p_mil'],
    children: [
      { person_id: 'p_spouse', filiation: 'BIOLOGICAL', birth_order: 1 },
      { person_id: 'p_bil', filiation: 'BIOLOGICAL', birth_order: 2 },
    ],
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  // 3. Root + Spouse union: Arthur + Elena -> children: Sofia (daughter)
  const rootSpouseUnion: TreeGraphUnion = {
    id: 'u_root_spouse',
    tree_id: 't1',
    union_type: 'MARRIAGE',
    partner_ids: ['p_root', 'p_spouse'],
    children: [
      { person_id: 'p_daughter', filiation: 'BIOLOGICAL', birth_order: 1 },
    ],
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  // 4. Daughter + Son-in-law union: Sofia + David
  const daughterUnion: TreeGraphUnion = {
    id: 'u_daughter_union',
    tree_id: 't1',
    union_type: 'MARRIAGE',
    partner_ids: ['p_daughter', 'p_sil'],
    children: [],
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  const graphData: TreeGraphData = {
    tree: {
      id: 't1',
      name: 'Main Tree',
      root_person_id: 'p_root',
      living_privacy_mode: 'SHOW_ALL',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    },
    root_person_id: 'p_root',
    persons: [
      rootPerson,
      spousePerson,
      miniyar,
      motherInLaw,
      brotherInLaw,
      fatherPerson,
      motherPerson,
      sisterPerson,
      daughterPerson,
      sonInLawPerson,
    ],
    unions: [parentsUnion, inLawsUnion, rootSpouseUnion, daughterUnion],
  };

  it('computes "Me" for the root person', () => {
    assert.strictEqual(computeRelationshipToRoot(rootPerson, graphData), 'Me');
  });

  it('computes "Wife" for root spouse', () => {
    assert.strictEqual(computeRelationshipToRoot(spousePerson, graphData), 'Wife');
  });

  it('computes "Father" and "Mother" for root parents', () => {
    assert.strictEqual(computeRelationshipToRoot(fatherPerson, graphData), 'Father');
    assert.strictEqual(computeRelationshipToRoot(motherPerson, graphData), 'Mother');
  });

  it('computes "Sister" for root sibling', () => {
    assert.strictEqual(computeRelationshipToRoot(sisterPerson, graphData), 'Sister');
  });

  it('computes "Daughter" for root child', () => {
    assert.strictEqual(computeRelationshipToRoot(daughterPerson, graphData), 'Daughter');
  });

  it('computes "Father-in-law" for Miniyar Bayguildin (User Bug Scenario)', () => {
    const rel = computeRelationshipToRoot(miniyar, graphData);
    assert.strictEqual(rel, 'Father-in-law');
  });

  it('computes "Mother-in-law" for spouse mother', () => {
    const rel = computeRelationshipToRoot(motherInLaw, graphData);
    assert.strictEqual(rel, 'Mother-in-law');
  });

  it('computes "Brother-in-law" for spouse brother', () => {
    const rel = computeRelationshipToRoot(brotherInLaw, graphData);
    assert.strictEqual(rel, 'Brother-in-law');
  });

  it('computes "Son-in-law" for daughter husband', () => {
    const rel = computeRelationshipToRoot(sonInLawPerson, graphData);
    assert.strictEqual(rel, 'Son-in-law');
  });

  it('uses person.kinship_to_root when provided by backend', () => {
    const personWithBackendKinship: TreeGraphPerson = {
      ...miniyar,
      kinship_to_root: 'Father-in-law',
    };
    assert.strictEqual(computeRelationshipToRoot(personWithBackendKinship, graphData), 'Father-in-law');
  });

  it('localizes kinship terms and categories into Russian accurately', () => {
    assert.strictEqual(localizeKinshipTerm('Me', 'ru'), 'Я');
    assert.strictEqual(localizeKinshipTerm('Father', 'ru'), 'Отец');
    assert.strictEqual(localizeKinshipTerm('Mother', 'ru'), 'Мать');
    assert.strictEqual(localizeKinshipTerm('Son', 'ru'), 'Сын');
    assert.strictEqual(localizeKinshipTerm('Daughter', 'ru'), 'Дочь');
    assert.strictEqual(localizeKinshipTerm('Brother', 'ru'), 'Брат');
    assert.strictEqual(localizeKinshipTerm('Sister', 'ru'), 'Сестра');
    assert.strictEqual(localizeKinshipTerm('Husband', 'ru'), 'Муж');
    assert.strictEqual(localizeKinshipTerm('Wife', 'ru'), 'Жена');
    assert.strictEqual(localizeKinshipTerm('Father-in-law', 'ru'), 'Свёкор / Тесть');
    assert.strictEqual(localizeKinshipTerm('Mother-in-law', 'ru'), 'Свекровь / Тёща');
    assert.strictEqual(localizeKinshipTerm('Brother-in-law', 'ru'), 'Шурин / Деверь / Зять');
    assert.strictEqual(localizeKinshipTerm('Grandfather', 'ru'), 'Дедушка');
    assert.strictEqual(localizeKinshipTerm('Grandmother', 'ru'), 'Бабушка');

    // In English mode, keeps English
    assert.strictEqual(localizeKinshipTerm('Father-in-law', 'en'), 'Father-in-law');

    // Categories
    assert.strictEqual(localizeKinshipCategory('SELF', 'ru'), 'Я / Корень');
    assert.strictEqual(localizeKinshipCategory('SPOUSE_PARTNER', 'ru'), 'Супруг(а) / Партнёр');
    assert.strictEqual(localizeKinshipCategory('DIRECT_ANCESTOR', 'ru'), 'Прямой предок');
  });
});
