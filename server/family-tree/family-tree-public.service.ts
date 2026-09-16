import { Injectable, Inject } from '@nestjs/common';
import { FamilyTreeDatabaseService } from './family-tree-db.service.js';
import { KinshipEngineService } from './kinship-engine.service.js';
import { FamilyTreeService } from './family-tree.service.js';
import type {
  PersonRecord,
  PersonContextResponse,
  ImmediateRelative,
  PhotoKinshipResponse,
  AutocompletePersonItem,
} from './types/family-tree.types.js';
import type { PhotoKinshipDto, GalleryKinshipFactsConfigDto } from './dto/family-tree.dto.js';

@Injectable()
export class FamilyTreePublicService {
  constructor(
    @Inject(FamilyTreeDatabaseService) private readonly dbService: FamilyTreeDatabaseService,
    @Inject(KinshipEngineService) private readonly kinshipService: KinshipEngineService,
    @Inject(FamilyTreeService) private readonly treeService: FamilyTreeService,
  ) {}

  /**
   * Retrieves structured genealogical context, kinship to root ("ME"), immediate family,
   * and recent life milestones for a person recognized by name, media ID, or face ID.
   */
  public getPersonContext(params: {
    name?: string;
    mediaPersonId?: string;
    faceId?: string;
    personId?: string;
    treeId?: string;
  }): PersonContextResponse {
    const person = this.resolvePerson(params);
    if (!person) {
      return { found: false };
    }

    const db = this.dbService.getDb();
    const tree = this.treeService.getTreeById(person.tree_id);
    const rootPersonId = tree.root_person_id || person.id;

    // Kinship relative to Root ("ME")
    const kinshipToRoot = this.kinshipService.calculateKinship(rootPersonId, person.id);

    // Immediate Family (Parents, Spouses, Children, Siblings)
    const immediateFamily = this.getImmediateFamily(person);

    // Recent / Notable Milestones
    const milestonesRows = db
      .prepare(`
        SELECT pe.*, COUNT(emp.id) as pinned_count
        FROM ft_person_events pe
        LEFT JOIN ft_event_media_pins emp ON pe.id = emp.event_id
        WHERE pe.person_id = ?
        GROUP BY pe.id
        ORDER BY 
          CASE WHEN pe.event_date IS NULL OR pe.event_date = '' THEN 1 ELSE 0 END,
          pe.event_date DESC,
          pe.created_at DESC
        LIMIT 10
      `)
      .all(person.id) as Array<any>;

    const recentMilestones = milestonesRows.map((m) => ({
      type: m.event_type,
      title: m.title,
      description: m.description,
      date: m.event_date,
      location: m.location_name,
      pinnedMediaCount: Number(m.pinned_count || 0),
    }));

    const fullName = [person.first_name, person.middle_name, person.last_name].filter(Boolean).join(' ');
    const birthYear = person.birth_date ? person.birth_date.split('-')[0] : null;

    return {
      found: true,
      treePersonId: person.id,
      fullName: fullName || person.first_name,
      firstName: person.first_name,
      middleName: person.middle_name || null,
      lastName: person.last_name || null,
      maidenName: person.maiden_name || null,
      gender: person.gender,
      birthYear,
      birthDate: person.birth_date || null,
      birthPlace: person.birth_place || null,
      isLiving: person.is_living === 1,
      deathDate: person.death_date || null,
      deathPlace: person.death_place || null,
      bio: person.bio || null,
      avatarUrl: person.avatar_url || (person.avatar_face_id ? `/api/faces/image/${person.avatar_face_id}` : null),
      avatarFaceId: person.avatar_face_id || null,
      kinshipToRoot,
      immediateFamily,
      recentMilestones,
    };
  }

