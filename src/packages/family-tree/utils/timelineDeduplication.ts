import type { PersonEventRecord } from '../types/event.types.js';

export interface RelativeContext {
  id: string;
  name: string;
  relation: string;
}

export interface FilterRelativeEventsContext {
  currentPersonId: string;
  currentPersonName?: string;
  ownEvents: PersonEventRecord[];
  seenUnionEventKeys?: Set<string>;
  seenChildBornIds?: Set<string>;
  seenBirthPersonIds?: Set<string>;
}

/**
 * Filters events fetched from a relative to eliminate duplicated facts and
 * irrelevant third-party spouse unions/children.
 */
export function filterRelativeEvents(
  relativeEvents: PersonEventRecord[],
  relative: RelativeContext,
  context: FilterRelativeEventsContext,
): PersonEventRecord[] {
  const {
    currentPersonId,
    currentPersonName,
    ownEvents,
    seenUnionEventKeys = new Set<string>(),
    seenChildBornIds = new Set<string>(),
    seenBirthPersonIds = new Set<string>(),
  } = context;

  const relRelationLower = (relative.relation || '').toLowerCase();
  const isSpouse =
    relRelationLower.includes('husband') ||
    relRelationLower.includes('wife') ||
    relRelationLower.includes('spouse') ||
    relRelationLower.includes('partner');
  const isChild =
    relRelationLower.includes('son') ||
    relRelationLower.includes('daughter') ||
    relRelationLower.includes('child');

  // Union IDs that the current person is already a partner in
  const ownUnionIds = new Set(
    ownEvents
      .filter((e) => (e.event_type === 'MARRIAGE' || e.event_type === 'DIVORCE') && e.source_node_id)
      .map((e) => e.source_node_id as string),
  );

  // Child IDs that the current person already has their own CHILD_BORN records for
  const ownChildBornIds = new Set(
    ownEvents
      .filter((e) => e.event_type === 'CHILD_BORN' && e.source_node_id)
      .map((e) => e.source_node_id as string),
  );

  const cleanPersonName = (currentPersonName || '').trim().toLowerCase();

  const filtered: PersonEventRecord[] = [];

  for (const ev of relativeEvents) {
    // 1. Skip events that belong directly to the current person (own events cover them)
    if (ev.person_id === currentPersonId) continue;
    if (ev.event_type === 'BIRTH' && (ev.person_id === currentPersonId || ev.source_node_id === currentPersonId)) {
      continue;
    }
    if (ev.event_type === 'CHILD_BORN' && ev.source_node_id === currentPersonId) {
      continue;
    }

    // 2. Spouse events filtering:
    // A spouse's MARRIAGE, DIVORCE, or CHILD_BORN should NEVER appear on the current person's timeline:
    // - If it was with/shared with current person, current person already has their own record.
    // - If it was with/for a different spouse, it belongs to that other relationship, not current person.
    if (isSpouse) {
      if (ev.event_type === 'MARRIAGE' || ev.event_type === 'DIVORCE' || ev.event_type === 'CHILD_BORN') {
        continue;
      }
    }

    // 3. Child events filtering:
    // If the relative is a child, their BIRTH is already celebrated by the parent's own CHILD_BORN record.
    if (isChild && ev.event_type === 'BIRTH') {
      if (
        ownChildBornIds.has(relative.id) ||
        (ev.person_id && ownChildBornIds.has(ev.person_id)) ||
        (ev.source_node_id && ownChildBornIds.has(ev.source_node_id))
      ) {
        continue;
      }
    }

    // 4. Union deduplication across relatives (e.g. parents' marriage/divorce):
    if (ev.event_type === 'MARRIAGE' || ev.event_type === 'DIVORCE') {
      // Skip if this union already belongs to the current person
      if (ev.source_node_id && ownUnionIds.has(ev.source_node_id)) {
        continue;
      }
      // Skip if title refers to the current person (reciprocal event)
      if (cleanPersonName && ev.title?.toLowerCase().includes(cleanPersonName)) {
        continue;
      }
      // Skip if another relative already added this union event (e.g. Mother & Father having same union)
      if (ev.source_node_id && seenUnionEventKeys.has(`${ev.event_type}_${ev.source_node_id}`)) {
        continue;
      }
    }

    // 5. CHILD_BORN deduplication across relatives (e.g. both parents celebrating a sibling's birth)
    if (ev.event_type === 'CHILD_BORN') {
      if (ev.source_node_id && ownChildBornIds.has(ev.source_node_id)) {
        continue;
      }
      if (ev.source_node_id && seenChildBornIds.has(ev.source_node_id)) {
        continue;
      }
      if (ev.source_node_id && seenBirthPersonIds.has(ev.source_node_id)) {
        continue;
      }
    }

    // 6. BIRTH deduplication:
    if (ev.event_type === 'BIRTH') {
      const birthTargetId = ev.person_id || ev.source_node_id;
      if (birthTargetId && ownChildBornIds.has(birthTargetId)) {
        continue;
      }
      if (birthTargetId && seenBirthPersonIds.has(birthTargetId)) {
        continue;
      }
    }

    // Mark seen keys
    if (ev.source_node_id && (ev.event_type === 'MARRIAGE' || ev.event_type === 'DIVORCE')) {
      seenUnionEventKeys.add(`${ev.event_type}_${ev.source_node_id}`);
    }
    if (ev.event_type === 'CHILD_BORN' && ev.source_node_id) {
      seenChildBornIds.add(ev.source_node_id);
      seenBirthPersonIds.add(ev.source_node_id);
    }
    if (ev.event_type === 'BIRTH') {
      const birthTargetId = ev.person_id || ev.source_node_id || relative.id;
      if (birthTargetId) {
        seenBirthPersonIds.add(birthTargetId);
      }
    }

    filtered.push(ev);
  }

  return filtered;
}

