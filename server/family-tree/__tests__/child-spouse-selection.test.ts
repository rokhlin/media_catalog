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

describe('ChildSpouseSelectionAndUnknownParent', () => {
  let dbService: FamilyTreeDatabaseService;
  let treeService: FamilyTreeService;
  let publicService: FamilyTreePublicService;
  let dbPath: string;

  before(() => {
    const tmpDir = path.join(process.cwd(), 'media_output');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    dbPath = path.join(tmpDir, `test_child_spouse_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.db`);

    dbService = new FamilyTreeDatabaseService({ familyTreeDbPath: dbPath } as any);
    dbService.initDb();

    const integrityService = new GraphIntegrityService(dbService);
    const eventsService = new FamilyEventsService(dbService);
    treeService = new FamilyTreeService(dbService, integrityService, eventsService);
    const kinshipService = new KinshipEngineService(dbService);
    publicService = new FamilyTreePublicService(dbService, kinshipService, treeService);
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

  it('correctly handles spouse selection and unknown (empty second parent) for children', () => {
    const tree = treeService.getOrCreateDefaultTree();

    // 1. Create Person A (Father)
    const personA = treeService.createPerson({
      tree_id: tree.id,
      first_name: 'John',
      last_name: 'Doe',
      gender: 'MALE',
    });

    // 2. Create Spouse 1 (Jane) and link via union
    const spouse1 = treeService.createPerson({
      tree_id: tree.id,
      first_name: 'Jane',
      last_name: 'Doe',
      gender: 'FEMALE',
    });
    treeService.createUnion({
      tree_id: tree.id,
      partner_ids: [personA.id, spouse1.id],
      union_type: 'MARRIAGE',
    });

    // 3. Create Spouse 2 (Mary, Ex-spouse) and link via union
    const spouse2 = treeService.createPerson({
      tree_id: tree.id,
      first_name: 'Mary',
      last_name: 'Smith',
      gender: 'FEMALE',
    });
    treeService.createUnion({
      tree_id: tree.id,
      partner_ids: [personA.id, spouse2.id],
      union_type: 'DIVORCED',
    });

    // Case A: Add child linked to Spouse 1 (Jane)
    const childOfJane = treeService.quickAddRelative({
      relationship: 'CHILD',
      target_person_id: personA.id,
      other_parent_id: spouse1.id,
      person: {
        first_name: 'Alice',
        last_name: 'Doe',
        gender: 'FEMALE',
      },
    });

    const aliceContext = publicService.getPersonContext({ personId: childOfJane.person.id });
    const aliceParents = aliceContext.immediateFamily?.parents || [];
    assert.strictEqual(aliceParents.length, 2, 'Alice should have 2 parents');
    const aliceParentIds = aliceParents.map((p) => p.id);
    assert.ok(aliceParentIds.includes(personA.id), 'Alice parent should include John');
    assert.ok(aliceParentIds.includes(spouse1.id), 'Alice parent should include Jane');
    assert.ok(!aliceParentIds.includes(spouse2.id), 'Alice parent should NOT include Mary');

    // Case B: Add child linked to Spouse 2 (Mary)
    const childOfMary = treeService.quickAddRelative({
      relationship: 'CHILD',
      target_person_id: personA.id,
      other_parent_id: spouse2.id,
      person: {
        first_name: 'Bob',
        last_name: 'Doe',
        gender: 'MALE',
      },
    });

    const bobContext = publicService.getPersonContext({ personId: childOfMary.person.id });
    const bobParents = bobContext.immediateFamily?.parents || [];
    assert.strictEqual(bobParents.length, 2, 'Bob should have 2 parents');
    const bobParentIds = bobParents.map((p) => p.id);
    assert.ok(bobParentIds.includes(personA.id), 'Bob parent should include John');
    assert.ok(bobParentIds.includes(spouse2.id), 'Bob parent should include Mary');
    assert.ok(!bobParentIds.includes(spouse1.id), 'Bob parent should NOT include Jane');

    // Case C: Add child with Unknown second parent (other_parent_id empty string)
    const childUnknown = treeService.quickAddRelative({
      relationship: 'CHILD',
      target_person_id: personA.id,
      other_parent_id: '',
      person: {
        first_name: 'Charlie',
        last_name: 'Doe',
        gender: 'MALE',
      },
    });

    const charlieContext = publicService.getPersonContext({ personId: childUnknown.person.id });
    const charlieParents = charlieContext.immediateFamily?.parents || [];
    assert.strictEqual(charlieParents.length, 1, 'Charlie should have exactly 1 parent (single parent)');
    assert.strictEqual(charlieParents[0].id, personA.id, 'Charlie parent should only be John');
    assert.ok(!charlieParents.some((p) => p.id === spouse1.id), 'Charlie should NOT be linked to Jane');
    assert.ok(!charlieParents.some((p) => p.id === spouse2.id), 'Charlie should NOT be linked to Mary');

    // Case D: Add second child with unknown second parent (other_parent_id undefined)
    const childUnknown2 = treeService.quickAddRelative({
      relationship: 'CHILD',
      target_person_id: personA.id,
      other_parent_id: undefined,
      person: {
        first_name: 'Daisy',
        last_name: 'Doe',
        gender: 'FEMALE',
      },
    });

    const daisyContext = publicService.getPersonContext({ personId: childUnknown2.person.id });
    const daisyParents = daisyContext.immediateFamily?.parents || [];
    assert.strictEqual(daisyParents.length, 1, 'Daisy should have exactly 1 parent (single parent)');
    assert.strictEqual(daisyParents[0].id, personA.id, 'Daisy parent should only be John');
  });
});