  /**
   * Resolves a person record from flexible query parameters (personId, mediaPersonId, faceId, name).
   */
  public resolvePerson(params: {
    name?: string;
    mediaPersonId?: string;
    faceId?: string;
    personId?: string;
    treeId?: string;
  }): PersonRecord | null {
    const db = this.dbService.getDb();
    const treeFilter = params.treeId ? 'AND tree_id = ?' : '';
    const treeParams = params.treeId ? [params.treeId] : [];

    if (params.personId) {
      const p = db.prepare(`SELECT * FROM ft_persons WHERE id = ? ${treeFilter}`).get(params.personId, ...treeParams) as
        | PersonRecord
        | undefined;
      if (p) return p;
    }

    if (params.faceId) {
      // Check avatar_face_id directly
      let p = db.prepare(`SELECT * FROM ft_persons WHERE avatar_face_id = ? ${treeFilter}`).get(params.faceId, ...treeParams) as
        | PersonRecord
        | undefined;
      if (p) return p;

      // Check ft_person_face_links
      const link = db
        .prepare('SELECT tree_person_id FROM ft_person_face_links WHERE media_face_id = ?')
        .get(params.faceId) as { tree_person_id: string } | undefined;
      if (link) {
        p = db.prepare(`SELECT * FROM ft_persons WHERE id = ? ${treeFilter}`).get(link.tree_person_id, ...treeParams) as
          | PersonRecord
          | undefined;
        if (p) return p;
      }
    }

    if (params.mediaPersonId) {
      let p = db
        .prepare(`SELECT * FROM ft_persons WHERE (media_person_id = ? OR id = ?) ${treeFilter}`)
        .get(params.mediaPersonId, params.mediaPersonId, ...treeParams) as PersonRecord | undefined;
      if (p) return p;

      const link = db
        .prepare('SELECT tree_person_id FROM ft_person_face_links WHERE media_person_name = ?')
        .get(params.mediaPersonId) as { tree_person_id: string } | undefined;
      if (link) {
        p = db.prepare(`SELECT * FROM ft_persons WHERE id = ? ${treeFilter}`).get(link.tree_person_id, ...treeParams) as
          | PersonRecord
          | undefined;
        if (p) return p;
      }
    }

    if (params.name && params.name.trim()) {
      const name = params.name.trim();

      // 1. Exact full name match
      let p = db
        .prepare(`
          SELECT * FROM ft_persons 
          WHERE (
            LOWER(TRIM(first_name || ' ' || COALESCE(last_name, ''))) = LOWER(?)
            OR LOWER(TRIM(first_name || ' ' || COALESCE(middle_name, '') || ' ' || COALESCE(last_name, ''))) = LOWER(?)
            OR LOWER(first_name) = LOWER(?)
            OR LOWER(media_person_id) = LOWER(?)
          ) ${treeFilter}
        `)
        .get(name, name, name, name, ...treeParams) as PersonRecord | undefined;
      if (p) return p;

      // 2. Check face link name
      const link = db
        .prepare('SELECT tree_person_id FROM ft_person_face_links WHERE LOWER(media_person_name) = LOWER(?)')
        .get(name) as { tree_person_id: string } | undefined;
      if (link) {
        p = db.prepare(`SELECT * FROM ft_persons WHERE id = ? ${treeFilter}`).get(link.tree_person_id, ...treeParams) as
          | PersonRecord
          | undefined;
        if (p) return p;
      }

      // 3. Substring fuzzy match
      p = db
        .prepare(`
          SELECT * FROM ft_persons 
          WHERE (first_name LIKE ? OR last_name LIKE ?) ${treeFilter}
          ORDER BY (CASE WHEN LOWER(first_name) = LOWER(?) THEN 1 ELSE 2 END)
          LIMIT 1
        `)
        .get(`%${name}%`, `%${name}%`, ...treeParams, name) as PersonRecord | undefined;
      if (p) return p;
    }

    return null;
  }

