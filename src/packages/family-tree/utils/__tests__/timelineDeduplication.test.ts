import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { PersonEventRecord } from '../../types/event.types.js';
import {
  filterRelativeEvents,
  deduplicateTimelineEvents,
} from '../timelineDeduplication.js';

function makeEvent(partial: Partial<PersonEventRecord> & { id: string; person_id: string; event_type: any; title: string }): PersonEventRecord {
  return {
    description: null,
    event_date: null,
    date_is_approximate: 0,
    location_name: null,
    is_system_generated: 1,
    source_node_id: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...partial,
  } as PersonEventRecord;
}

describe('Timeline Facts Deduplication', () => {
  it('should eliminate duplicated marriage, divorce, and child birth facts for spouses and children (User Bug scenario)', () => {
    const oxanaId = 'person_oxana';
    const antonId = 'person_anton';
    const dimaId = 'person_dima';
    const sofiaId = 'person_sofia';
    const dariaId = 'person_daria';
    const unionAntonOxana = 'union_anton_oxana';
    const unionAntonLiliya = 'union_anton_liliya';

    // 1. Oxana's own events
    const oxanaOwnEvents: PersonEventRecord[] = [
      makeEvent({
        id: 'evt_birth_oxana',
        person_id: oxanaId,
        event_type: 'BIRTH',
        title: 'Birth of Oxana Wagner',
        event_date: '1983-10-19',
        source_node_id: oxanaId,
      }),
      makeEvent({
        id: `evt_union_${unionAntonOxana}_${oxanaId}`,
        person_id: oxanaId,
        event_type: 'MARRIAGE',
        title: 'Partnership with Anton Rokhlin',
        event_date: '2006-09-01',
        source_node_id: unionAntonOxana,
      }),
      makeEvent({
        id: `evt_divorce_${unionAntonOxana}_${oxanaId}`,
        person_id: oxanaId,
        event_type: 'DIVORCE',
        title: 'Divorced from Anton Rokhlin',
        event_date: '2008-09-01',
        source_node_id: unionAntonOxana,
      }),
      makeEvent({
        id: `evt_cb_${unionAntonOxana}_${oxanaId}_${sofiaId}`,
        person_id: oxanaId,
        event_type: 'CHILD_BORN',
        title: 'Daughter Sofia Rokhlina was born',
        event_date: '2010-02-12',
        source_node_id: sofiaId,
      }),
      makeEvent({
        id: `evt_cb_custom_${oxanaId}_${dariaId}`,
        person_id: oxanaId,
        event_type: 'CHILD_BORN',
        title: 'Daughter Daria was born',
        event_date: '',
        source_node_id: dariaId,
      }),
    ];

    // 2. Relative 1: Ex-Husband Anton Rokhlin
    const antonEvents: PersonEventRecord[] = [
      makeEvent({
        id: 'evt_birth_anton',
        person_id: antonId,
        event_type: 'BIRTH',
        title: 'Birth of Anton Rokhlin',
        event_date: '1984-07-01',
        location_name: 'Kazan',
        source_node_id: antonId,
      }),
      makeEvent({
        id: `evt_union_${unionAntonOxana}_${antonId}`,
        person_id: antonId,
        event_type: 'MARRIAGE',
        title: 'Partnership with Oxana Wagner',
        event_date: '2006-09-01',
        source_node_id: unionAntonOxana,
      }),
      makeEvent({
        id: `evt_divorce_${unionAntonOxana}_${antonId}`,
        person_id: antonId,
        event_type: 'DIVORCE',
        title: 'Divorced from Oxana Wagner',
        event_date: '2008-09-01',
        source_node_id: unionAntonOxana,
      }),
      makeEvent({
        id: `evt_cb_${unionAntonOxana}_${antonId}_${sofiaId}`,
        person_id: antonId,
        event_type: 'CHILD_BORN',
        title: 'Daughter Sofia Rokhlina was born',
        event_date: '2010-02-12',
        source_node_id: sofiaId,
      }),
      makeEvent({
        id: `evt_union_${unionAntonLiliya}_${antonId}`,
        person_id: antonId,
        event_type: 'MARRIAGE',
        title: 'Married Liliya Rokhlina',
        event_date: '2018-01-26',
        source_node_id: unionAntonLiliya,
      }),
      makeEvent({
        id: `evt_cb_${unionAntonLiliya}_${antonId}_yan`,
        person_id: antonId,
        event_type: 'CHILD_BORN',
        title: 'Son Yan Rokhlin was born',
        event_date: '2019-10-18',
        source_node_id: 'person_yan',
      }),
    ];

    // 3. Relative 2: Husband Dima
    const dimaEvents: PersonEventRecord[] = [
      makeEvent({
        id: 'evt_birth_dima',
        person_id: dimaId,
        event_type: 'BIRTH',
        title: 'Birth of Dima',
        event_date: '1981',
        source_node_id: dimaId,
      }),
    ];

    // 4. Relative 3: Daughter Sofia Rokhlina
    const sofiaEvents: PersonEventRecord[] = [
      makeEvent({
        id: 'evt_birth_sofia',
        person_id: sofiaId,
        event_type: 'BIRTH',
        title: 'Birth of Sofia Rokhlina',
        event_date: '2010-02-12',
        source_node_id: sofiaId,
      }),
    ];

    const seenUnionEventKeys = new Set<string>();
    const seenChildBornIds = new Set<string>();
    const seenBirthPersonIds = new Set<string>();

    const filteredAnton = filterRelativeEvents(
      antonEvents,
      { id: antonId, name: 'Anton Rokhlin', relation: 'Ex-Husband' },
      {
        currentPersonId: oxanaId,
        currentPersonName: 'Oxana Wagner',
        ownEvents: oxanaOwnEvents,
        seenUnionEventKeys,
        seenChildBornIds,
        seenBirthPersonIds,
      },
    );

    const filteredDima = filterRelativeEvents(
      dimaEvents,
      { id: dimaId, name: 'Dima', relation: 'Husband' },
      {
        currentPersonId: oxanaId,
        currentPersonName: 'Oxana Wagner',
        ownEvents: oxanaOwnEvents,
        seenUnionEventKeys,
        seenChildBornIds,
        seenBirthPersonIds,
      },
    );

    const filteredSofia = filterRelativeEvents(
      sofiaEvents,
      { id: sofiaId, name: 'Sofia Rokhlina', relation: 'Daughter' },
      {
        currentPersonId: oxanaId,
        currentPersonName: 'Oxana Wagner',
        ownEvents: oxanaOwnEvents,
        seenUnionEventKeys,
        seenChildBornIds,
        seenBirthPersonIds,
      },
    );

    // Assertions on filtered relative events:
    // From Anton: Only his BIRTH should remain!
    // (His marriage to Oxana, divorce from Oxana, child Sofia, marriage to Liliya, and child Yan are all filtered)
    assert.strictEqual(filteredAnton.length, 1, 'Only Anton birth should remain from Anton');
    assert.strictEqual(filteredAnton[0].id, 'evt_birth_anton');

    // From Dima: Only his BIRTH should remain
    assert.strictEqual(filteredDima.length, 1, 'Only Dima birth should remain from Dima');
    assert.strictEqual(filteredDima[0].id, 'evt_birth_dima');

    // From Sofia: Her BIRTH should be skipped because Oxana already has CHILD_BORN for Sofia
    assert.strictEqual(filteredSofia.length, 0, 'Sofia birth should be filtered since Oxana has CHILD_BORN');

    // Combine all relative events
    const allRelatives = [...filteredAnton, ...filteredDima, ...filteredSofia];

    // Final deduplicated timeline
    const merged = deduplicateTimelineEvents(oxanaOwnEvents, allRelatives, oxanaId);

    // Total events: 5 (Oxana own) + 2 (Anton birth, Dima birth) = 7
    assert.strictEqual(merged.length, 7, 'Total timeline events should be exactly 7 without duplicates');

    const eventTitles = merged.map((e) => e.title);
    assert.ok(eventTitles.includes('Birth of Oxana Wagner'));
    assert.ok(eventTitles.includes('Birth of Anton Rokhlin'));
    assert.ok(eventTitles.includes('Birth of Dima'));
    assert.ok(eventTitles.includes('Partnership with Anton Rokhlin'));
    assert.ok(eventTitles.includes('Divorced from Anton Rokhlin'));
    assert.ok(eventTitles.includes('Daughter Sofia Rokhlina was born'));
    assert.ok(eventTitles.includes('Daughter Daria was born'));

    // Verify duplicates are completely absent
    assert.strictEqual(eventTitles.filter((t) => t.includes('Partnership')).length, 1, 'Only 1 marriage event');
    assert.strictEqual(eventTitles.filter((t) => t.includes('Divorced')).length, 1, 'Only 1 divorce event');
    assert.strictEqual(eventTitles.filter((t) => t.includes('Sofia Rokhlina')).length, 1, 'Only 1 Sofia birth/child born event');
    assert.strictEqual(eventTitles.filter((t) => t.includes('Liliya')).length, 0, 'No unrelated Liliya marriage');
    assert.strictEqual(eventTitles.filter((t) => t.includes('Yan')).length, 0, 'No unrelated Yan child born');
  });

  it('should preserve single parents marriage and divorce on child timeline', () => {
    const childId = 'person_child';
    const fatherId = 'person_father';
    const motherId = 'person_mother';
    const parentsUnionId = 'union_parents';

    const childOwnEvents: PersonEventRecord[] = [
      makeEvent({
        id: 'evt_birth_child',
        person_id: childId,
        event_type: 'BIRTH',
        title: 'Birth of Child',
        event_date: '2015-05-10',
        source_node_id: childId,
      }),
    ];

    const fatherEvents: PersonEventRecord[] = [
      makeEvent({
        id: 'evt_birth_father',
        person_id: fatherId,
        event_type: 'BIRTH',
        title: 'Birth of Father',
        event_date: '1980-01-01',
        source_node_id: fatherId,
      }),
      makeEvent({
        id: `evt_union_${parentsUnionId}_father`,
        person_id: fatherId,
        event_type: 'MARRIAGE',
        title: 'Married Mother',
        event_date: '2010-06-20',
        source_node_id: parentsUnionId,
      }),
      makeEvent({
        id: `evt_cb_${parentsUnionId}_father_${childId}`,
        person_id: fatherId,
        event_type: 'CHILD_BORN',
        title: 'Child was born',
        event_date: '2015-05-10',
        source_node_id: childId,
      }),
    ];

    const motherEvents: PersonEventRecord[] = [
      makeEvent({
        id: 'evt_birth_mother',
        person_id: motherId,
        event_type: 'BIRTH',
        title: 'Birth of Mother',
        event_date: '1982-03-15',
        source_node_id: motherId,
      }),
      makeEvent({
        id: `evt_union_${parentsUnionId}_mother`,
        person_id: motherId,
        event_type: 'MARRIAGE',
        title: 'Married Father',
        event_date: '2010-06-20',
        source_node_id: parentsUnionId,
      }),
      makeEvent({
        id: `evt_cb_${parentsUnionId}_mother_${childId}`,
        person_id: motherId,
        event_type: 'CHILD_BORN',
        title: 'Child was born',
        event_date: '2015-05-10',
        source_node_id: childId,
      }),
    ];

    const seenUnionEventKeys = new Set<string>();
    const seenChildBornIds = new Set<string>();
    const seenBirthPersonIds = new Set<string>();

    const filteredFather = filterRelativeEvents(
      fatherEvents,
      { id: fatherId, name: 'Father', relation: 'Father' },
      {
        currentPersonId: childId,
        currentPersonName: 'Child',
        ownEvents: childOwnEvents,
        seenUnionEventKeys,
        seenChildBornIds,
        seenBirthPersonIds,
      },
    );

    const filteredMother = filterRelativeEvents(
      motherEvents,
      { id: motherId, name: 'Mother', relation: 'Mother' },
      {
        currentPersonId: childId,
        currentPersonName: 'Child',
        ownEvents: childOwnEvents,
        seenUnionEventKeys,
        seenChildBornIds,
        seenBirthPersonIds,
      },
    );

    const merged = deduplicateTimelineEvents(childOwnEvents, [...filteredFather, ...filteredMother], childId);
    const marriages = merged.filter((e) => e.event_type === 'MARRIAGE');
    assert.strictEqual(marriages.length, 1, 'Parents marriage should only be included once');

    const childBorns = merged.filter((e) => e.event_type === 'CHILD_BORN');
    assert.strictEqual(childBorns.length, 0, 'Child born event about self should be skipped in favor of own birth');
  });

  it('should deduplicate relative events in deduplicateTimelineEvents even if pre-filtering was skipped', () => {
    const own: PersonEventRecord[] = [
      makeEvent({
        id: 'own_m',
        person_id: 'p1',
        event_type: 'MARRIAGE',
        title: 'Married Partner',
        event_date: '2020-01-01',
        source_node_id: 'u1',
      }),
      makeEvent({
        id: 'own_cb',
        person_id: 'p1',
        event_type: 'CHILD_BORN',
        title: 'Child born',
        event_date: '2021-01-01',
        source_node_id: 'c1',
      }),
    ];

    const rel: PersonEventRecord[] = [
      makeEvent({
        id: 'rel_m_dup',
        person_id: 'p2',
        event_type: 'MARRIAGE',
        title: 'Partner married p1',
        event_date: '2020-01-01',
        source_node_id: 'u1', // Duplicate union
      }),
      makeEvent({
        id: 'rel_birth_dup',
        person_id: 'c1',
        event_type: 'BIRTH',
        title: 'Birth of c1',
        event_date: '2021-01-01',
        source_node_id: 'c1', // Duplicate child birth
      }),
      makeEvent({
        id: 'rel_unique',
        person_id: 'p2',
        event_type: 'GRADUATION',
        title: 'College Graduation',
        event_date: '2018-05-15',
      }),
    ];

    const res = deduplicateTimelineEvents(own, rel, 'p1');
    assert.strictEqual(res.length, 3, 'Should only contain 2 own events + 1 unique relative event');
    assert.strictEqual(res[0].id, 'own_m');
    assert.strictEqual(res[1].id, 'own_cb');
    assert.strictEqual(res[2].id, 'rel_unique');
  });
});
