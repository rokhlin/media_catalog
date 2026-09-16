import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FamilyTreeDatabaseService } from '../family-tree-db.service.js';
import { FamilyTreeService } from '../family-tree.service.js';
import { GraphIntegrityService } from '../graph-integrity.service.js';
import { FamilyEventsService } from '../family-events.service.js';
import { KinshipEngineService } from '../kinship-engine.service.js';
import { FamilyTreePublicService } from '../family-tree-public.service.js';

describe('FamilyEventsService', () => {
  let dbService: FamilyTreeDatabaseService;
  let eventsService: FamilyEventsService;
  let treeService: FamilyTreeService;
  let dbPath: string;
  let treeId: string;

  before(() => {
    const tmpDir = path.join(process.cwd(), 'media_output');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    dbPath = path.join(tmpDir, `test_events_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.db`);

    dbService = new FamilyTreeDatabaseService({ familyTreeDbPath: dbPath } as any);
    const integrityService = new GraphIntegrityService(dbService);
    eventsService = new FamilyEventsService(dbService);
    treeService = new FamilyTreeService(dbService, integrityService, eventsService);

    const createdTree = treeService.createTree({ name: 'Events Test Tree' });
    treeId = createdTree.id;
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

  it('should auto-propagate BIRTH and DEATH system events upon person creation and update', () => {
    const person = treeService.createPerson({
      tree_id: treeId,
      first_name: 'William',
      last_name: 'Shakespeare',
      gender: 'MALE',
      birth_date: '1564-04-26',
      birth_place: 'Stratford-upon-Avon',
      is_living: false,
      death_date: '1616-04-23',
      death_place: 'Stratford-upon-Avon',
    });

    const timeline = eventsService.getPersonTimeline(person.id);
    const birthEvent = timeline.find((e) => e.event_type === 'BIRTH');
    const deathEvent = timeline.find((e) => e.event_type === 'DEATH');

    assert.ok(birthEvent, 'Birth event should be auto-created');
    assert.strictEqual(birthEvent?.event_date, '1564-04-26');
    assert.strictEqual(birthEvent?.location_name, 'Stratford-upon-Avon');
    assert.strictEqual(birthEvent?.is_system_generated, 1);

    assert.ok(deathEvent, 'Death event should be auto-created');
    assert.strictEqual(deathEvent?.event_date, '1616-04-23');
    assert.strictEqual(deathEvent?.is_system_generated, 1);
  });

  it('should auto-propagate MARRIAGE and DIVORCE events to all union partners', () => {
    const husband = treeService.createPerson({ tree_id: treeId, first_name: 'Henry', gender: 'MALE', is_living: true });
    const wife = treeService.createPerson({ tree_id: treeId, first_name: 'Catherine', gender: 'FEMALE', is_living: true });

    const union = treeService.createUnion({
      tree_id: treeId,
      partner_ids: [husband.id, wife.id],
      union_type: 'MARRIAGE',
      start_date: '1509-06-11',
      start_place: 'Greenwich',
    });

    // Check Marriage propagated to husband
    const husbandTimeline = eventsService.getPersonTimeline(husband.id);
    const hMarriage = husbandTimeline.find((e) => e.event_type === 'MARRIAGE');
    assert.ok(hMarriage, 'Husband receives marriage event');
    assert.strictEqual(hMarriage?.event_date, '1509-06-11');
    assert.strictEqual(hMarriage?.location_name, 'Greenwich');

    // Check Marriage propagated to wife
    const wifeTimeline = eventsService.getPersonTimeline(wife.id);
    const wMarriage = wifeTimeline.find((e) => e.event_type === 'MARRIAGE');
    assert.ok(wMarriage, 'Wife receives marriage event');

    // Now update union to DIVORCED
    treeService.updateUnion(union.id, {
      union_type: 'DIVORCED',
      end_date: '1533-05-23',
    });

    const updatedHusbandTimeline = eventsService.getPersonTimeline(husband.id);
    const divorceEvt = updatedHusbandTimeline.find((e) => e.event_type === 'DIVORCE');
    assert.ok(divorceEvt, 'Husband receives divorce event');
    assert.strictEqual(divorceEvt?.event_date, '1533-05-23');
  });

  it('should auto-propagate CHILD_BORN milestone to both parents when a child is added to union', () => {
    const dad = treeService.createPerson({ tree_id: treeId, first_name: 'Dad', gender: 'MALE', is_living: true });
    const mom = treeService.createPerson({ tree_id: treeId, first_name: 'Mom', gender: 'FEMALE', is_living: true });
    const union = treeService.createUnion({ tree_id: treeId, partner_ids: [dad.id, mom.id], union_type: 'MARRIAGE' });

    const baby = treeService.createPerson({
      tree_id: treeId,
      first_name: 'Baby',
      last_name: 'Johnson',
      gender: 'FEMALE',
      birth_date: '2020-01-15',
      birth_place: 'New York',
      is_living: true,
    });

    treeService.addChildToUnion(union.id, { person_id: baby.id, filiation: 'BIOLOGICAL' });

    // Check dad received child born event
    const dadTimeline = eventsService.getPersonTimeline(dad.id);
    const dadChildBorn = dadTimeline.find((e) => e.event_type === 'CHILD_BORN');
    assert.ok(dadChildBorn, 'Dad receives CHILD_BORN milestone');
    assert.strictEqual(dadChildBorn?.event_date, '2020-01-15');
    assert.ok(dadChildBorn?.title.includes('Baby'), 'Event title names the child');

    // Check mom received child born event
    const momTimeline = eventsService.getPersonTimeline(mom.id);
    const momChildBorn = momTimeline.find((e) => e.event_type === 'CHILD_BORN');
    assert.ok(momChildBorn, 'Mom receives CHILD_BORN milestone');
  });

  it('should support manual Life Facts CRUD and Gallery Photo Pinning', () => {
    const person = treeService.createPerson({ tree_id: treeId, first_name: 'Scholar', gender: 'FEMALE', is_living: true });

    // Create Fact
    const fact = eventsService.createEvent(person.id, {
      event_type: 'GRADUATION',
      title: 'Ph.D. in Computer Science',
      description: 'Graduated summa cum laude with thesis on distributed graphs',
      event_date: '2015-06-12',
      date_is_approximate: false,
      location_name: 'Stanford University',
      latitude: 37.4275,
      longitude: -122.1697,
    });

    assert.ok(fact.id, 'Fact should have an ID');
    assert.strictEqual(fact.is_system_generated, 0);

    // Pin 2 gallery photos to fact
    const pin1 = eventsService.pinMediaToEvent(fact.id, {
      media_file_path: '/photos/stanford_graduation_1.jpg',
      caption: 'Holding diploma on stage',
      display_order: 1,
    });

    const pin2 = eventsService.pinMediaToEvent(fact.id, {
      media_file_path: '/photos/stanford_graduation_2.jpg',
      caption: 'Celebration with family',
      display_order: 2,
    });

    assert.ok(pin1.id && pin2.id, 'Pins created successfully');

    // Retrieve timeline with pinned photos
    const timeline = eventsService.getPersonTimeline(person.id);
    const retrievedFact = timeline.find((e) => e.id === fact.id);
    assert.ok(retrievedFact, 'Found created fact in timeline');
    assert.strictEqual(retrievedFact?.pinned_media?.length, 2, 'Fact should have 2 pinned photos');

    // Unpin one photo
    eventsService.unpinMedia(pin1.id);
    const updatedTimeline = eventsService.getPersonTimeline(person.id);
    const updatedFact = updatedTimeline.find((e) => e.id === fact.id);
    assert.strictEqual(updatedFact?.pinned_media?.length, 1, 'Fact should have 1 pinned photo remaining');

    // Delete fact
    eventsService.deleteEvent(fact.id);
    const finalTimeline = eventsService.getPersonTimeline(person.id);
    assert.ok(!finalTimeline.some((e) => e.id === fact.id), 'Fact should be deleted');
  });

  it('should not duplicate facts when createEvent is called with existing ID or same title/type', () => {
    const person = treeService.createPerson({
      tree_id: treeId,
      first_name: 'Isaac',
      last_name: 'Newton',
      gender: 'MALE',
    });

    const fact1 = eventsService.createEvent(person.id, {
      id: 'fact_custom_123',
      event_type: 'GRADUATION',
      title: 'Trinity College',
      description: 'Admitted to Trinity College, Cambridge',
    });

    assert.strictEqual(fact1.id, 'fact_custom_123');

    // Attempt to create again with same ID
    const factDuplicateId = eventsService.createEvent(person.id, {
      id: 'fact_custom_123',
      event_type: 'GRADUATION',
      title: 'Trinity College',
      description: 'Updated admission info',
    });

    assert.strictEqual(factDuplicateId.id, 'fact_custom_123');
    assert.strictEqual(factDuplicateId.description, 'Updated admission info');

    // Attempt to create with same person, event_type and title without ID
    const factSameTitle = eventsService.createEvent(person.id, {
      event_type: 'GRADUATION',
      title: 'Trinity College',
      description: 'Second update',
    });

    assert.strictEqual(factSameTitle.id, 'fact_custom_123');
    assert.strictEqual(factSameTitle.description, 'Second update');

    const timeline = eventsService.getPersonTimeline(person.id);
    const gradEvents = timeline.filter((e) => e.event_type === 'GRADUATION');
    assert.strictEqual(gradEvents.length, 1, 'Should have exactly 1 GRADUATION event, no duplicates');
  });

  it('should propagate CHILD_BORN event to new partner when union partner_ids are updated', () => {
    const parent1 = treeService.createPerson({ tree_id: treeId, first_name: 'Father1', gender: 'MALE' });
    const parent2 = treeService.createPerson({ tree_id: treeId, first_name: 'Mother1', gender: 'FEMALE' });
    const child = treeService.createPerson({ tree_id: treeId, first_name: 'Child1', gender: 'FEMALE', birth_date: '2020-01-01' });

    // Union initially has only parent1
    const union = treeService.createUnion({
      tree_id: treeId,
      partner_ids: [parent1.id],
      union_type: 'MARRIAGE',
    });

    treeService.addChildToUnion(union.id, { person_id: child.id, filiation: 'BIOLOGICAL' });

    const timelineP1Before = eventsService.getPersonTimeline(parent1.id);
    assert.ok(timelineP1Before.some((e) => e.event_type === 'CHILD_BORN' && e.title.includes('Child1')));

    const timelineP2Before = eventsService.getPersonTimeline(parent2.id);
    assert.ok(!timelineP2Before.some((e) => e.event_type === 'CHILD_BORN'));

    // Now update union to include parent2
    treeService.updateUnion(union.id, { partner_ids: [parent1.id, parent2.id] });

    const timelineP2After = eventsService.getPersonTimeline(parent2.id);
    const p2ChildBorn = timelineP2After.filter((e) => e.event_type === 'CHILD_BORN');
    assert.strictEqual(p2ChildBorn.length, 1, 'Parent2 should have received CHILD_BORN event');
    assert.ok(p2ChildBorn[0].title.includes('Child1'));
  });

  it('should deduplicate reciprocal partnership milestones and shared events in analyzePhotoKinship', () => {
    const kinshipService = new KinshipEngineService(dbService);
    const publicService = new FamilyTreePublicService(dbService, kinshipService, treeService);

    const personA = treeService.createPerson({ tree_id: treeId, first_name: 'Anton', last_name: 'Rokhlin', gender: 'MALE' });
    const personB = treeService.createPerson({ tree_id: treeId, first_name: 'Oxana', last_name: 'Wagner', gender: 'FEMALE' });

    // Create union between Anton & Oxana
    treeService.createUnion({
      tree_id: treeId,
      partner_ids: [personA.id, personB.id],
      union_type: 'MARRIAGE',
      start_date: '2006-09-01',
    });

    // Analyze photo where Anton is identified, scope CLOSEST_FAMILY (includes Oxana)
    const result = publicService.analyzePhotoKinship({
      person_names: ['Anton Rokhlin'],
      gallery_facts_scope: 'CLOSEST_FAMILY',
      only_close_events: false,
    });

    const milestones = result.contextualMilestones;
    const partnershipMilestones = milestones.filter((m) =>
      m.title.toLowerCase().includes('partnership') || m.title.toLowerCase().includes('married')
    );

    // There should ONLY be 1 partnership milestone, NOT 2 reciprocal ones!
    assert.strictEqual(partnershipMilestones.length, 1, 'Should contain exactly 1 partnership milestone for the couple, no reciprocal duplication');
    assert.ok(partnershipMilestones[0].personName.includes('Anton Rokhlin'), 'Should attribute the milestone to the photo participant');
  });
});