  /**
   * Discovers immediate family members (Parents, Spouses, Children, Siblings).
   */
  private getImmediateFamily(person: PersonRecord): {
    parents: ImmediateRelative[];
    spouses: ImmediateRelative[];
    children: ImmediateRelative[];
    siblings: ImmediateRelative[];
  } {
    const db = this.dbService.getDb();

    // 1. Parents
    const parentRows = db
      .prepare(`
        SELECT p.*
        FROM ft_child_relations cr
        JOIN ft_unions u ON cr.union_id = u.id
        JOIN ft_union_partners up ON u.id = up.union_id
        JOIN ft_persons p ON up.person_id = p.id
        WHERE cr.person_id = ?
      `)
      .all(person.id) as PersonRecord[];

    const parents: ImmediateRelative[] = parentRows.map((p) => {
      const term = p.gender === 'MALE' ? 'Father' : p.gender === 'FEMALE' ? 'Mother' : 'Parent';
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
      return {
        id: p.id,
        name,
        relation: term,
        avatarUrl: p.avatar_url || (p.avatar_face_id ? `/api/faces/image/${p.avatar_face_id}` : null),
      };
    });

    // 2. Spouses / Partners
    const spouseRows = db
      .prepare(`
        SELECT p.*, u.union_type
        FROM ft_union_partners up1
        JOIN ft_unions u ON up1.union_id = u.id
        JOIN ft_union_partners up2 ON u.id = up2.union_id
        JOIN ft_persons p ON up2.person_id = p.id
        WHERE up1.person_id = ? AND up2.person_id != ?
      `)
      .all(person.id, person.id) as Array<PersonRecord & { union_type: string }>;

    const spouses: ImmediateRelative[] = spouseRows.map((p) => {
      let term = p.gender === 'MALE' ? 'Husband' : p.gender === 'FEMALE' ? 'Wife' : 'Partner';
      if (p.union_type === 'DIVORCED') {
        term = `Ex-${term}`;
      }
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
      return {
        id: p.id,
        name,
        relation: term,
        avatarUrl: p.avatar_url || (p.avatar_face_id ? `/api/faces/image/${p.avatar_face_id}` : null),
      };
    });

    // 3. Children
    const childRows = db
      .prepare(`
        SELECT p.*, cr.filiation
        FROM ft_union_partners up
        JOIN ft_unions u ON up.union_id = u.id
        JOIN ft_child_relations cr ON u.id = cr.union_id
        JOIN ft_persons p ON cr.person_id = p.id
        WHERE up.person_id = ?
      `)
      .all(person.id) as Array<PersonRecord & { filiation: string }>;

    const children: ImmediateRelative[] = childRows.map((p) => {
      const isAdopted = p.filiation === 'ADOPTED';
      let term = p.gender === 'MALE' ? 'Son' : p.gender === 'FEMALE' ? 'Daughter' : 'Child';
      if (isAdopted) term = `Adopted ${term}`;
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
      return {
        id: p.id,
        name,
        relation: term,
        avatarUrl: p.avatar_url || (p.avatar_face_id ? `/api/faces/image/${p.avatar_face_id}` : null),
      };
    });

    // 4. Siblings
    const siblingRows = db
      .prepare(`
        SELECT DISTINCT p.*
        FROM ft_child_relations cr1
        JOIN ft_child_relations cr2 ON cr1.union_id = cr2.union_id
        JOIN ft_persons p ON cr2.person_id = p.id
        WHERE cr1.person_id = ? AND cr2.person_id != ?
      `)
      .all(person.id, person.id) as PersonRecord[];

    const siblings: ImmediateRelative[] = siblingRows.map((p) => {
      const term = p.gender === 'MALE' ? 'Brother' : p.gender === 'FEMALE' ? 'Sister' : 'Sibling';
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
      return {
        id: p.id,
        name,
        relation: term,
        avatarUrl: p.avatar_url || (p.avatar_face_id ? `/api/faces/image/${p.avatar_face_id}` : null),
      };
    });

    return { parents, spouses, children, siblings };
  }

