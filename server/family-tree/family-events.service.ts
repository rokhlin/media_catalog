import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { FamilyTreeDatabaseService } from './family-tree-db.service.js';
import type {
  PersonRecord,
  UnionRecord,
  PersonEventRecord,
  EventMediaPinRecord,
} from './types/family-tree.types.js';
import type {
  CreateEventDto,
  UpdateEventDto,
  PinMediaDto,
  UpdateMediaPinDto,
} from './dto/family-tree.dto.js';

@Injectable()
export class FamilyEventsService {
  constructor(
    @Inject(FamilyTreeDatabaseService) private readonly dbService: FamilyTreeDatabaseService,
  ) {}

  // ---------------------------------------------------------------------------
  // Automated System Event Synthesis & Propagation
  // ---------------------------------------------------------------------------

  /**
   * Automatically synchronizes system Birth and Death events for a person.
   */
  public syncPersonBirthDeathEvents(person: PersonRecord): void {
    const db = this.dbService.getDb();
    const fullName = [person.first_name, person.middle_name, person.last_name]
      .filter(Boolean)
      .join(' ');

    // 1. Birth Event
    const birthEventId = `evt_birth_${person.id}`;
    if (person.birth_date || person.birth_place) {
      const existing = db.prepare('SELECT id FROM ft_person_events WHERE id = ?').get(birthEventId);
      const title = `Birth of ${fullName || 'Person'}`;
      if (existing) {
        db.prepare(`
          UPDATE ft_person_events
          SET title = ?, event_date = ?, location_name = ?, updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(title, person.birth_date || null, person.birth_place || null, birthEventId);
      } else {
        db.prepare(`
          INSERT INTO ft_person_events (
            id, person_id, event_type, title, description, event_date, location_name, is_system_generated, source_node_id
          ) VALUES (?, ?, 'BIRTH', ?, 'Recorded birth date and place', ?, ?, 1, ?)
        `).run(birthEventId, person.id, title, person.birth_date || null, person.birth_place || null, person.id);
      }
    } else {
      db.prepare('DELETE FROM ft_person_events WHERE id = ?').run(birthEventId);
    }

    // 2. Death Event
    const deathEventId = `evt_death_${person.id}`;
    if (person.is_living === 0 && (person.death_date || person.death_place)) {
      const existing = db.prepare('SELECT id FROM ft_person_events WHERE id = ?').get(deathEventId);
      const title = `Passing of ${fullName || 'Person'}`;
      if (existing) {
        db.prepare(`
          UPDATE ft_person_events
          SET title = ?, event_date = ?, location_name = ?, updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(title, person.death_date || null, person.death_place || null, deathEventId);
      } else {
        db.prepare(`
          INSERT INTO ft_person_events (
            id, person_id, event_type, title, description, event_date, location_name, is_system_generated, source_node_id
          ) VALUES (?, ?, 'DEATH', ?, 'Recorded date and place of passing', ?, ?, 1, ?)
        `).run(deathEventId, person.id, title, person.death_date || null, person.death_place || null, person.id);
      }
    } else {
      db.prepare('DELETE FROM ft_person_events WHERE id = ?').run(deathEventId);
    }
  }

  /**
   * Automatically generates CHILD_BORN events on parents' timelines when a child is linked to a union.
   */
  public propagateChildBornEvents(childPersonId: string, unionId: string): void {
    const db = this.dbService.getDb();
    const child = db.prepare('SELECT * FROM ft_persons WHERE id = ?').get(childPersonId) as PersonRecord | undefined;
    if (!child) return;

    const partners = db
      .prepare('SELECT person_id FROM ft_union_partners WHERE union_id = ?')
      .all(unionId) as Array<{ person_id: string }>;

    const childName = [child.first_name, child.middle_name, child.last_name].filter(Boolean).join(' ');
    const relationStr = child.gender === 'MALE' ? 'Son' : child.gender === 'FEMALE' ? 'Daughter' : 'Child';
    const title = `${relationStr} ${childName || 'unnamed'} was born`;

    for (const partner of partners) {
      const eventId = `evt_cb_${unionId}_${partner.person_id}_${childPersonId}`;
      const existing = db.prepare('SELECT id FROM ft_person_events WHERE id = ?').get(eventId);

      if (existing) {
        db.prepare(`
          UPDATE ft_person_events
          SET title = ?, event_date = ?, location_name = ?, updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(title, child.birth_date || null, child.birth_place || null, eventId);
      } else {
        db.prepare(`
          INSERT INTO ft_person_events (
            id, person_id, event_type, title, description, event_date, location_name, is_system_generated, source_node_id
          ) VALUES (?, ?, 'CHILD_BORN', ?, ?, ?, ?, 1, ?)
        `).run(
          eventId,
          partner.person_id,
          title,
          `Celebrated the birth of ${childName}`,
          child.birth_date || null,
          child.birth_place || null,
          childPersonId,
        );
      }
    }
  }

  /**
   * Cleans up synthesized CHILD_BORN events when a child is unlinked or deleted.
   */
  public removeChildBornEvents(childPersonId: string, unionId?: string): void {
    const db = this.dbService.getDb();
    if (unionId) {
      db.prepare(`
        DELETE FROM ft_person_events
        WHERE event_type = 'CHILD_BORN' AND source_node_id = ? AND id LIKE ?
      `).run(childPersonId, `evt_cb_${unionId}_%`);
    } else {
      db.prepare(`
        DELETE FROM ft_person_events
        WHERE event_type = 'CHILD_BORN' AND source_node_id = ?
      `).run(childPersonId);
    }
  }

  /**
   * Propagates Marriage / Partnership and Divorce events to both partners.
   */
  public propagateUnionEvents(union: UnionRecord): void {
    const db = this.dbService.getDb();
    const partnerRows = db
      .prepare('SELECT person_id FROM ft_union_partners WHERE union_id = ?')
      .all(union.id) as Array<{ person_id: string }>;

    if (partnerRows.length < 2) return;

    const partnerPersons: Record<string, PersonRecord> = {};
    for (const r of partnerRows) {
      const p = db.prepare('SELECT * FROM ft_persons WHERE id = ?').get(r.person_id) as PersonRecord;
      if (p) partnerPersons[r.person_id] = p;
    }

    for (const pRow of partnerRows) {
      const pId = pRow.person_id;
      const otherPartnerNames = partnerRows
        .filter((r) => r.person_id !== pId)
        .map((r) => {
          const op = partnerPersons[r.person_id];
          return op ? [op.first_name, op.last_name].filter(Boolean).join(' ') : 'Partner';
        })
        .join(' & ');

      // 1. Marriage / Partnership Event
      const marriageEvtId = `evt_union_${union.id}_${pId}`;
      if (union.start_date || union.start_place) {
        const isMarriage = union.union_type === 'MARRIAGE';
        const title = isMarriage ? `Married ${otherPartnerNames}` : `Partnership with ${otherPartnerNames}`;
        const existing = db.prepare('SELECT id FROM ft_person_events WHERE id = ?').get(marriageEvtId);

        if (existing) {
          db.prepare(`
            UPDATE ft_person_events
            SET title = ?, event_date = ?, location_name = ?, updated_at = datetime('now', 'localtime')
            WHERE id = ?
          `).run(title, union.start_date || null, union.start_place || null, marriageEvtId);
        } else {
          db.prepare(`
            INSERT INTO ft_person_events (
              id, person_id, event_type, title, description, event_date, location_name, is_system_generated, source_node_id
            ) VALUES (?, ?, 'MARRIAGE', ?, ?, ?, ?, 1, ?)
          `).run(
            marriageEvtId,
            pId,
            title,
            `Union recorded: ${union.union_type}`,
            union.start_date || null,
            union.start_place || null,
            union.id,
          );
        }
      } else {
        db.prepare('DELETE FROM ft_person_events WHERE id = ?').run(marriageEvtId);
      }

      // 2. Divorce / Separation Event
      const divorceEvtId = `evt_divorce_${union.id}_${pId}`;
      if (union.union_type === 'DIVORCED' || union.union_type === 'SEPARATED' || union.end_date) {
        const title =
          union.union_type === 'DIVORCED' ? `Divorced from ${otherPartnerNames}` : `Separated from ${otherPartnerNames}`;
        const existing = db.prepare('SELECT id FROM ft_person_events WHERE id = ?').get(divorceEvtId);

        if (existing) {
          db.prepare(`
            UPDATE ft_person_events
            SET title = ?, event_date = ?, updated_at = datetime('now', 'localtime')
            WHERE id = ?
          `).run(title, union.end_date || null, divorceEvtId);
        } else {
          db.prepare(`
            INSERT INTO ft_person_events (
              id, person_id, event_type, title, description, event_date, is_system_generated, source_node_id
            ) VALUES (?, ?, 'DIVORCE', ?, ?, ?, 1, ?)
          `).run(divorceEvtId, pId, title, `End of union recorded`, union.end_date || null, union.id);
        }
      } else {
        db.prepare('DELETE FROM ft_person_events WHERE id = ?').run(divorceEvtId);
      }
    }
  }

  /**
   * Deletes union-propagated events when a union is deleted.
   */
  public removeUnionEvents(unionId: string): void {
    const db = this.dbService.getDb();
    db.prepare(`
      DELETE FROM ft_person_events
      WHERE (id LIKE ? OR id LIKE ?) AND is_system_generated = 1
    `).run(`evt_union_${unionId}_%`, `evt_divorce_${unionId}_%`);
  }

  // ---------------------------------------------------------------------------
  // Manual Fact / Event CRUD
  // ---------------------------------------------------------------------------

  public createEvent(personId: string, dto: CreateEventDto): PersonEventRecord {
    const db = this.dbService.getDb();
    const person = db.prepare('SELECT id FROM ft_persons WHERE id = ?').get(personId);
    if (!person) {
      throw new NotFoundException(`Person with ID "${personId}" not found`);
    }

    let eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    if (dto.id && dto.id.trim()) {
      const cleanId = dto.id.trim();
      const existing = db.prepare('SELECT id FROM ft_person_events WHERE id = ?').get(cleanId) as { id: string } | undefined;
      if (existing) {
        return this.updateEvent(cleanId, dto);
      }
      eventId = cleanId;
    }

    // Deduplicate by (person_id, event_type, title) to prevent duplicate facts
    const trimmedTitle = (dto.title || '').trim();
    if (trimmedTitle) {
      const existingSame = db.prepare(`
        SELECT id FROM ft_person_events
        WHERE person_id = ? AND event_type = ? AND TRIM(LOWER(title)) = TRIM(LOWER(?))
      `).get(personId, dto.event_type, trimmedTitle) as { id: string } | undefined;

      if (existingSame) {
        return this.updateEvent(existingSame.id, dto);
      }
    }
    const dateApprox = dto.date_is_approximate ? 1 : 0;

    const stmt = db.prepare(`
      INSERT INTO ft_person_events (
        id, person_id, event_type, title, description, event_date, end_date, date_is_approximate,
        location_name, latitude, longitude, is_system_generated,
        relationship_target_type, relationship_target_name, relationship_target_id, relationship_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
    `);

    stmt.run(
      eventId,
      personId,
      dto.event_type,
      dto.title,
      dto.description || null,
      dto.event_date || null,
      dto.end_date || null,
      dateApprox,
      dto.location_name || null,
      dto.latitude ?? null,
      dto.longitude ?? null,
      dto.relationship_target_type || null,
      dto.relationship_target_name || null,
      dto.relationship_target_id || null,
      dto.relationship_status || null,
    );

    // If initial pinned media provided
    if (dto.pinned_media && dto.pinned_media.length > 0) {
      for (const pin of dto.pinned_media) {
        this.pinMediaToEvent(eventId, pin);
      }
    }

    return this.getEventById(eventId);
  }

  public updateEvent(eventId: string, dto: UpdateEventDto): PersonEventRecord {
    const db = this.dbService.getDb();
    const existing = db.prepare('SELECT * FROM ft_person_events WHERE id = ?').get(eventId) as
      | PersonEventRecord
      | undefined;
    if (!existing) {
      throw new NotFoundException(`Event with ID "${eventId}" not found`);
    }

    const fields: string[] = [];
    const values: any[] = [];

    if (dto.event_type !== undefined) {
      fields.push('event_type = ?');
      values.push(dto.event_type);
    }
    if (dto.title !== undefined) {
      fields.push('title = ?');
      values.push(dto.title);
    }
    if (dto.description !== undefined) {
      fields.push('description = ?');
      values.push(dto.description);
    }
    if (dto.event_date !== undefined) {
      fields.push('event_date = ?');
      values.push(dto.event_date);
    }
    if (dto.end_date !== undefined) {
      fields.push('end_date = ?');
      values.push(dto.end_date);
    }
    if (dto.date_is_approximate !== undefined) {
      fields.push('date_is_approximate = ?');
      values.push(dto.date_is_approximate ? 1 : 0);
    }
    if (dto.location_name !== undefined) {
      fields.push('location_name = ?');
      values.push(dto.location_name);
    }
    if (dto.latitude !== undefined) {
      fields.push('latitude = ?');
      values.push(dto.latitude);
    }
    if (dto.longitude !== undefined) {
      fields.push('longitude = ?');
      values.push(dto.longitude);
    }
    if (dto.relationship_target_type !== undefined) {
      fields.push('relationship_target_type = ?');
      values.push(dto.relationship_target_type);
    }
    if (dto.relationship_target_name !== undefined) {
      fields.push('relationship_target_name = ?');
      values.push(dto.relationship_target_name);
    }
    if (dto.relationship_target_id !== undefined) {
      fields.push('relationship_target_id = ?');
      values.push(dto.relationship_target_id);
    }
    if (dto.relationship_status !== undefined) {
      fields.push('relationship_status = ?');
      values.push(dto.relationship_status);
    }

    fields.push("updated_at = datetime('now', 'localtime')");

    if (fields.length > 1) {
      values.push(eventId);
      db.prepare(`UPDATE ft_person_events SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    return this.getEventById(eventId);
  }

  public deleteEvent(eventId: string): void {
    const db = this.dbService.getDb();
    const res = db.prepare('DELETE FROM ft_person_events WHERE id = ?').run(eventId);
    if (res.changes === 0) {
      throw new NotFoundException(`Event with ID "${eventId}" not found`);
    }
  }

  public getEventById(eventId: string): PersonEventRecord {
    const db = this.dbService.getDb();
    const event = db.prepare('SELECT * FROM ft_person_events WHERE id = ?').get(eventId) as
      | PersonEventRecord
      | undefined;
    if (!event) {
      throw new NotFoundException(`Event with ID "${eventId}" not found`);
    }

    event.pinned_media = db
      .prepare('SELECT * FROM ft_event_media_pins WHERE event_id = ? ORDER BY display_order ASC, created_at ASC')
      .all(eventId) as EventMediaPinRecord[];

    return event;
  }

  public getPersonTimeline(personId: string): PersonEventRecord[] {
    const db = this.dbService.getDb();
    const events = db
      .prepare(`
        SELECT * FROM ft_person_events
        WHERE person_id = ?
        ORDER BY 
          CASE WHEN event_date IS NULL OR event_date = '' THEN 1 ELSE 0 END,
          event_date ASC,
          created_at ASC
      `)
      .all(personId) as PersonEventRecord[];

    const pinsStmt = db.prepare(`
      SELECT * FROM ft_event_media_pins
      WHERE event_id = ?
      ORDER BY display_order ASC, created_at ASC
    `);

    for (const evt of events) {
      evt.pinned_media = pinsStmt.all(evt.id) as EventMediaPinRecord[];
    }

    return events;
  }

  // ---------------------------------------------------------------------------
  // Pinned Gallery Media Management
  // ---------------------------------------------------------------------------

  public pinMediaToEvent(eventId: string, dto: PinMediaDto): EventMediaPinRecord {
    const db = this.dbService.getDb();
    const event = db.prepare('SELECT id FROM ft_person_events WHERE id = ?').get(eventId);
    if (!event) {
      throw new NotFoundException(`Event with ID "${eventId}" not found`);
    }

    const pinId = `pin_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const displayOrder = dto.display_order ?? 0;

    db.prepare(`
      INSERT INTO ft_event_media_pins (
        id, event_id, media_id, media_file_path, thumbnail_url, display_order, caption
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      pinId,
      eventId,
      dto.media_id || null,
      dto.media_file_path,
      dto.thumbnail_url || null,
      displayOrder,
      dto.caption || null,
    );

    return db.prepare('SELECT * FROM ft_event_media_pins WHERE id = ?').get(pinId) as EventMediaPinRecord;
  }

  public updateMediaPin(pinId: string, dto: UpdateMediaPinDto): EventMediaPinRecord {
    const db = this.dbService.getDb();
    const existing = db.prepare('SELECT id FROM ft_event_media_pins WHERE id = ?').get(pinId);
    if (!existing) {
      throw new NotFoundException(`Media pin with ID "${pinId}" not found`);
    }

    const fields: string[] = [];
    const values: any[] = [];

    if (dto.display_order !== undefined) {
      fields.push('display_order = ?');
      values.push(dto.display_order);
    }
    if (dto.caption !== undefined) {
      fields.push('caption = ?');
      values.push(dto.caption);
    }
    if (dto.thumbnail_url !== undefined) {
      fields.push('thumbnail_url = ?');
      values.push(dto.thumbnail_url);
    }

    if (fields.length > 0) {
      values.push(pinId);
      db.prepare(`UPDATE ft_event_media_pins SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    return db.prepare('SELECT * FROM ft_event_media_pins WHERE id = ?').get(pinId) as EventMediaPinRecord;
  }

  public unpinMedia(pinId: string): void {
    const db = this.dbService.getDb();
    const res = db.prepare('DELETE FROM ft_event_media_pins WHERE id = ?').run(pinId);
    if (res.changes === 0) {
      throw new NotFoundException(`Media pin with ID "${pinId}" not found`);
    }
  }

  public getEventMediaPins(eventId: string): EventMediaPinRecord[] {
    const db = this.dbService.getDb();
    return db
      .prepare('SELECT * FROM ft_event_media_pins WHERE event_id = ? ORDER BY display_order ASC, created_at ASC')
      .all(eventId) as EventMediaPinRecord[];
  }
}
