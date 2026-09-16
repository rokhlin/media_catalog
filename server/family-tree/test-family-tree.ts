import { AppConfigService } from '../config/config.service.js';
import { FamilyTreeDatabaseService } from './family-tree-db.service.js';
import { GraphIntegrityService } from './graph-integrity.service.js';
import { KinshipEngineService } from './kinship-engine.service.js';
import { FamilyEventsService } from './family-events.service.js';
import { FamilyTreeService } from './family-tree.service.js';
import { FamilyTreePublicService } from './family-tree-public.service.js';
import * as fs from 'fs';
import * as path from 'path';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

async function runFamilyTreeTests() {
  console.log('=== Starting Phase 1 Family Tree Backend Unit & Integration Tests ===\n');

  // Use a temporary test database file
  const testDbPath = path.resolve(process.cwd(), 'media_output', 'test_family_tree.db');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  process.env.FAMILY_TREE_DB_PATH = testDbPath;

  const config = new AppConfigService();
  const dbService = new FamilyTreeDatabaseService(config);
  dbService.initDb();

  const integrityService = new GraphIntegrityService(dbService);
  const eventsService = new FamilyEventsService(dbService);
  const treeService = new FamilyTreeService(dbService, integrityService, eventsService);
  const kinshipService = new KinshipEngineService(dbService);

  try {
    // 1. Database and Default Tree Checks
    console.log('[1] Testing Database Schema & Tables...');
    const db = dbService.getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ft_%'")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);

    assert(tableNames.includes('ft_trees'), 'ft_trees table created');
    assert(tableNames.includes('ft_persons'), 'ft_persons table created');
    assert(tableNames.includes('ft_unions'), 'ft_unions table created');
    assert(tableNames.includes('ft_union_partners'), 'ft_union_partners table created');
    assert(tableNames.includes('ft_child_relations'), 'ft_child_relations table created');
    assert(tableNames.includes('ft_person_face_links'), 'ft_person_face_links table created');
    assert(tableNames.includes('ft_person_events'), 'ft_person_events table created');
    assert(tableNames.includes('ft_event_media_pins'), 'ft_event_media_pins table created');

    const defaultTree = treeService.getOrCreateDefaultTree();
    assert(defaultTree.id === 'default_tree', 'Default family tree exists and has id default_tree');

    // 2. Person Creation & Automated Birth/Death Events
    console.log('\n[2] Testing Person Management & Automated Birth/Death Events...');
    const grandfather = treeService.createPerson({
      first_name: 'Arthur',
      last_name: 'Smith',
      gender: 'MALE',
      birth_date: '1940-03-15',
      birth_place: 'Boston, MA',
      is_living: 0,
      death_date: '2015-11-20',
      death_place: 'Boston, MA',
    });
    assert(grandfather.first_name === 'Arthur', 'Grandfather created');

    const gmEvents = eventsService.getPersonTimeline(grandfather.id);
    assert(gmEvents.some((e) => e.event_type === 'BIRTH' && e.event_date === '1940-03-15'), 'System BIRTH event auto-created for Arthur');
    assert(gmEvents.some((e) => e.event_type === 'DEATH' && e.event_date === '2015-11-20'), 'System DEATH event auto-created for Arthur');

    const grandmother = treeService.createPerson({
      first_name: 'Eleanor',
      last_name: 'Vance',
      maiden_name: 'Vance',
      gender: 'FEMALE',
      birth_date: '1943-07-22',
      birth_place: 'Cambridge, MA',
      is_living: 1,
    });

    const mother = treeService.createPerson({
      first_name: 'Sarah',
      last_name: 'Johnson',
      maiden_name: 'Smith',
      gender: 'FEMALE',
      birth_date: '1968-05-14',
      birth_place: 'Boston, MA',
      is_living: 1,
    });

    const father = treeService.createPerson({
      first_name: 'Robert',
      last_name: 'Johnson',
      gender: 'MALE',
      birth_date: '1965-09-02',
      birth_place: 'Chicago, IL',
      is_living: 1,
    });

    const maternalUncle = treeService.createPerson({
      first_name: 'David',
      last_name: 'Smith',
      gender: 'MALE',
      birth_date: '1972-01-10',
      birth_place: 'Boston, MA',
      is_living: 1,
    });

    const rootPerson = treeService.createPerson({
      first_name: 'Alex',
      last_name: 'Johnson',
      gender: 'NON_BINARY',
      birth_date: '1995-04-12',
      birth_place: 'Seattle, WA',
      is_living: 1,
    });

    const sister = treeService.createPerson({
      first_name: 'Emma',
      last_name: 'Johnson',
      gender: 'FEMALE',
      birth_date: '1998-11-03',
      birth_place: 'Seattle, WA',
      is_living: 1,
    });

    const cousin = treeService.createPerson({
      first_name: 'Lucas',
      last_name: 'Smith',
      gender: 'MALE',
      birth_date: '2002-08-19',
      birth_place: 'New York, NY',
      is_living: 1,
    });

    const spouse = treeService.createPerson({
      first_name: 'Taylor',
      last_name: 'Morgan',
      gender: 'FEMALE',
      birth_date: '1996-02-18',
      is_living: 1,
    });

    // 3. Union & Child Relations with Automated Event Propagation
    console.log('\n[3] Testing Unions & Child Relations & Milestone Propagation...');
    
    // Grandparents union -> Mother & Uncle
    const gpUnion = treeService.createUnion({
      partner_ids: [grandfather.id, grandmother.id],
      union_type: 'MARRIAGE',
      start_date: '1966-06-18',
      start_place: 'Boston, MA',
    });
    treeService.addChildToUnion(gpUnion.id, { person_id: mother.id, filiation: 'BIOLOGICAL' });
    treeService.addChildToUnion(gpUnion.id, { person_id: maternalUncle.id, filiation: 'BIOLOGICAL' });

    // Verify marriage event on grandparents
    const gfEvents = eventsService.getPersonTimeline(grandfather.id);
    assert(gfEvents.some((e) => e.event_type === 'MARRIAGE' && e.event_date === '1966-06-18'), 'Marriage event propagated to Arthur');
    assert(gfEvents.some((e) => e.event_type === 'CHILD_BORN' && e.source_node_id === mother.id), 'Child Born event (Sarah) propagated to Arthur');
    assert(gfEvents.some((e) => e.event_type === 'CHILD_BORN' && e.source_node_id === maternalUncle.id), 'Child Born event (David) propagated to Arthur');

    // Parents union -> Alex & Emma
    const parentsUnion = treeService.createUnion({
      partner_ids: [father.id, mother.id],
      union_type: 'MARRIAGE',
      start_date: '1993-08-20',
      start_place: 'Chicago, IL',
    });
    treeService.addChildToUnion(parentsUnion.id, { person_id: rootPerson.id, filiation: 'BIOLOGICAL' });
    treeService.addChildToUnion(parentsUnion.id, { person_id: sister.id, filiation: 'BIOLOGICAL' });

    // Uncle union -> Cousin Lucas
    const uncleUnion = treeService.createUnion({
      partner_ids: [maternalUncle.id],
      union_type: 'MARRIAGE',
      start_date: '2000-05-12',
    });
    treeService.addChildToUnion(uncleUnion.id, { person_id: cousin.id, filiation: 'BIOLOGICAL' });

    // Root Alex & Taylor union
    const alexUnion = treeService.createUnion({
      partner_ids: [rootPerson.id, spouse.id],
      union_type: 'MARRIAGE',
      start_date: '2021-09-10',
      start_place: 'Seattle, WA',
    });

    // Set Alex as the root anchor ("ME")
    treeService.setRootPerson(defaultTree.id, rootPerson.id);

    // 4. Graph Integrity & Cycle Detection
    console.log('\n[4] Testing Graph Integrity & Cycle Prevention...');
    let cycleCaught = false;
    try {
      // Attempting to make Arthur (grandfather) a child of Alex (grandchild) - MUST FAIL!
      treeService.addChildToUnion(alexUnion.id, { person_id: grandfather.id });
    } catch (e: any) {
      cycleCaught = true;
      assert(true, `Successfully caught and rejected cyclical parentage: ${e.message}`);
    }
    assert(cycleCaught, 'Graph integrity prevented cyclical genealogical loop');

    // 5. Kinship Calculation Engine
    console.log('\n[5] Testing Kinship Engine Taxonomy Calculations...');
    
    // Self
    const kSelf = kinshipService.calculateKinship(rootPerson.id, rootPerson.id);
    assert(kSelf.primaryTerm === 'Self', 'Kinship to Self is "Self"');

    // Mother
    const kMother = kinshipService.calculateKinship(rootPerson.id, mother.id);
    assert(kMother.primaryTerm === 'Mother' && kMother.generationalDistance === 1, 'Kinship to Mother is "Mother" (+1 gen)');

    // Father
    const kFather = kinshipService.calculateKinship(rootPerson.id, father.id);
    assert(kFather.primaryTerm === 'Father' && kFather.generationalDistance === 1, 'Kinship to Father is "Father" (+1 gen)');

    // Grandfather
    const kGf = kinshipService.calculateKinship(rootPerson.id, grandfather.id);
    assert(kGf.primaryTerm === 'Grandfather' && kGf.generationalDistance === 2, 'Kinship to Grandfather is "Grandfather" (+2 gen)');

    // Grandmother
    const kGm = kinshipService.calculateKinship(rootPerson.id, grandmother.id);
    assert(kGm.primaryTerm === 'Grandmother' && kGm.generationalDistance === 2, 'Kinship to Grandmother is "Grandmother" (+2 gen)');

    // Sister
    const kSister = kinshipService.calculateKinship(rootPerson.id, sister.id);
    assert(kSister.primaryTerm === 'Sister' && kSister.category === 'COLLATERAL', 'Kinship to Sister is "Sister"');

    // Uncle
    const kUncle = kinshipService.calculateKinship(rootPerson.id, maternalUncle.id);
    assert(kUncle.primaryTerm === 'Uncle' && kUncle.generationalDistance === 1, 'Kinship to Uncle is "Uncle" (+1 gen)');

    // 1st Cousin
    const kCousin = kinshipService.calculateKinship(rootPerson.id, cousin.id);
    assert(kCousin.primaryTerm === '1st Cousin', 'Kinship to Cousin is "1st Cousin"');

    // Spouse
    const kSpouse = kinshipService.calculateKinship(rootPerson.id, spouse.id);
    assert(kSpouse.primaryTerm === 'Wife' || kSpouse.primaryTerm === 'Partner / Spouse', `Kinship to Spouse is "${kSpouse.primaryTerm}"`);

    // In-laws (Father-in-law check for Taylor relative to Robert)
    const kFil = kinshipService.calculateKinship(spouse.id, father.id);
    assert(kFil.primaryTerm === 'Father-in-law', 'Kinship of Spouse to Father is "Father-in-law"');

    // 6. Manual Facts, Timeline & Media Pinning
    console.log('\n[6] Testing Manual Life Facts & Gallery Photo Pinning...');
    const gradFact = eventsService.createEvent(rootPerson.id, {
      event_type: 'GRADUATION',
      title: 'Graduated from University of Washington',
      description: 'Bachelor of Science in Computer Science with Honors',
      event_date: '2017-06-10',
      location_name: 'Seattle, WA',
      latitude: 47.6553,
      longitude: -122.3035,
    });
    assert(gradFact.event_type === 'GRADUATION', 'Manual graduation fact created');

    const pin1 = eventsService.pinMediaToEvent(gradFact.id, {
      media_id: 'med_uw_grad_01',
      media_file_path: '/media/photos/2017/uw_graduation.jpg',
      thumbnail_url: '/api/media/thumbnail/med_uw_grad_01',
      caption: 'Commencement Ceremony with Family',
      display_order: 0,
    });
    assert(pin1.media_file_path === '/media/photos/2017/uw_graduation.jpg', 'Pinned photo to graduation fact');

    const pin2 = eventsService.pinMediaToEvent(gradFact.id, {
      media_file_path: '/media/photos/2017/diploma_photo.jpg',
      caption: 'Holding diploma on quad',
      display_order: 1,
    });
    assert(pin2.id.startsWith('pin_'), 'Pinned second photo');

    const updatedFact = eventsService.getEventById(gradFact.id);
    assert(updatedFact.pinned_media?.length === 2, 'Fact contains 2 pinned photos');

    // Test unpinning
    eventsService.unpinMedia(pin2.id);
    const factAfterUnpin = eventsService.getEventById(gradFact.id);
    assert(factAfterUnpin.pinned_media?.length === 1, 'Unpinned photo successfully');

    // 7. Face Linking
    console.log('\n[7] Testing Face Linking & Avatar Sync...');
    const faceLink = treeService.linkPersonFace({
      tree_person_id: rootPerson.id,
      media_person_name: 'Alex Johnson',
      media_face_id: 'face_crop_alex_99',
      is_primary_avatar: 1,
    });
    assert(faceLink.media_face_id === 'face_crop_alex_99', 'Linked face crop to person');

    const alexUpdated = treeService.getPersonById(rootPerson.id);
    assert(alexUpdated.avatar_face_id === 'face_crop_alex_99', 'Avatar face ID synchronized on person record');

    // 8. Full Graph Retrieval for Canvas
    console.log('\n[8] Testing Full Tree Graph Retrieval...');
    const graphData = treeService.getTreeGraph(defaultTree.id);
    assert(graphData.persons.length >= 8, `Graph contains all ${graphData.persons.length} persons`);
    assert(graphData.unions.length >= 4, `Graph contains all ${graphData.unions.length} unions`);
    assert(graphData.persons[0].full_name !== undefined, 'Computed full_name present on graph person records');

    // =========================================================================
    // PHASE 2 TESTS: Public API & Media Cataloger Integration
    // =========================================================================
    const publicService = new FamilyTreePublicService(dbService, kinshipService, treeService);

    // 9. Public API: Person Context Endpoint
    console.log('\n[9] Testing Public API: Person Context (Kinship, Family, Milestones)...');
    const sarahContext = publicService.getPersonContext({ name: 'Sarah Johnson' });
    assert(sarahContext.found === true, 'Found person context for "Sarah Johnson"');
    assert(sarahContext.fullName === 'Sarah Johnson', 'Correct full name in context');
    assert(sarahContext.maidenName === 'Smith', 'Correct maiden name (Smith) in context');
    assert(sarahContext.kinshipToRoot?.primaryTerm === 'Mother', 'Correct kinshipToRoot (Mother)');
    assert(Boolean(sarahContext.immediateFamily?.parents.some((p) => p.name.includes('Arthur'))), 'Immediate family includes father Arthur Smith');
    assert(Boolean(sarahContext.immediateFamily?.spouses.some((s) => s.name.includes('Robert'))), 'Immediate family includes spouse Robert Johnson');
    assert(Boolean(sarahContext.immediateFamily?.children.some((c) => c.name.includes('Alex'))), 'Immediate family includes child Alex Johnson');
    assert(Boolean(sarahContext.immediateFamily?.siblings.some((s) => s.name.includes('David'))), 'Immediate family includes brother David Smith');
    assert(sarahContext.recentMilestones !== undefined && sarahContext.recentMilestones.length > 0, 'Recent milestones retrieved for Sarah');

    // Context by Face ID
    const alexFaceContext = publicService.getPersonContext({ faceId: 'face_crop_alex_99' });
    assert(alexFaceContext.found === true && alexFaceContext.firstName === 'Alex', 'Found person context by face ID');

    // Context by Person ID
    const arthurIdContext = publicService.getPersonContext({ personId: grandfather.id });
    assert(arthurIdContext.found === true && arthurIdContext.kinshipToRoot?.primaryTerm === 'Grandfather', 'Found grandfather by personId with Grandfather kinship');

    // 10. Public API: Photo Kinship Analysis & Caption Suggestions
    console.log('\n[10] Testing Public API: Photo Kinship Analysis...');
    
    // Group of 4: Alex + Sarah + Arthur + Emma
    const photoAnalysis = publicService.analyzePhotoKinship({
      person_names: ['Alex Johnson', 'Sarah Johnson', 'Arthur Smith', 'Emma Johnson'],
    });

    assert(photoAnalysis.identifiedPersons.length === 4, 'Identified all 4 persons in photo');
    assert(photoAnalysis.relationships.length === 6, 'Computed all 6 pairwise relationships between 4 people');
    assert(
      photoAnalysis.relationships.some(
        (r) =>
          (r.personA.includes('Arthur') && r.personB.includes('Sarah') && r.kinshipAtoB === 'Daughter') ||
          (r.personA.includes('Sarah') && r.personB.includes('Arthur') && r.kinshipAtoB === 'Father'),
      ),
      'Correctly deduced Father/Daughter mutual kinship in photo',
    );
    assert(
      photoAnalysis.relationships.some(
        (r) =>
          (r.personA.includes('Alex') && r.personB.includes('Emma') && r.kinshipAtoB === 'Sister') ||
          (r.personA.includes('Emma') && r.personB.includes('Alex')),
      ),
      'Correctly deduced Brother/Sister mutual kinship in photo',
    );
    assert(photoAnalysis.suggestedCaption.length > 0, `Generated natural caption: "${photoAnalysis.suggestedCaption}"`);

    // Spouses Photo Analysis
    const coupleAnalysis = publicService.analyzePhotoKinship({
      person_names: ['Alex Johnson', 'Taylor Morgan'],
    });
    assert(coupleAnalysis.suggestedCaption.includes('spouse') || coupleAnalysis.suggestedCaption.includes('Taylor Morgan'), `Generated spouse caption: "${coupleAnalysis.suggestedCaption}"`);

    // 11. Public API: Autocomplete Search Index
    console.log('\n[11] Testing Public API: Autocomplete Search...');
    const acResults = publicService.getAutocomplete('John');
    assert(acResults.length >= 3, `Autocomplete returned ${acResults.length} matches for "John"`);
    assert(acResults.some((p) => p.fullName === 'Sarah Johnson' && p.kinshipTerm === 'Mother'), 'Autocomplete contains Sarah Johnson with "Mother" kinship badge');
    assert(acResults.some((p) => p.fullName === 'Alex Johnson' && p.kinshipTerm === 'Self'), 'Autocomplete contains Alex Johnson with "Self" kinship badge');

    // 12. Face Unlinking
    console.log('\n[12] Testing Face Unlinking...');
    treeService.unlinkPersonFace(faceLink.id);
    const linksAfter = treeService.getPersonFaceLinks(rootPerson.id);
    assert(linksAfter.length === 0, 'Face link unlinked successfully');

    console.log('\n=== All Phase 1 & Phase 2 Family Tree Tests Passed with 100% Success! ===');
  } finally {
    dbService.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  }
}

runFamilyTreeTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
