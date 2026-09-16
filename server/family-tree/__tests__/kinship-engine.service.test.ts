import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FamilyTreeDatabaseService } from '../family-tree-db.service.js';
import { KinshipEngineService } from '../kinship-engine.service.js';
import { FamilyTreeService } from '../family-tree.service.js';
import { GraphIntegrityService } from '../graph-integrity.service.js';
import { FamilyEventsService } from '../family-events.service.js';

describe('KinshipEngineService', () => {
  let dbService: FamilyTreeDatabaseService;
  let kinshipEngine: KinshipEngineService;
  let treeService: FamilyTreeService;
  let dbPath: string;
  let treeId: string;

  before(() => {
    const tmpDir = path.join(process.cwd(), 'media_output');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    dbPath = path.join(tmpDir, `test_kinship_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.db`);

    dbService = new FamilyTreeDatabaseService({ familyTreeDbPath: dbPath } as any);
    kinshipEngine = new KinshipEngineService(dbService);
    const integrityService = new GraphIntegrityService(dbService);
    const eventsService = new FamilyEventsService(dbService);
    treeService = new FamilyTreeService(dbService, integrityService, eventsService);

    const createdTree = treeService.createTree({ name: 'Kinship Test Tree' });
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

  it('should deduce Self when comparing person with themselves', () => {
    const me = treeService.createPerson({
      tree_id: treeId,
      first_name: 'Alex',
      gender: 'MALE',
      is_living: true,
    });

    const kinship = kinshipEngine.calculateKinship(me.id, me.id);
    assert.strictEqual(kinship.primaryTerm, 'Self');
    assert.strictEqual(kinship.category, 'SELF');
    assert.strictEqual(kinship.degreeOfConsanguinity, 0);
    assert.strictEqual(kinship.generationalDistance, 0);
    assert.strictEqual(kinship.isDirectBlood, true);
  });

  it('should deduce Direct Ancestor lines: Mother, Father, Grandparents', () => {
    // Grandfather & Grandmother
    const gFather = treeService.createPerson({ tree_id: treeId, first_name: 'Arthur', gender: 'MALE', is_living: false });
    const gMother = treeService.createPerson({ tree_id: treeId, first_name: 'Eleanor', gender: 'FEMALE', is_living: false });
    const gUnion = treeService.createUnion({ tree_id: treeId, partner_ids: [gFather.id, gMother.id], union_type: 'MARRIAGE' });

    // Mother
    const mother = treeService.createPerson({ tree_id: treeId, first_name: 'Sarah', gender: 'FEMALE', is_living: true });
    treeService.addChildToUnion(gUnion.id, { person_id: mother.id, filiation: 'BIOLOGICAL' });

    // Father & Marriage to Mother
    const father = treeService.createPerson({ tree_id: treeId, first_name: 'Robert', gender: 'MALE', is_living: true });
    const parentUnion = treeService.createUnion({ tree_id: treeId, partner_ids: [father.id, mother.id], union_type: 'MARRIAGE' });

    // Child (Alex)
    const alex = treeService.createPerson({ tree_id: treeId, first_name: 'Alex', gender: 'MALE', is_living: true });
    treeService.addChildToUnion(parentUnion.id, { person_id: alex.id, filiation: 'BIOLOGICAL' });

    // Deductions from Alex's perspective:
    const kMother = kinshipEngine.calculateKinship(alex.id, mother.id);
    assert.strictEqual(kMother.primaryTerm, 'Mother');
    assert.strictEqual(kMother.generationalDistance, 1);
    assert.strictEqual(kMother.degreeOfConsanguinity, 1);
    assert.strictEqual(kMother.isDirectBlood, true);

    const kFather = kinshipEngine.calculateKinship(alex.id, father.id);
    assert.strictEqual(kFather.primaryTerm, 'Father');
    assert.strictEqual(kFather.generationalDistance, 1);

    const kGFather = kinshipEngine.calculateKinship(alex.id, gFather.id);
    assert.strictEqual(kGFather.primaryTerm, 'Grandfather');
    assert.strictEqual(kGFather.generationalDistance, 2);
    assert.strictEqual(kGFather.degreeOfConsanguinity, 2);

    const kGMother = kinshipEngine.calculateKinship(alex.id, gMother.id);
    assert.strictEqual(kGMother.primaryTerm, 'Grandmother');
    assert.strictEqual(kGMother.generationalDistance, 2);
  });

  it('should deduce Full-Siblings and Collaterals: Brother, Sister, Uncle, Aunt', () => {
    const gFather = treeService.createPerson({ tree_id: treeId, first_name: 'Arthur2', gender: 'MALE', is_living: false });
    const gMother = treeService.createPerson({ tree_id: treeId, first_name: 'Eleanor2', gender: 'FEMALE', is_living: false });
    const gUnion = treeService.createUnion({ tree_id: treeId, partner_ids: [gFather.id, gMother.id], union_type: 'MARRIAGE' });

    // Children of grandparents: Mother (Sarah) and Uncle (David)
    const mother = treeService.createPerson({ tree_id: treeId, first_name: 'Sarah2', gender: 'FEMALE', is_living: true });
    const uncle = treeService.createPerson({ tree_id: treeId, first_name: 'David2', gender: 'MALE', is_living: true });
    treeService.addChildToUnion(gUnion.id, { person_id: mother.id, filiation: 'BIOLOGICAL' });
    treeService.addChildToUnion(gUnion.id, { person_id: uncle.id, filiation: 'BIOLOGICAL' });

    // Mother's family: Alex and Sister Emma
    const father = treeService.createPerson({ tree_id: treeId, first_name: 'Robert2', gender: 'MALE', is_living: true });
    const pUnion = treeService.createUnion({ tree_id: treeId, partner_ids: [father.id, mother.id], union_type: 'MARRIAGE' });

    const alex = treeService.createPerson({ tree_id: treeId, first_name: 'Alex2', gender: 'MALE', is_living: true });
    const emma = treeService.createPerson({ tree_id: treeId, first_name: 'Emma2', gender: 'FEMALE', is_living: true });
    treeService.addChildToUnion(pUnion.id, { person_id: alex.id, filiation: 'BIOLOGICAL' });
    treeService.addChildToUnion(pUnion.id, { person_id: emma.id, filiation: 'BIOLOGICAL' });

    // Sister
    const kSister = kinshipEngine.calculateKinship(alex.id, emma.id);
    assert.strictEqual(kSister.primaryTerm, 'Sister');
    assert.strictEqual(kSister.category, 'COLLATERAL');
    assert.strictEqual(kSister.degreeOfConsanguinity, 2);

    // Uncle
    const kUncle = kinshipEngine.calculateKinship(alex.id, uncle.id);
    assert.strictEqual(kUncle.primaryTerm, 'Uncle');
    assert.strictEqual(kUncle.generationalDistance, 1);
    assert.strictEqual(kUncle.degreeOfConsanguinity, 3);
  });

  it('should deduce Cousins (1st Cousin, Cousin removals)', () => {
    const gFather = treeService.createPerson({ tree_id: treeId, first_name: 'GFA', gender: 'MALE', is_living: false });
    const gMother = treeService.createPerson({ tree_id: treeId, first_name: 'GMA', gender: 'FEMALE', is_living: false });
    const gUnion = treeService.createUnion({ tree_id: treeId, partner_ids: [gFather.id, gMother.id], union_type: 'MARRIAGE' });

    const parentA = treeService.createPerson({ tree_id: treeId, first_name: 'ParentA', gender: 'FEMALE', is_living: true });
    const parentB = treeService.createPerson({ tree_id: treeId, first_name: 'ParentB', gender: 'MALE', is_living: true });
    treeService.addChildToUnion(gUnion.id, { person_id: parentA.id, filiation: 'BIOLOGICAL' });
    treeService.addChildToUnion(gUnion.id, { person_id: parentB.id, filiation: 'BIOLOGICAL' });

    // Child of Parent A (Me)
    const unionA = treeService.createUnion({ tree_id: treeId, partner_ids: [parentA.id], union_type: 'PARTNERSHIP' });
    const me = treeService.createPerson({ tree_id: treeId, first_name: 'Me', gender: 'MALE', is_living: true });
    treeService.addChildToUnion(unionA.id, { person_id: me.id, filiation: 'BIOLOGICAL' });

    // Child of Parent B (1st Cousin)
    const unionB = treeService.createUnion({ tree_id: treeId, partner_ids: [parentB.id], union_type: 'PARTNERSHIP' });
    const cousin = treeService.createPerson({ tree_id: treeId, first_name: 'Cousin', gender: 'FEMALE', is_living: true });
    treeService.addChildToUnion(unionB.id, { person_id: cousin.id, filiation: 'BIOLOGICAL' });

    const kCousin = kinshipEngine.calculateKinship(me.id, cousin.id);
    assert.strictEqual(kCousin.primaryTerm, '1st Cousin');
    assert.strictEqual(kCousin.degreeOfConsanguinity, 4);
    assert.strictEqual(kCousin.generationalDistance, 0);
  });

  it('should deduce Affinity & In-Law relationships (Spouse, Father-in-law, Mother-in-law)', () => {
    const me = treeService.createPerson({ tree_id: treeId, first_name: 'Hero', gender: 'MALE', is_living: true });
    const spouse = treeService.createPerson({ tree_id: treeId, first_name: 'Wife', gender: 'FEMALE', is_living: true });
    treeService.createUnion({ tree_id: treeId, partner_ids: [me.id, spouse.id], union_type: 'MARRIAGE' });

    const filFather = treeService.createPerson({ tree_id: treeId, first_name: 'WifeDad', gender: 'MALE', is_living: true });
    const filMother = treeService.createPerson({ tree_id: treeId, first_name: 'WifeMom', gender: 'FEMALE', is_living: true });
    const filUnion = treeService.createUnion({ tree_id: treeId, partner_ids: [filFather.id, filMother.id], union_type: 'MARRIAGE' });
    treeService.addChildToUnion(filUnion.id, { person_id: spouse.id, filiation: 'BIOLOGICAL' });

    // Spouse
    const kSpouse = kinshipEngine.calculateKinship(me.id, spouse.id);
    assert.strictEqual(kSpouse.primaryTerm, 'Wife');
    assert.strictEqual(kSpouse.category, 'SPOUSE_PARTNER');

    // Father-in-law & Mother-in-law
    const kFil = kinshipEngine.calculateKinship(me.id, filFather.id);
    assert.strictEqual(kFil.primaryTerm, 'Father-in-law');
    assert.strictEqual(kFil.category, 'AFFINITY');

    const kMil = kinshipEngine.calculateKinship(me.id, filMother.id);
    assert.strictEqual(kMil.primaryTerm, 'Mother-in-law');
    assert.strictEqual(kMil.category, 'AFFINITY');
  });

  it('should deduce Non-Biological Filiations (Adopted Child, Step-Child)', () => {
    const parent = treeService.createPerson({ tree_id: treeId, first_name: 'AdoptiveMom', gender: 'FEMALE', is_living: true });
    const adoptedChild = treeService.createPerson({ tree_id: treeId, first_name: 'AdoptedSon', gender: 'MALE', is_living: true });
    const union = treeService.createUnion({ tree_id: treeId, partner_ids: [parent.id], union_type: 'PARTNERSHIP' });

    treeService.addChildToUnion(union.id, { person_id: adoptedChild.id, filiation: 'ADOPTED' });

    const kAdopted = kinshipEngine.calculateKinship(parent.id, adoptedChild.id);
    assert.strictEqual(kAdopted.primaryTerm, 'Adopted Son');
    assert.strictEqual(kAdopted.isDirectBlood, false);
  });
});
