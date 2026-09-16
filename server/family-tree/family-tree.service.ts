import { Injectable, NotFoundException, BadRequestException, Inject, Optional } from '@nestjs/common';
import { FamilyTreeDatabaseService } from './family-tree-db.service.js';
import { GraphIntegrityService } from './graph-integrity.service.js';
import { FamilyEventsService } from './family-events.service.js';
import { KinshipEngineService } from './kinship-engine.service.js';
import type {
  TreeRecord,
  PersonRecord,
  UnionRecord,
  PersonFaceLinkRecord,
  TreeGraphData,
  TreeGraphPerson,
  TreeGraphUnion,
  PersonEventRecord,
  TreeHistoryRecord,
} from './types/family-tree.types.js';
import type {
  CreateTreeDto,
  UpdateTreeDto,
  CreatePersonDto,
  UpdatePersonDto,
  CreateUnionDto,
  UpdateUnionDto,
  AddChildToUnionDto,
  UpdateChildRelationDto,
  LinkFaceDto,
  QuickAddRelativeDto,
} from './dto/family-tree.dto.js';

@Injectable()
export class FamilyTreeService {
  constructor(
    @Inject(FamilyTreeDatabaseService) private readonly dbService: FamilyTreeDatabaseService,
    @Inject(GraphIntegrityService) private readonly integrityService: GraphIntegrityService,
    @Inject(FamilyEventsService) private readonly eventsService: FamilyEventsService,
    @Optional() @Inject(KinshipEngineService) private readonly kinshipService?: KinshipEngineService,
  ) {}

  // ---------------------------------------------------------------------------
  // Tree Management
  // ---------------------------------------------------------------------------

  public getTrees(): TreeRecord[] {
    const db = this.dbService.getDb();
    return db.prepare('SELECT * FROM ft_trees ORDER BY created_at ASC').all() as TreeRecord[];
  }

  public getTreeById(id: string): TreeRecord {
    const db = this.dbService.getDb();
    const tree = db.prepare('SELECT * FROM ft_trees WHERE id = ?').get(id) as TreeRecord | undefined;
    if (!tree) {
      throw new NotFoundException(`Family tree with ID "${id}" not found`);
    }
    return tree;
  }

  public getOrCreateDefaultTree(): TreeRecord {
    const db = this.dbService.getDb();
    let tree = db.prepare('SELECT * FROM ft_trees LIMIT 1').get() as TreeRecord | undefined;
    if (!tree) {
      const id = 'default_tree';
      db.prepare(`
        INSERT INTO ft_trees (id, name, description, living_privacy_mode)
        VALUES (?, 'My Family Tree', 'Default genealogical tree for Media Cataloger', 'MASK_LIVING')
      `).run(id);
      tree = this.getTreeById(id);
    }
    return tree;
  }

  public createTree(dto: CreateTreeDto): TreeRecord {
    const db = this.dbService.getDb();
    const id = `tree_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const privacy = dto.living_privacy_mode || 'MASK_LIVING';

    db.prepare(`
      INSERT INTO ft_trees (id, name, description, root_person_id, living_privacy_mode)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, dto.name, dto.description || null, dto.root_person_id || null, privacy);

