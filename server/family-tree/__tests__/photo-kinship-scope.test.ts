import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FamilyTreeDatabaseService } from '../family-tree-db.service.js';
import { GraphIntegrityService } from '../graph-integrity.service.js';
import { FamilyEventsService } from '../family-events.service.js';
import { FamilyTreeService } from '../family-tree.service.js';
import { KinshipEngineService } from '../kinship-engine.service.js';
import { FamilyTreePublicService } from '../family-tree-public.service.js';

describe('PhotoKinshipScopeAndDynamicUpdates', () => {
  let dbService: FamilyTreeDatabaseService;
  let treeService: FamilyTreeService;
  let kinshipService: KinshipEngineService;
  let eventsService: FamilyEventsService;
  let publicService: FamilyTreePublicService;
  let dbPath: string;

  before(() => {
    const tmpDir = path.join(process.cwd(), 'media_output');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    dbPath = path.join(tmpDir, `test_scope_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.db`);

    dbService = new FamilyTreeDatabaseService({ familyTreeDbPath: dbPath } as any);
    const integrityService = new GraphIntegrityService(dbService);
    eventsService = new FamilyEventsService(dbService);
    treeService = new FamilyTreeService(dbService, integrityService, eventsService);
    kinshipService = new KinshipEngineService(dbService);
    publicService = new FamilyTreePublicService(dbService, kinshipService, treeService);

    // Initialize default tree
    const defaultTree = treeService.getOrCreateDefaultTree();

    // 1. Create Root Person (Anton)
    const anton = treeService.createPerson({
      tree_id: defaultTree.id,
      first_name: 'Anton',
      last_name: 'Rokhlin',
      gender: 'MALE',
      birth_date: '1985-05-15',
    });
    treeService.setRootPerson(defaultTree.id, anton.id);

    // 2. Create Spouse (Oxana)
    const oxana = treeService.createPerson({
      tree_id: defaultTree.id,
      first_name: 'Oxana',
      last_name: 'Wagner',
      gender: 'FEMALE',
      birth_date: '1988-08-20',
    });

    // 3. Create Child (Mia)
    const mia = treeService.createPerson({
      tree_id: defaultTree.id,
      first_name: 'Mia',
      last_name: 'Rokhlin',
      gender: 'FEMALE',
      birth_date: '2015-03-10',
    });

    // 4. Create Distant relative / Cousin (Dmitry)
    const dmitry = treeService.createPerson({
      tree_id: defaultTree.id,
      first_name: 'Dmitry',
      last_name: 'Ivanov',
      gender: 'MALE',
      birth_date: '1990-11-25',
    });

    // Create Union between Anton and Oxana with child Mia
    const union = treeService.createUnion({
      tree_id: defaultTree.id,
      partner_ids: [anton.id, oxana.id],
      union_type: 'MARRIAGE',
      start_date: '2012-07-07',
    });
    treeService.addChildToUnion(union.id, { person_id: mia.id });

    // Anton own events
    eventsService.createEvent(anton.id, {
      event_type: 'BIRTH',
      title: 'Anton Birthday',
      event_date: '1985-05-15',
    });
    eventsService.createEvent(anton.id, {
      event_type: 'GRADUATION',
      title: 'Anton University Degree',
      description: 'Graduated in Computer Science',
      event_date: '2007-06-20',
      location_name: 'Haifa',
    });
    eventsService.createEvent(anton.id, {
      event_type: 'CAREER',
      title: 'Software Architect at TechCorp',
      event_date: '2018-02-01',
    });
    eventsService.createEvent(anton.id, {
      event_type: 'TRAVEL',
      title: 'Family Journey to Japan',
      event_date: '2019-10-15',
    });

    // Oxana event (spouse - closest family)
    eventsService.createEvent(oxana.id, {
      event_type: 'BIRTH',
      title: 'Oxana Birthday',
      event_date: '1988-08-20',
    });

    // Mia events (child - closest family)
    eventsService.createEvent(mia.id, {
      event_type: 'BIRTH',
      title: 'Mia Birthday',
      event_date: '2015-03-10',
    });
    eventsService.createEvent(mia.id, {
      event_type: 'GRADUATION',
      title: 'Mia Elementary Graduation',
      event_date: '2023-06-01',
    });

    // Dmitry event (all - not closest)
    eventsService.createEvent(dmitry.id, {
      event_type: 'BIRTH',
      title: 'Dmitry Birthday',
      event_date: '1990-11-25',
    });
  });

  after(() => {
    try {
      dbService.close();
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      const wal = `${dbPath}-wal`;
      const shm = `${dbPath}-shm`;
      if (fs.existsSync(wal)) fs.unlinkSync(wal);
      if (fs.existsSync(shm)) fs.unlinkSync(shm);
    } catch {
      // ignore
    }
  });

  it('should return only own facts when gallery_facts_scope is OWN with complete uncapped timeline', () => {
    const res = publicService.analyzePhotoKinship({
      person_names: ['Anton Rokhlin'],
      gallery_facts_scope: 'OWN',
      only_close_events: false,
    });

    // Anton has Birth, Marriage (propagated), Child Born (propagated), Graduation, Career, Travel
    assert.ok(res.contextualMilestones.length >= 5, 'Should have all timeline events without 2-item cap');
    const personNames = new Set(res.contextualMilestones.map((m) => m.personName));
    assert.strictEqual(personNames.has('Anton Rokhlin'), true);
    assert.strictEqual(personNames.has('Oxana Wagner'), false);
    assert.strictEqual(personNames.has('Mia Rokhlin'), false);
    assert.strictEqual(personNames.has('Dmitry Ivanov'), false);

    const gradEvent = res.contextualMilestones.find((m) => m.eventType === 'GRADUATION');
    assert.ok(gradEvent, 'Should contain graduation event from Life Timeline');
    assert.strictEqual(gradEvent.description, 'Graduated in Computer Science');
    assert.strictEqual(gradEvent.location, 'Haifa');

    // Chronological order verification
    for (let i = 1; i < res.contextualMilestones.length; i++) {
      const prevDate = res.contextualMilestones[i - 1].date || '';
      const currDate = res.contextualMilestones[i].date || '';
      if (prevDate && currDate) {
        assert.ok(prevDate <= currDate, `Events must be sorted chronologically: ${prevDate} <= ${currDate}`);
      }
    }
  });

  it('should return own and immediate family facts when gallery_facts_scope is CLOSEST_FAMILY', () => {
    const res = publicService.analyzePhotoKinship({
      person_names: ['Anton Rokhlin'],
      gallery_facts_scope: 'CLOSEST_FAMILY',
      only_close_events: false,
    });

    const hasAnton = res.contextualMilestones.some((m) => m.personName.startsWith('Anton Rokhlin'));
    const hasOxana = res.contextualMilestones.some((m) => m.personName.startsWith('Oxana Wagner'));
    const hasMia = res.contextualMilestones.some((m) => m.personName.startsWith('Mia Rokhlin'));
    const hasDmitry = res.contextualMilestones.some((m) => m.personName.startsWith('Dmitry Ivanov'));

    assert.strictEqual(hasAnton, true);
    assert.strictEqual(hasOxana, true);
    assert.strictEqual(hasMia, true);
    assert.strictEqual(hasDmitry, false, 'Dmitry is not immediate family');
  });

  it('should return all tree facts when gallery_facts_scope is ALL', () => {
    const res = publicService.analyzePhotoKinship({
      person_names: ['Anton Rokhlin'],
      gallery_facts_scope: 'ALL',
      only_close_events: false,
    });

    const hasAnton = res.contextualMilestones.some((m) => m.personName.startsWith('Anton Rokhlin'));
    const hasOxana = res.contextualMilestones.some((m) => m.personName.startsWith('Oxana Wagner'));
    const hasMia = res.contextualMilestones.some((m) => m.personName.startsWith('Mia Rokhlin'));
    const hasDmitry = res.contextualMilestones.some((m) => m.personName.startsWith('Dmitry Ivanov'));

    assert.strictEqual(hasAnton, true);
    assert.strictEqual(hasOxana, true);
    assert.strictEqual(hasMia, true);
    assert.strictEqual(hasDmitry, true, 'Dmitry should be included in ALL');
    assert.ok(res.contextualMilestones.length >= 4);
  });

  it('should return empty milestones when enabled is false', () => {
    const res = publicService.analyzePhotoKinship({
      person_names: ['Anton Rokhlin'],
      enabled: false,
      gallery_facts_scope: 'ALL',
    });

    assert.strictEqual(res.contextualMilestones.length, 0);
    assert.ok(res.identifiedPersons.length > 0);
  });
});
