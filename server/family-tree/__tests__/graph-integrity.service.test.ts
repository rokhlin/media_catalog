import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FamilyTreeDatabaseService } from '../family-tree-db.service.js';
import { FamilyTreeService } from '../family-tree.service.js';
import { GraphIntegrityService } from '../graph-integrity.service.js';
import { FamilyEventsService } from '../family-events.service.js';

describe('GraphIntegrityService', () => {
  let dbService: FamilyTreeDatabaseService;
  let treeService: FamilyTreeService;
  let dbPath: string;
  let treeId: string;

  before(() => {
    const tmpDir = path.join(process.cwd(), 'media_output');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    dbPath = path.join(tmpDir, `test_integrity_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.db`);

    dbService = new FamilyTreeDatabaseService({ familyTreeDbPath: dbPath } as any);
    const integrityService = new GraphIntegrityService(dbService);
    const eventsService = new FamilyEventsService(dbService);
    treeService = new FamilyTreeService(dbService, integrityService, eventsService);

    const createdTree = treeService.createTree({ name: 'Integrity Test Tree' });
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

  it('should reject direct parent-child cycle (making parent a child of their child)', () => {
    const parent = treeService.createPerson({ tree_id: treeId, first_name: 'ParentA', gender: 'MALE', is_living: true });
    const child = treeService.createPerson({ tree_id: treeId, first_name: 'ChildA', gender: 'FEMALE', is_living: true });

    const parentUnion = treeService.createUnion({ tree_id: treeId, partner_ids: [parent.id], union_type: 'PARTNERSHIP' });
    treeService.addChildToUnion(parentUnion.id, { person_id: child.id });

    // Try to make parent a child of child's union
    const childUnion = treeService.createUnion({ tree_id: treeId, partner_ids: [child.id], union_type: 'PARTNERSHIP' });

    assert.throws(
      () => {
        treeService.addChildToUnion(childUnion.id, { person_id: parent.id });
      },
      (err: any) => {
        return err.message.includes('Cycle detected');
      },
      'Should throw Cycle detected error when setting ancestor as child',
    );
  });

  it('should reject deep multi-generation ancestor loops (A -> B -> C -> A)', () => {
    const gen1 = treeService.createPerson({ tree_id: treeId, first_name: 'Gen1', gender: 'MALE', is_living: true });
    const gen2 = treeService.createPerson({ tree_id: treeId, first_name: 'Gen2', gender: 'FEMALE', is_living: true });
    const gen3 = treeService.createPerson({ tree_id: treeId, first_name: 'Gen3', gender: 'MALE', is_living: true });

    // Gen1 -> Gen2
    const u1 = treeService.createUnion({ tree_id: treeId, partner_ids: [gen1.id], union_type: 'PARTNERSHIP' });
    treeService.addChildToUnion(u1.id, { person_id: gen2.id });

    // Gen2 -> Gen3
    const u2 = treeService.createUnion({ tree_id: treeId, partner_ids: [gen2.id], union_type: 'PARTNERSHIP' });
    treeService.addChildToUnion(u2.id, { person_id: gen3.id });

    // Try to make Gen1 child of Gen3
    const u3 = treeService.createUnion({ tree_id: treeId, partner_ids: [gen3.id], union_type: 'PARTNERSHIP' });

    assert.throws(
      () => {
        treeService.addChildToUnion(u3.id, { person_id: gen1.id });
      },
      (err: any) => {
        return err.message.includes('Cycle detected');
      },
      'Should prevent deep ancestor cycle',
    );
  });

  it('should reject adding a descendant as a union partner to their ancestor union', () => {
    const parent = treeService.createPerson({ tree_id: treeId, first_name: 'ParentB', gender: 'MALE', is_living: true });
    const child = treeService.createPerson({ tree_id: treeId, first_name: 'ChildB', gender: 'FEMALE', is_living: true });
    const union = treeService.createUnion({ tree_id: treeId, partner_ids: [parent.id], union_type: 'PARTNERSHIP' });

    treeService.addChildToUnion(union.id, { person_id: child.id });

    // Try to add child as partner to parent's union
    assert.throws(
      () => {
        treeService.addPartnerToUnion(union.id, child.id);
      },
      (err: any) => {
        return Boolean(err.message);
      },
      'Should prevent adding descendant as partner to ancestor union',
    );
  });
});