  /**
   * Analyzes a group of detected faces/persons in a single photo, computes mutual kinship,
   * and generates rich contextual captions for AI engines and galleries.
   */
  public analyzePhotoKinship(dto: PhotoKinshipDto): PhotoKinshipResponse {
    const rawIdentifiers: Array<{ type: 'face' | 'name'; value: string }> = [];

    if (dto.face_ids && dto.face_ids.length > 0) {
      dto.face_ids.forEach((f) => rawIdentifiers.push({ type: 'face', value: f }));
    }
    if (dto.person_names && dto.person_names.length > 0) {
      dto.person_names.forEach((n) => rawIdentifiers.push({ type: 'name', value: n }));
    }

    const identifiedMap = new Map<string, { name: string; person: PersonRecord }>();

    for (const ident of rawIdentifiers) {
      const resolved =
        ident.type === 'face'
          ? this.resolvePerson({ faceId: ident.value })
          : this.resolvePerson({ name: ident.value });

      if (resolved) {
        const pName = [resolved.first_name, resolved.last_name].filter(Boolean).join(' ');
        if (!identifiedMap.has(resolved.id)) {
          identifiedMap.set(resolved.id, { name: pName || ident.value, person: resolved });
        }
      }
    }

    const identifiedPersonsList = Array.from(identifiedMap.values());
    const defaultTree = this.treeService.getOrCreateDefaultTree();
    const rootPersonId = defaultTree.root_person_id || (identifiedPersonsList[0]?.person?.id ?? '');

    const identifiedPersons = identifiedPersonsList.map(({ name, person }) => {
      const k = rootPersonId ? this.kinshipService.calculateKinship(rootPersonId, person.id) : null;
      return {
        name,
        treePersonId: person.id,
        avatarUrl: person.avatar_url || (person.avatar_face_id ? `/api/faces/image/${person.avatar_face_id}` : null),
        kinshipToRoot: k,
        kinship: k?.primaryTerm || null,
      };
    });

    // Pairwise relationships
    const relationships: PhotoKinshipResponse['relationships'] = [];
    for (let i = 0; i < identifiedPersonsList.length; i++) {
      for (let j = i + 1; j < identifiedPersonsList.length; j++) {
        const pA = identifiedPersonsList[i];
        const pB = identifiedPersonsList[j];
        const kAtoB = this.kinshipService.calculateKinship(pA.person.id, pB.person.id);
        const kBtoA = this.kinshipService.calculateKinship(pB.person.id, pA.person.id);

        relationships.push({
          personA: pA.name,
          personB: pB.name,
          kinshipAtoB: kAtoB.primaryTerm,
          kinshipBtoA: kBtoA.primaryTerm,
          category: kAtoB.category,
          person1: pA.name,
          person2: pB.name,
          relationship: kAtoB.primaryTerm,
        } as any);
      }
    }

    // Generate contextual captions
    let suggestedCaption = '';
    let summaryDescription = '';

    if (identifiedPersonsList.length === 0) {
      suggestedCaption = 'Photo without recognized family members.';
    } else if (identifiedPersonsList.length === 1) {
      const single = identifiedPersonsList[0];
      const k = rootPersonId ? this.kinshipService.calculateKinship(rootPersonId, single.person.id) : null;
      if (k && k.category === 'SELF') {
        suggestedCaption = `Portrait of ${single.name} (Myself).`;
      } else if (k && k.primaryTerm) {
        suggestedCaption = `Portrait of my ${k.primaryTerm}, ${single.name}.`;
      } else {
        suggestedCaption = `Portrait of ${single.name}.`;
      }
      summaryDescription = `Single-person portrait featuring ${single.name}.`;
    } else if (identifiedPersonsList.length === 2) {
      const p1 = identifiedPersonsList[0];
      const p2 = identifiedPersonsList[1];
      const rel = relationships[0];

      if (rel && rel.category === 'SPOUSE_PARTNER') {
        suggestedCaption = `Photo of ${p1.name} and spouse ${p2.name}.`;
        summaryDescription = `Spouses ${p1.name} and ${p2.name}.`;
      } else if (rel && rel.category === 'COLLATERAL' && (rel.kinshipAtoB.includes('Brother') || rel.kinshipAtoB.includes('Sister') || rel.kinshipAtoB.includes('Sibling'))) {
        suggestedCaption = `Siblings ${p1.name} and ${p2.name} together.`;
        summaryDescription = `Brother/sister photo of ${p1.name} and ${p2.name}.`;
      } else if (rel && (rel.category === 'DIRECT_ANCESTOR' || rel.category === 'DIRECT_DESCENDANT')) {
        suggestedCaption = `${p1.name} with ${rel.kinshipAtoB.toLowerCase()} ${p2.name}.`;
        summaryDescription = `Generational portrait of ${p1.name} and ${p2.name} (${rel.kinshipAtoB}).`;
      } else {
        suggestedCaption = `Photo of ${p1.name} and ${p2.name}${rel ? ` (${rel.kinshipAtoB})` : ''}.`;
        summaryDescription = `Family gathering featuring ${p1.name} and ${p2.name}.`;
      }
    } else {
      // 3 or more people
      const names = identifiedPersons.map((p) => p.name);
      const rootIdent = identifiedPersons.find((p) => p.treePersonId === rootPersonId);

      if (rootIdent) {
        const otherRelatives = identifiedPersons
          .filter((p) => p.treePersonId !== rootPersonId)
          .map((p) => {
            const term = p.kinshipToRoot?.primaryTerm;
            return term && term !== 'Unrelated / Unknown' ? `${term.toLowerCase()} ${p.name}` : p.name;
          });
        suggestedCaption = `Family gathering featuring ${rootIdent.name} with ${otherRelatives.join(', ')}.`;
      } else {
        suggestedCaption = `Family group portrait with ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`;
      }
      summaryDescription = `Multi-person family portrait with ${identifiedPersons.length} identified members.`;
    }

    // Contextual Milestones (Configurable Kinship in Media Gallery)
    const contextualMilestones: PhotoKinshipResponse['contextualMilestones'] = [];
    const db = this.dbService.getDb();

    const storedConfig = this.getGalleryKinshipFactsConfig();
    const isConfigEnabled = dto.enabled !== undefined ? dto.enabled : (storedConfig.enabled !== false);

    if (isConfigEnabled) {
      const scope = dto.gallery_facts_scope || storedConfig.scope || 'CLOSEST_FAMILY';
      const onlyClose = dto.only_close_events !== undefined ? dto.only_close_events : (storedConfig.onlyCloseEvents ?? true);
      const periodDays = dto.period_before_days !== undefined ? dto.period_before_days : (storedConfig.periodBeforeDays ?? 7);
      const allowedTypes = (dto.close_event_types || storedConfig.closeEventTypes || ['BIRTH', 'MARRIAGE', 'ANNIVERSARY', 'DEATH']).map((t) => t.toUpperCase());

      // Reference date for close events is always today
      const referenceDate = new Date();

      // Build list of target persons
      interface TargetPersonInfo {
        id: string;
        name: string;
        relationTerm?: string;
      }
      const targetMap = new Map<string, TargetPersonInfo>();

      for (const { name, person } of identifiedPersonsList) {
        targetMap.set(person.id, { id: person.id, name, relationTerm: 'Self' });

        if (scope === 'CLOSEST_FAMILY') {
          const imm = this.getImmediateFamily(person);
          for (const parent of imm.parents) {
            if (!targetMap.has(parent.id)) {
              targetMap.set(parent.id, { id: parent.id, name: parent.name, relationTerm: parent.relation });
            }
          }
          for (const spouse of imm.spouses) {
            if (!targetMap.has(spouse.id)) {
              targetMap.set(spouse.id, { id: spouse.id, name: spouse.name, relationTerm: spouse.relation });
            }
          }
          for (const child of imm.children) {
            if (!targetMap.has(child.id)) {
              targetMap.set(child.id, { id: child.id, name: child.name, relationTerm: child.relation });
            }
          }
          for (const sibling of imm.siblings) {
            if (!targetMap.has(sibling.id)) {
              targetMap.set(sibling.id, { id: sibling.id, name: sibling.name, relationTerm: sibling.relation });
            }
          }
        }
      }

      if (scope === 'ALL' && identifiedPersonsList.length > 0) {
        const treeId = identifiedPersonsList[0].person.tree_id;
        const allPersons = db.prepare('SELECT id, first_name, last_name FROM ft_persons WHERE tree_id = ?').all(treeId) as PersonRecord[];
        for (const p of allPersons) {
          if (!targetMap.has(p.id)) {
            const pName = [p.first_name, p.last_name].filter(Boolean).join(' ');
            targetMap.set(p.id, { id: p.id, name: pName || 'Relative', relationTerm: 'Relative' });
          }
        }
      }

      const seenEventIds = new Set<string>();
      const seenUnionKeys = new Set<string>();
      const seenReciprocalCoupleKeys = new Set<string>();
      const seenSharedTitleKeys = new Set<string>();
      const seenChildBornKeys = new Set<string>();

      for (const target of targetMap.values()) {
        const evts = db
          .prepare(`
            SELECT id, person_id, event_type, title, description, event_date, end_date, date_is_approximate, location_name, source_node_id, source_event_id
            FROM ft_person_events
            WHERE person_id = ?
            ORDER BY 
              CASE WHEN event_date IS NULL OR event_date = '' THEN 1 ELSE 0 END,
              event_date ASC,
              created_at ASC
          `)
          .all(target.id) as Array<any>;

        for (const e of evts) {
          const upperType = (e.event_type || '').toUpperCase();
          if (onlyClose) {
            if (!allowedTypes.includes(upperType)) continue;
            const closeCheck = this.isEventDateClose(e.event_date, referenceDate, periodDays);
            if (!closeCheck.isClose) continue;
          }

          if (e.id && seenEventIds.has(e.id)) continue;

          // 1. Union duplicate check (by source_node_id or reciprocal partner title)
          if (upperType === 'MARRIAGE' || upperType === 'DIVORCE' || upperType === 'ANNIVERSARY') {
            if (e.source_node_id) {
              const unionKey = `${upperType}_${e.source_node_id}_${e.event_date || ''}`;
              if (seenUnionKeys.has(unionKey)) continue;
              seenUnionKeys.add(unionKey);
            }

            const titleLower = (e.title || '').trim().toLowerCase();
            const partnerMatch = titleLower
              .replace(/^(partnership with|married to|married|divorced from|divorced|separated from|брак с|партнерство с|развод с)\s+/i, '')
              .trim();
            if (partnerMatch && partnerMatch !== titleLower) {
              const coupleKey = [target.name.toLowerCase().trim(), partnerMatch].sort().join('___') + '_' + (e.event_date || '') + '_' + upperType;
              if (seenReciprocalCoupleKeys.has(coupleKey)) continue;
              seenReciprocalCoupleKeys.add(coupleKey);
            }
          }

          // 2. Child birth vs CHILD_BORN deduplication
          if (upperType === 'CHILD_BORN') {
            const childKey = `child_born_${(e.source_node_id || e.title || '').toLowerCase().trim()}_${e.event_date || ''}`;
            if (seenChildBornKeys.has(childKey)) continue;
            seenChildBornKeys.add(childKey);
          } else if (upperType === 'BIRTH') {
            const birthKey = `child_born_${(target.id || target.name).toLowerCase().trim()}_${e.event_date || ''}`;
            if (seenChildBornKeys.has(birthKey)) continue;
            seenChildBornKeys.add(birthKey);
          }

          // 3. Exact same title & date duplicate across different relatives
          const sharedKey = `${upperType}_${(e.title || '').toLowerCase().trim()}_${e.event_date || ''}`;
          if (seenSharedTitleKeys.has(sharedKey)) continue;
          seenSharedTitleKeys.add(sharedKey);

          if (e.id) seenEventIds.add(e.id);

          const personLabel = target.relationTerm && target.relationTerm !== 'Self'
            ? `${target.name} (${target.relationTerm})`
            : target.name;

          contextualMilestones.push({
            id: e.id,
            personName: personLabel,
            eventType: e.event_type,
            title: e.title,
            description: e.description || null,
            date: e.event_date || null,
            end_date: e.end_date || null,
            date_is_approximate: e.date_is_approximate ? 1 : 0,
            location: e.location_name || null,
            category: e.event_type,
            relativeName: target.name,
            relativeRelation: target.relationTerm !== 'Self' ? target.relationTerm : undefined,
          });
        }
      }

      // Sort merged life timeline milestones chronologically
      contextualMilestones.sort((a, b) => {
        const d1 = a.date || '9999-99-99';
        const d2 = b.date || '9999-99-99';
        return d1.localeCompare(d2);
      });
    }

    return {
      identifiedPersons,
      relationships,
      suggestedCaption,
      summaryDescription,
      contextualMilestones,
    };
  }