/**
 * Deduplicates the merged timeline array (own events + relative events) to guarantee
 * that no semantic duplicate events (same union, same child birth, same event ID) are displayed.
 */
export function deduplicateTimelineEvents(
  ownEvents: PersonEventRecord[],
  relativeEvents: PersonEventRecord[],
  currentPersonId?: string,
): PersonEventRecord[] {
  const result: PersonEventRecord[] = [];
  const seenEventIds = new Set<string>();
  const seenUnionKeys = new Set<string>();
  const seenPersonBirths = new Set<string>();

  // 1. Process own events first (always highest priority)
  for (const ev of ownEvents) {
    if (seenEventIds.has(ev.id)) continue;
    seenEventIds.add(ev.id);

    if (ev.source_node_id && (ev.event_type === 'MARRIAGE' || ev.event_type === 'DIVORCE')) {
      seenUnionKeys.add(`${ev.event_type}_${ev.source_node_id}`);
    }

    if (ev.event_type === 'CHILD_BORN' && ev.source_node_id) {
      seenPersonBirths.add(ev.source_node_id);
    }

    if (ev.event_type === 'BIRTH') {
      const birthId = ev.person_id || ev.source_node_id || currentPersonId;
      if (birthId) seenPersonBirths.add(birthId);
    }

    result.push(ev);
  }

  // 2. Process relative events
  for (const ev of relativeEvents) {
    if (seenEventIds.has(ev.id)) continue;

    // Union duplicate check
    if (ev.source_node_id && (ev.event_type === 'MARRIAGE' || ev.event_type === 'DIVORCE')) {
      const key = `${ev.event_type}_${ev.source_node_id}`;
      if (seenUnionKeys.has(key)) continue;
      seenUnionKeys.add(key);
    }

    // Child birth vs CHILD_BORN duplicate check
    if (ev.event_type === 'BIRTH') {
      const targetId = ev.person_id || ev.source_node_id;
      if (targetId && seenPersonBirths.has(targetId)) continue;
      if (targetId) seenPersonBirths.add(targetId);
    }

    if (ev.event_type === 'CHILD_BORN') {
      const targetId = ev.source_node_id;
      if (targetId && seenPersonBirths.has(targetId)) continue;
      if (targetId) seenPersonBirths.add(targetId);
    }

    seenEventIds.add(ev.id);
    result.push(ev);
  }

  return result;
}