    return this.getTreeById(id);
  }

  public updateTree(id: string, dto: UpdateTreeDto): TreeRecord {
    const db = this.dbService.getDb();
    this.getTreeById(id);

    const fields: string[] = [];
    const values: any[] = [];

    if (dto.name !== undefined) {
      fields.push('name = ?');
      values.push(dto.name);
    }
    if (dto.description !== undefined) {
      fields.push('description = ?');
      values.push(dto.description);
    }
    if (dto.root_person_id !== undefined) {
      fields.push('root_person_id = ?');
      values.push(dto.root_person_id);
    }
    if (dto.living_privacy_mode !== undefined) {
      fields.push('living_privacy_mode = ?');
      values.push(dto.living_privacy_mode);
    }

    fields.push("updated_at = datetime('now', 'localtime')");

    if (fields.length > 1) {
      values.push(id);
      db.prepare(`UPDATE ft_trees SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    return this.getTreeById(id);
  }

  public deleteTree(id: string): void {
    const db = this.dbService.getDb();
    const res = db.prepare('DELETE FROM ft_trees WHERE id = ?').run(id);
    if (res.changes === 0) {
      throw new NotFoundException(`Family tree with ID "${id}" not found`);
    }
  }

  public setRootPerson(treeId: string, personId: string): TreeRecord {
    const db = this.dbService.getDb();
    this.getTreeById(treeId);
    this.getPersonById(personId);

    db.prepare(`
      UPDATE ft_trees
      SET root_person_id = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(personId, treeId);

    return this.getTreeById(treeId);
  }

  // ---------------------------------------------------------------------------
  // Person Management
  // ---------------------------------------------------------------------------

  public createPerson(dto: CreatePersonDto): PersonRecord {
    const db = this.dbService.getDb();
    const treeId = dto.tree_id || this.getOrCreateDefaultTree().id;
    this.getTreeById(treeId);

    let personId = `p_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    if (dto.id && dto.id.trim()) {
      const cleanId = dto.id.trim();
      const existing = db.prepare('SELECT id FROM ft_persons WHERE id = ?').get(cleanId);
      if (!existing) {
        personId = cleanId;
      }
    }
    const isLiving = dto.is_living === false || dto.is_living === 0 ? 0 : 1;
    const customAttrStr =
      typeof dto.custom_attributes === 'object'
        ? JSON.stringify(dto.custom_attributes)
        : dto.custom_attributes || null;

    db.prepare(`
      INSERT INTO ft_persons (
        id, tree_id, media_person_id, first_name, middle_name, last_name, maiden_name,
        gender, birth_date, birth_place, is_living, death_date, death_place,
        bio, avatar_url, avatar_face_id, custom_attributes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      personId,
      treeId,
      dto.media_person_id || null,
      dto.first_name,
      dto.middle_name || null,
      dto.last_name || null,
      dto.maiden_name || null,
      dto.gender || 'UNKNOWN',
      dto.birth_date || null,
      dto.birth_place || null,
      isLiving,
      dto.death_date || null,
      dto.death_place || null,
      dto.bio || null,
      dto.avatar_url || null,
      dto.avatar_face_id || null,
      customAttrStr,
    );

    const person = this.getPersonById(personId);

    // Auto-synthesize Birth and Death events
    this.eventsService.syncPersonBirthDeathEvents(person);

    // If tree has no root person, set this person as root
    const tree = this.getTreeById(treeId);
    if (!tree.root_person_id) {
      this.setRootPerson(treeId, personId);
    }

    return person;
  }

  public getPersonById(id: string): PersonRecord {
    const db = this.dbService.getDb();
    const person = db.prepare('SELECT * FROM ft_persons WHERE id = ?').get(id) as PersonRecord | undefined;
    if (!person) {
      throw new NotFoundException(`Person with ID "${id}" not found`);
    }
    return person;
  }

  public updatePerson(id: string, dto: UpdatePersonDto): PersonRecord {
    const db = this.dbService.getDb();
    this.getPersonById(id);

    const fields: string[] = [];
    const values: any[] = [];

    if (dto.media_person_id !== undefined) {
      fields.push('media_person_id = ?');
      values.push(dto.media_person_id);
    }
    if (dto.first_name !== undefined) {
      fields.push('first_name = ?');
      values.push(dto.first_name);
    }
    if (dto.middle_name !== undefined) {
      fields.push('middle_name = ?');
      values.push(dto.middle_name);
    }
    if (dto.last_name !== undefined) {
      fields.push('last_name = ?');
      values.push(dto.last_name);
    }
    if (dto.maiden_name !== undefined) {
      fields.push('maiden_name = ?');
      values.push(dto.maiden_name);
    }
    if (dto.gender !== undefined) {
      fields.push('gender = ?');
      values.push(dto.gender);
    }
    if (dto.birth_date !== undefined) {
      fields.push('birth_date = ?');
      values.push(dto.birth_date);
    }
    if (dto.birth_place !== undefined) {
      fields.push('birth_place = ?');
      values.push(dto.birth_place);
    }
    if (dto.is_living !== undefined) {
      fields.push('is_living = ?');
      values.push(dto.is_living === false || dto.is_living === 0 ? 0 : 1);
    }
    if (dto.death_date !== undefined) {
      fields.push('death_date = ?');
      values.push(dto.death_date);
    }
    if (dto.death_place !== undefined) {
      fields.push('death_place = ?');
      values.push(dto.death_place);
    }
    if (dto.bio !== undefined) {
      fields.push('bio = ?');
      values.push(dto.bio);
    }
    if (dto.avatar_url !== undefined) {
      fields.push('avatar_url = ?');
      values.push(dto.avatar_url);
    }
    if (dto.avatar_face_id !== undefined) {
      fields.push('avatar_face_id = ?');
      values.push(dto.avatar_face_id);
    }
    if (dto.custom_attributes !== undefined) {
      fields.push('custom_attributes = ?');
      values.push(
        typeof dto.custom_attributes === 'object'
          ? JSON.stringify(dto.custom_attributes)
          : dto.custom_attributes,
      );
    }

    fields.push("updated_at = datetime('now', 'localtime')");

    if (fields.length > 1) {
      values.push(id);
      db.prepare(`UPDATE ft_persons SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    const updated = this.getPersonById(id);
    this.eventsService.syncPersonBirthDeathEvents(updated);

    // Update any linked union child born events if this person is a child
    const parentUnions = db
      .prepare('SELECT union_id FROM ft_child_relations WHERE person_id = ?')
      .all(id) as Array<{ union_id: string }>;
    for (const u of parentUnions) {
      this.eventsService.propagateChildBornEvents(id, u.union_id);
    }

    return updated;
  }

  public cleanUpOrphanedUnions(treeId?: string): void {
    const db = this.dbService.getDb();
    const tId = treeId || this.getOrCreateDefaultTree().id;

    // Find all unions where:
    // 1. partner_count = 0 and child_count <= 1 (no parents, and <= 1 child -> orphaned ring)
    // 2. partner_count <= 1 and child_count = 0 (single person with no spouse and no children -> orphaned ring)
    // 3. partner_count = 0 and child_count = 0 (completely empty union)
    const orphanedUnions = db
      .prepare(`
        SELECT u.id
        FROM ft_unions u
        LEFT JOIN (
          SELECT union_id, COUNT(*) as partner_count
          FROM ft_union_partners
          GROUP BY union_id
        ) up ON u.id = up.union_id
        LEFT JOIN (
          SELECT union_id, COUNT(*) as child_count
          FROM ft_child_relations
          GROUP BY union_id
        ) cr ON u.id = cr.union_id
        WHERE u.tree_id = ? AND (
          (COALESCE(up.partner_count, 0) = 0 AND COALESCE(cr.child_count, 0) <= 1)
          OR
          (COALESCE(up.partner_count, 0) <= 1 AND COALESCE(cr.child_count, 0) = 0)
        )
      `)
      .all(tId) as Array<{ id: string }>;

    for (const ou of orphanedUnions) {
      try {
        this.deleteUnion(ou.id);
      } catch {
        // ignore if already removed
      }
    }
  }

  public deletePerson(id: string): void {
    const db = this.dbService.getDb();
    const person = this.getPersonById(id);

    // Guard: prevent deletion of non-leaf nodes to preserve graph connectivity.
    // A non-leaf person is one who has both parents (they appear in ft_child_relations)
    // AND children (they are a partner in a union that has child records).
    const isChild = db
      .prepare('SELECT COUNT(*) as cnt FROM ft_child_relations WHERE person_id = ?')
      .get(id) as { cnt: number };

    const hasChildren = db
      .prepare(`
        SELECT COUNT(*) as cnt
        FROM ft_child_relations cr
        INNER JOIN ft_union_partners up ON up.union_id = cr.union_id
        WHERE up.person_id = ?
      `)
      .get(id) as { cnt: number };

    if (isChild.cnt > 0 && hasChildren.cnt > 0) {
      throw new BadRequestException(
        `Cannot delete "${person.first_name}${person.last_name ? ' ' + person.last_name : ''}" because they connect parents and children in the tree. ` +
        `Remove their children or unlink their parents first.`,
      );
    }

    this.eventsService.removeChildBornEvents(id);
    db.prepare('DELETE FROM ft_persons WHERE id = ?').run(id);

    // Automatically purge all orphaned/empty unions
    this.cleanUpOrphanedUnions(person.tree_id);
  }

  public listPersons(treeId?: string, query?: string): PersonRecord[] {
    const db = this.dbService.getDb();
    const tId = treeId || this.getOrCreateDefaultTree().id;

    if (query && query.trim()) {
      const q = `%${query.trim()}%`;
      return db
        .prepare(`
          SELECT * FROM ft_persons
          WHERE tree_id = ? AND (
            first_name LIKE ? OR last_name LIKE ? OR maiden_name LIKE ? OR media_person_id LIKE ?
          )
          ORDER BY last_name ASC, first_name ASC
        `)
        .all(tId, q, q, q, q) as PersonRecord[];
    }

    return db
      .prepare('SELECT * FROM ft_persons WHERE tree_id = ? ORDER BY last_name ASC, first_name ASC')
      .all(tId) as PersonRecord[];
  }

  // ---------------------------------------------------------------------------
  // Quick Add Relative
  // ---------------------------------------------------------------------------

  public quickAddRelative(dto: QuickAddRelativeDto): { person: PersonRecord; union: UnionRecord } {
    const target = this.getPersonById(dto.target_person_id);
    const newPerson = this.createPerson({
      ...dto.person,
      tree_id: target.tree_id,
    });

    let union: UnionRecord;

    switch (dto.relationship) {
      case 'PARENT': {
        // Create or find a union where newPerson is partner and target is child
        // Check if target already belongs to a parent union
        const db = this.dbService.getDb();
        const existingParentUnion = db
          .prepare(`
            SELECT cr.union_id
            FROM ft_child_relations cr
            JOIN ft_unions u ON cr.union_id = u.id
            WHERE cr.person_id = ?
            LIMIT 1
          `)
          .get(target.id) as { union_id: string } | undefined;

        if (existingParentUnion) {
          union = this.getUnionById(existingParentUnion.union_id);
          this.addPartnerToUnion(union.id, newPerson.id);
        } else {
          union = this.createUnion({
            tree_id: target.tree_id,
            partner_ids: [newPerson.id],
            union_type: 'MARRIAGE',
          });
          this.addChildToUnion(union.id, {
            person_id: target.id,
            filiation: dto.filiation || 'BIOLOGICAL',
          });
        }
        break;
      }

      case 'CHILD': {
        const db = this.dbService.getDb();
        const otherParentId = dto.other_parent_id?.trim();

        if (otherParentId && otherParentId !== 'unknown') {
          // Verify that otherParent exists in the tree
          this.getPersonById(otherParentId);

          // Find an existing union between target and otherParent
          const existingUnion = db
            .prepare(`
              SELECT u.id
              FROM ft_unions u
              JOIN ft_union_partners up1 ON u.id = up1.union_id AND up1.person_id = ?
              JOIN ft_union_partners up2 ON u.id = up2.union_id AND up2.person_id = ?
              WHERE u.tree_id = ?
              LIMIT 1
            `)
            .get(target.id, otherParentId, target.tree_id) as { id: string } | undefined;

          if (existingUnion) {
            union = this.getUnionById(existingUnion.id);
          } else {
            union = this.createUnion({
              tree_id: target.tree_id,
              partner_ids: [target.id, otherParentId],
              union_type: 'MARRIAGE',
            });
          }
        } else {
          // Unknown second parent -> keep the child's second parent empty
          const singleParentUnion = db
            .prepare(`
              SELECT u.id
              FROM ft_unions u
              JOIN ft_union_partners up ON u.id = up.union_id
              WHERE u.tree_id = ? AND u.id IN (
                SELECT union_id FROM ft_union_partners WHERE person_id = ?
              )
              GROUP BY u.id
              HAVING COUNT(up.person_id) = 1
              LIMIT 1
            `)
            .get(target.tree_id, target.id) as { id: string } | undefined;

          if (singleParentUnion) {
            union = this.getUnionById(singleParentUnion.id);
          } else {
            union = this.createUnion({
              tree_id: target.tree_id,
              partner_ids: [target.id],
              union_type: 'MARRIAGE',
            });
          }
        }

        this.addChildToUnion(union.id, {
          person_id: newPerson.id,
          filiation: dto.filiation || 'BIOLOGICAL',
        });
        break;
      }

      case 'SPOUSE': {
        union = this.createUnion({
          tree_id: target.tree_id,
          partner_ids: [target.id, newPerson.id],
          union_type: 'MARRIAGE',
        });
        break;
      }

      case 'SIBLING': {
        // Find or create parent union of target, then add newPerson as child to it
        const db = this.dbService.getDb();
        const existingParentUnion = db
          .prepare(`
            SELECT cr.union_id
            FROM ft_child_relations cr
            JOIN ft_unions u ON cr.union_id = u.id
            WHERE cr.person_id = ?
            LIMIT 1
          `)
          .get(target.id) as { union_id: string } | undefined;

        if (existingParentUnion) {
          union = this.getUnionById(existingParentUnion.union_id);
        } else {
          union = this.createUnion({
            tree_id: target.tree_id,
            partner_ids: [],
            union_type: 'MARRIAGE',
          });
          this.addChildToUnion(union.id, {
            person_id: target.id,
            filiation: 'BIOLOGICAL',
          });
        }

        this.addChildToUnion(union.id, {
          person_id: newPerson.id,
          filiation: dto.filiation || 'BIOLOGICAL',
        });
        break;
      }

      default:
        throw new BadRequestException(`Unsupported relative relationship: ${dto.relationship}`);
    }

    return { person: newPerson, union };
  }

  // ---------------------------------------------------------------------------
  // Union Management
  // ---------------------------------------------------------------------------

  public createUnion(dto: CreateUnionDto): UnionRecord {
    const db = this.dbService.getDb();
    const treeId = dto.tree_id || this.getOrCreateDefaultTree().id;
    this.getTreeById(treeId);

    let unionId = `u_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    if (dto.id && dto.id.trim()) {
      const cleanId = dto.id.trim();
      const existing = db.prepare('SELECT id FROM ft_unions WHERE id = ?').get(cleanId);
      if (!existing) {
        unionId = cleanId;
      }
    }
    const unionType = dto.union_type || 'MARRIAGE';

    db.prepare(`
      INSERT INTO ft_unions (id, tree_id, union_type, start_date, start_place, end_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      unionId,
      treeId,
      unionType,
      dto.start_date || null,
      dto.start_place || null,
      dto.end_date || null,
      dto.notes || null,
    );

    if (dto.partner_ids && dto.partner_ids.length > 0) {
      const insertPartner = db.prepare(`
        INSERT INTO ft_union_partners (id, union_id, person_id, display_order)
        VALUES (?, ?, ?, ?)
      `);

      dto.partner_ids.forEach((pId, idx) => {
        const partnerRecId = `up_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`;
        insertPartner.run(partnerRecId, unionId, pId, idx);
      });
    }

    const union = this.getUnionById(unionId);
    this.eventsService.propagateUnionEvents(union);

    return union;
  }

  public getUnionById(id: string): UnionRecord {
    const db = this.dbService.getDb();
    const union = db.prepare('SELECT * FROM ft_unions WHERE id = ?').get(id) as UnionRecord | undefined;
    if (!union) {
      throw new NotFoundException(`Union with ID "${id}" not found`);
    }
    return union;
  }

  public updateUnion(id: string, dto: UpdateUnionDto): UnionRecord {
    const db = this.dbService.getDb();
    this.getUnionById(id);

    const fields: string[] = [];
    const values: any[] = [];

    if (dto.union_type !== undefined) {
      fields.push('union_type = ?');
      values.push(dto.union_type);
    }
    if (dto.start_date !== undefined) {
      fields.push('start_date = ?');
      values.push(dto.start_date);
    }
    if (dto.start_place !== undefined) {
      fields.push('start_place = ?');
      values.push(dto.start_place);
    }
    if (dto.end_date !== undefined) {
      fields.push('end_date = ?');
      values.push(dto.end_date);
    }
    if (dto.notes !== undefined) {
      fields.push('notes = ?');
      values.push(dto.notes);
    }

    fields.push("updated_at = datetime('now', 'localtime')");

    if (fields.length > 1) {
      values.push(id);
      db.prepare(`UPDATE ft_unions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    if (dto.partner_ids !== undefined) {
      for (const pId of dto.partner_ids) {
        this.integrityService.assertNoUnionPartnerCycle(id, pId);
      }

      db.prepare('DELETE FROM ft_union_partners WHERE union_id = ?').run(id);
      const insertPartner = db.prepare(`
        INSERT INTO ft_union_partners (id, union_id, person_id, display_order)
        VALUES (?, ?, ?, ?)
      `);

      dto.partner_ids.forEach((pId, idx) => {
        const partnerRecId = `up_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`;
        insertPartner.run(partnerRecId, id, pId, idx);
      });
    }

    const updated = this.getUnionById(id);
    this.eventsService.propagateUnionEvents(updated);

    if (dto.partner_ids !== undefined) {
      const childRows = db.prepare('SELECT person_id FROM ft_child_relations WHERE union_id = ?').all(id) as Array<{ person_id: string }>;
      for (const cr of childRows) {
        this.eventsService.propagateChildBornEvents(cr.person_id, id);
      }
    }

    return updated;
  }

  public deleteUnion(id: string): void {
    const db = this.dbService.getDb();
    this.eventsService.removeUnionEvents(id);
    const res = db.prepare('DELETE FROM ft_unions WHERE id = ?').run(id);
    if (res.changes === 0) {
      throw new NotFoundException(`Union with ID "${id}" not found`);
    }
  }

  public addPartnerToUnion(unionId: string, personId: string): void {
    const db = this.dbService.getDb();
    this.getUnionById(unionId);
    this.getPersonById(personId);

    this.integrityService.assertNoUnionPartnerCycle(unionId, personId);

    const partnerRecId = `up_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    db.prepare(`
      INSERT OR IGNORE INTO ft_union_partners (id, union_id, person_id, display_order)
      VALUES (?, ?, ?, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM ft_union_partners WHERE union_id = ?))
    `).run(partnerRecId, unionId, personId, unionId);

    const union = this.getUnionById(unionId);
    this.eventsService.propagateUnionEvents(union);

    const childRows = db.prepare('SELECT person_id FROM ft_child_relations WHERE union_id = ?').all(unionId) as Array<{ person_id: string }>;
    for (const cr of childRows) {
      this.eventsService.propagateChildBornEvents(cr.person_id, unionId);
    }
  }

  public removePartnerFromUnion(unionId: string, personId: string): void {
    const db = this.dbService.getDb();
    const union = this.getUnionById(unionId);
    db.prepare('DELETE FROM ft_union_partners WHERE union_id = ? AND person_id = ?').run(unionId, personId);
    this.eventsService.propagateUnionEvents(union);
    this.cleanUpOrphanedUnions(union.tree_id);
  }

  // ---------------------------------------------------------------------------
  // Child Relation Management
  // ---------------------------------------------------------------------------

  public addChildToUnion(unionId: string, dto: AddChildToUnionDto): void {
    const db = this.dbService.getDb();
    this.getUnionById(unionId);
    this.getPersonById(dto.person_id);

    this.integrityService.assertNoChildToUnionCycle(unionId, dto.person_id);

    const childRelId = `cr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const filiation = dto.filiation || 'BIOLOGICAL';
    const birthOrder = dto.birth_order ?? 0;

    db.prepare(`
      INSERT OR REPLACE INTO ft_child_relations (id, union_id, person_id, filiation, birth_order)
      VALUES (?, ?, ?, ?, ?)
    `).run(childRelId, unionId, dto.person_id, filiation, birthOrder);

    this.eventsService.propagateChildBornEvents(dto.person_id, unionId);
  }

  public removeChildFromUnion(unionId: string, personId: string): void {
    const db = this.dbService.getDb();
    const union = this.getUnionById(unionId);
    db.prepare('DELETE FROM ft_child_relations WHERE union_id = ? AND person_id = ?').run(unionId, personId);
    this.eventsService.removeChildBornEvents(personId, unionId);
    this.cleanUpOrphanedUnions(union.tree_id);
  }

  public updateChildRelation(unionId: string, personId: string, dto: UpdateChildRelationDto): void {
    const db = this.dbService.getDb();
    const fields: string[] = [];
    const values: any[] = [];

    if (dto.filiation !== undefined) {
      fields.push('filiation = ?');
      values.push(dto.filiation);
    }
    if (dto.birth_order !== undefined) {
      fields.push('birth_order = ?');
      values.push(dto.birth_order);
    }

    if (fields.length > 0) {
      values.push(unionId, personId);
      db.prepare(`UPDATE ft_child_relations SET ${fields.join(', ')} WHERE union_id = ? AND person_id = ?`).run(
        ...values,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Face Linking
  // ---------------------------------------------------------------------------

  public linkPersonFace(dto: LinkFaceDto): PersonFaceLinkRecord {
    const db = this.dbService.getDb();
    const person = this.getPersonById(dto.tree_person_id);

    const isPrimary = dto.is_primary_avatar ? 1 : 0;
    const linkId = `pfl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    if (isPrimary) {
      db.prepare('UPDATE ft_person_face_links SET is_primary_avatar = 0 WHERE tree_person_id = ?').run(
        dto.tree_person_id,
      );
    }

    db.prepare(`
      INSERT INTO ft_person_face_links (id, tree_person_id, media_person_name, media_face_id, is_primary_avatar)
      VALUES (?, ?, ?, ?, ?)
    `).run(linkId, dto.tree_person_id, dto.media_person_name, dto.media_face_id, isPrimary);

    // Update person avatar
    if (isPrimary || !person.avatar_face_id) {
      this.updatePerson(dto.tree_person_id, {
        avatar_face_id: dto.media_face_id,
        avatar_url: `/api/faces/image/${dto.media_face_id}`,
        media_person_id: dto.media_person_name,
      });
    }

    return db.prepare('SELECT * FROM ft_person_face_links WHERE id = ?').get(linkId) as PersonFaceLinkRecord;
  }

  public unlinkPersonFace(linkId: string): void {
    const db = this.dbService.getDb();
    const link = db.prepare('SELECT * FROM ft_person_face_links WHERE id = ?').get(linkId) as
      | PersonFaceLinkRecord
      | undefined;
    if (!link) {
      throw new NotFoundException(`Face link with ID "${linkId}" not found`);
    }

    db.prepare('DELETE FROM ft_person_face_links WHERE id = ?').run(linkId);

    // If was primary avatar, clear or point to next face link
    const remaining = db
      .prepare('SELECT * FROM ft_person_face_links WHERE tree_person_id = ? ORDER BY created_at ASC')
      .all(link.tree_person_id) as PersonFaceLinkRecord[];

    if (remaining.length > 0) {
      const nextPrimary = remaining[0];
      db.prepare('UPDATE ft_person_face_links SET is_primary_avatar = 1 WHERE id = ?').run(nextPrimary.id);
      this.updatePerson(link.tree_person_id, {
        avatar_face_id: nextPrimary.media_face_id,
        avatar_url: `/api/faces/image/${nextPrimary.media_face_id}`,
      });
    } else {
      this.updatePerson(link.tree_person_id, {
        avatar_face_id: null,
        avatar_url: null,
      });
    }
  }

  public getPersonFaceLinks(treePersonId: string): PersonFaceLinkRecord[] {
    const db = this.dbService.getDb();
    return db
      .prepare('SELECT * FROM ft_person_face_links WHERE tree_person_id = ? ORDER BY created_at ASC')
      .all(treePersonId) as PersonFaceLinkRecord[];
  }

  // ---------------------------------------------------------------------------
  // Complete Tree Graph Retrieval (For Canvas & ELKjs Layout)
  // ---------------------------------------------------------------------------

  public getTreeGraph(treeId?: string): TreeGraphData {
    const db = this.dbService.getDb();
    const tree = treeId ? this.getTreeById(treeId) : this.getOrCreateDefaultTree();

    // Ensure database has no dangling / orphaned unions
    this.cleanUpOrphanedUnions(tree.id);

    const persons = db
      .prepare('SELECT * FROM ft_persons WHERE tree_id = ? ORDER BY created_at ASC')
      .all(tree.id) as PersonRecord[];

    const rootPersonId = tree.root_person_id;
    const graphPersons: TreeGraphPerson[] = persons.map((p) => {
      let kinshipToRoot: string | null = null;
      if (rootPersonId && this.kinshipService) {
        try {
          const k = this.kinshipService.calculateKinship(rootPersonId, p.id);
          kinshipToRoot = k?.primaryTerm || null;
        } catch {
          // fallback
        }
      }
      return {
        ...p,
        full_name: [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' '),
        kinship_to_root: kinshipToRoot,
      };
    });

    const unions = db
      .prepare('SELECT * FROM ft_unions WHERE tree_id = ? ORDER BY created_at ASC')
      .all(tree.id) as UnionRecord[];

    const partnersStmt = db.prepare(`
      SELECT person_id FROM ft_union_partners WHERE union_id = ? ORDER BY display_order ASC
    `);

    const childrenStmt = db.prepare(`
      SELECT person_id, filiation, birth_order FROM ft_child_relations WHERE union_id = ? ORDER BY birth_order ASC
    `);

    const graphUnions: TreeGraphUnion[] = unions.map((u) => {
      const partnerRows = partnersStmt.all(u.id) as Array<{ person_id: string }>;
      const childRows = childrenStmt.all(u.id) as Array<{
        person_id: string;
        filiation: any;
        birth_order: number;
      }>;

      return {
        ...u,
        partner_ids: partnerRows.map((r) => r.person_id),
        children: childRows,
      };
    });

    const facts = db
      .prepare(`
        SELECT pe.* FROM ft_person_events pe
        JOIN ft_persons p ON pe.person_id = p.id
        WHERE p.tree_id = ?
        ORDER BY pe.event_date ASC
      `)
      .all(tree.id) as PersonEventRecord[];

    return {
      tree,
      persons: graphPersons,
      unions: graphUnions,
      root_person_id: tree.root_person_id,
      facts,
    };
  }

  // ---------------------------------------------------------------------------
  // Tree History & Audit
  // ---------------------------------------------------------------------------

  public recordTreeHistory(
    treeId: string,
    actionType: string,
    description: string,
    details?: any,
  ): TreeHistoryRecord {
    const db = this.dbService.getDb();
    const id = `hist_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const detailsStr = details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null;

    db.prepare(`
      INSERT INTO ft_tree_history (id, tree_id, action_type, description, details)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, treeId, actionType, description, detailsStr);

    return db.prepare('SELECT * FROM ft_tree_history WHERE id = ?').get(id) as TreeHistoryRecord;
  }

  public getTreeHistory(treeId: string, limit: number = 50): TreeHistoryRecord[] {
    const db = this.dbService.getDb();
    const tId = treeId || this.getOrCreateDefaultTree().id;
    return db
      .prepare(`
        SELECT * FROM ft_tree_history
        WHERE tree_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(tId, limit) as TreeHistoryRecord[];
  }
}