  /**
   * Evaluates if a given event date is close to the reference date (e.g. within periodBeforeDays).
   * Supports annual recurring celebrations (birthdays, wedding anniversaries, memorials)
   * as well as direct proximity.
   */
  public isEventDateClose(
    eventDateStr: string | null | undefined,
    refDate: Date,
    periodBeforeDays: number = 7,
  ): { isClose: boolean; daysUntil: number; celebrationYear?: number } {
    if (!eventDateStr || typeof eventDateStr !== 'string') {
      return { isClose: false, daysUntil: 9999 };
    }

    const s = eventDateStr.trim();
    let month: number | undefined;
    let day: number | undefined;
    let year: number | undefined;

    // Matches YYYY-MM-DD or YYYY-MM
    const isoMatch = s.match(/^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/);
    if (isoMatch) {
      year = parseInt(isoMatch[1], 10);
      month = isoMatch[2] ? parseInt(isoMatch[2], 10) : undefined;
      day = isoMatch[3] ? parseInt(isoMatch[3], 10) : undefined;
    } else {
      // Matches DD.MM.YYYY
      const dotMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (dotMatch) {
        day = parseInt(dotMatch[1], 10);
        month = parseInt(dotMatch[2], 10);
        year = parseInt(dotMatch[3], 10);
      } else {
        // Matches MM/DD/YYYY
        const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (slashMatch) {
          month = parseInt(slashMatch[1], 10);
          day = parseInt(slashMatch[2], 10);
          year = parseInt(slashMatch[3], 10);
        } else {
          const d = new Date(s);
          if (!isNaN(d.getTime())) {
            year = d.getFullYear();
            month = d.getMonth() + 1;
            day = d.getDate();
          }
        }
      }
    }

    if (!month || !day) {
      return { isClose: false, daysUntil: 9999 };
    }

    const currentYear = refDate.getFullYear();
    const today = new Date(currentYear, refDate.getMonth(), refDate.getDate());

    // 1. Annual celebration recurrence check (birthdays, wedding anniversaries, memorials)
    const candidateYears = [currentYear - 1, currentYear, currentYear + 1];
    let minDiffAbs = 9999;
    let bestDiff = 9999;
    let bestYear = currentYear;

    for (const cy of candidateYears) {
      const annualDate = new Date(cy, month - 1, day);
      const diff = Math.round((annualDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (Math.abs(diff) < minDiffAbs) {
        minDiffAbs = Math.abs(diff);
        bestDiff = diff;
        bestYear = cy;
      }
    }

    if (minDiffAbs <= periodBeforeDays) {
      return { isClose: true, daysUntil: bestDiff, celebrationYear: bestYear };
    }

    // 2. Exact event date proximity check if year exists
    if (year) {
      const exactEventDate = new Date(year, month - 1, day);
      const exactDiffDays = Math.round((exactEventDate.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));
      if (Math.abs(exactDiffDays) <= periodBeforeDays) {
        return { isClose: true, daysUntil: exactDiffDays, celebrationYear: year };
      }
    }

    return { isClose: false, daysUntil: bestDiff };
  }

  /**
   * Retrieves persistent configuration for Kinship facts in media gallery.
   */
  public getGalleryKinshipFactsConfig(): GalleryKinshipFactsConfigDto {
    try {
      const db = this.dbService.getDb();
      const row = db.prepare('SELECT value FROM ft_settings WHERE key = ?').get('gallery_kinship_facts_config') as { value: string } | undefined;
      if (row && row.value) {
        return JSON.parse(row.value);
      }
    } catch {
      // ignore
    }
    return {
      enabled: true,
      scope: 'CLOSEST_FAMILY',
      onlyCloseEvents: true,
      periodBeforeDays: 7,
      closeEventTypes: ['BIRTH', 'MARRIAGE', 'ANNIVERSARY', 'DEATH'],
    };
  }

  /**
   * Saves persistent configuration for Kinship facts in media gallery.
   */
  public saveGalleryKinshipFactsConfig(dto: GalleryKinshipFactsConfigDto): GalleryKinshipFactsConfigDto {
    const current = this.getGalleryKinshipFactsConfig();
    const merged = { ...current, ...dto };
    try {
      const db = this.dbService.getDb();
      db.prepare(`
        INSERT INTO ft_settings (key, value, updated_at)
        VALUES ('gallery_kinship_facts_config', ?, datetime('now', 'localtime'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(JSON.stringify(merged));
    } catch {
      // ignore
    }
    return merged;
  }

  /**
   * Fast autocomplete search index across family members with kinship badges.
   */
  public getAutocomplete(query?: string, treeId?: string): AutocompletePersonItem[] {
    const db = this.dbService.getDb();
    const tree = treeId ? this.treeService.getTreeById(treeId) : this.treeService.getOrCreateDefaultTree();
    const rootPersonId = tree.root_person_id;

    let persons: PersonRecord[] = [];
    if (query && query.trim()) {
      const q = `%${query.trim()}%`;
      persons = db
        .prepare(`
          SELECT * FROM ft_persons
          WHERE tree_id = ? AND (
            first_name LIKE ? OR last_name LIKE ? OR maiden_name LIKE ? OR media_person_id LIKE ?
          )
          ORDER BY last_name ASC, first_name ASC
          LIMIT 20
        `)
        .all(tree.id, q, q, q, q) as PersonRecord[];
    } else {
      persons = db
        .prepare('SELECT * FROM ft_persons WHERE tree_id = ? ORDER BY last_name ASC, first_name ASC LIMIT 20')
        .all(tree.id) as PersonRecord[];
    }

    return persons.map((p) => {
      const fullName = [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ');
      const kinship = rootPersonId ? this.kinshipService.calculateKinship(rootPersonId, p.id) : null;
      const birthYear = p.birth_date ? p.birth_date.split('-')[0] : null;

      return {
        id: p.id,
        fullName: fullName || p.first_name,
        firstName: p.first_name,
        lastName: p.last_name || null,
        maidenName: p.maiden_name || null,
        avatarUrl: p.avatar_url || (p.avatar_face_id ? `/api/faces/image/${p.avatar_face_id}` : null),
        kinshipTerm: kinship?.primaryTerm || null,
        birthYear,
        isLiving: p.is_living === 1,
        mediaPersonId: p.media_person_id || null,
      };
    });
  }
}
