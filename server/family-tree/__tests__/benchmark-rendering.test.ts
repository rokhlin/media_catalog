import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FamilyTreeDatabaseService } from '../family-tree-db.service.js';
import { FamilyTreeService } from '../family-tree.service.js';
import { GraphIntegrityService } from '../graph-integrity.service.js';
import { FamilyEventsService } from '../family-events.service.js';
import ELK from 'elkjs/lib/elk.bundled.js';

describe('FamilyTreePerformanceBenchmark', () => {
  let dbService: FamilyTreeDatabaseService;
  let treeService: FamilyTreeService;
  let eventsService: FamilyEventsService;
  let dbPath: string;
  let treeId: string;

  before(() => {
    const tmpDir = path.join(process.cwd(), 'media_output');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    dbPath = path.join(tmpDir, `test_benchmark_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.db`);

    dbService = new FamilyTreeDatabaseService({ familyTreeDbPath: dbPath } as any);
    const integrityService = new GraphIntegrityService(dbService);
    eventsService = new FamilyEventsService(dbService);
    treeService = new FamilyTreeService(dbService, integrityService, eventsService);

    const createdTree = treeService.createTree({ name: 'Benchmark Tree' });
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

  it('should scale to 1,000+ nodes and facts with fast query and layout performance', async () => {
    const NODE_COUNT = 1000;
    const db = dbService.getDb();

    // 1. Bulk insert 1,000 persons and 500 unions in a single SQLite transaction
    const insertStartTime = performance.now();
    const insertPersonsTx = db.transaction(() => {
      const insertPersonStmt = db.prepare(`
        INSERT INTO ft_persons (id, tree_id, first_name, last_name, gender, birth_date, is_living, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);

      const insertUnionStmt = db.prepare(`
        INSERT INTO ft_unions (id, tree_id, union_type, start_date, created_at, updated_at)
        VALUES (?, ?, 'MARRIAGE', '1980-01-01', datetime('now'), datetime('now'))
      `);

      const insertPartnerStmt = db.prepare(`
        INSERT INTO ft_union_partners (id, union_id, person_id) VALUES (?, ?, ?)
      `);

      const insertChildStmt = db.prepare(`
        INSERT INTO ft_child_relations (id, union_id, person_id, filiation, birth_order) VALUES (?, ?, ?, 'BIOLOGICAL', ?)
      `);

      const insertEventStmt = db.prepare(`
        INSERT INTO ft_person_events (id, person_id, event_type, title, event_date, is_system_generated, created_at, updated_at)
        VALUES (?, ?, 'BIRTH', 'Birth Event', '1980-01-01', 1, datetime('now'), datetime('now'))
      `);

      for (let i = 1; i <= NODE_COUNT; i++) {
        const pId = `p_bench_${i}`;
        const evtId = `evt_bench_${i}_${Math.random().toString(36).substring(2, 6)}`;
        insertPersonStmt.run(pId, treeId, `Person${i}`, `Family${Math.floor(i / 10)}`, i % 2 === 0 ? 'MALE' : 'FEMALE', '1980-05-12', 1);
        insertEventStmt.run(evtId, pId);
      }

      // Every 2 persons form a union with 2 children
      for (let i = 2; i <= NODE_COUNT; i += 4) {
        const uId = `u_bench_${i}`;
        insertUnionStmt.run(uId, treeId);
        insertPartnerStmt.run(`part_${uId}_1`, uId, `p_bench_${i - 1}`);
        insertPartnerStmt.run(`part_${uId}_2`, uId, `p_bench_${i}`);

        if (i + 1 <= NODE_COUNT) {
          insertChildStmt.run(`ch_${uId}_1`, uId, `p_bench_${i + 1}`, 1);
        }
        if (i + 2 <= NODE_COUNT) {
          insertChildStmt.run(`ch_${uId}_2`, uId, `p_bench_${i + 2}`, 2);
        }
      }
    });

    insertPersonsTx();
    const insertDuration = performance.now() - insertStartTime;
    console.log(`[Benchmark] 1,000 nodes bulk SQLite transaction completed in ${insertDuration.toFixed(2)}ms`);
    assert.ok(insertDuration < 3000, `Bulk insert should complete in < 3s, took ${insertDuration.toFixed(2)}ms`);

    // 2. Fetch entire 1,000-node graph
    const fetchStartTime = performance.now();
    const fullGraph = treeService.getTreeGraph(treeId);
    const fetchDuration = performance.now() - fetchStartTime;
    console.log(`[Benchmark] getTreeGraph for ${fullGraph.persons.length} persons completed in ${fetchDuration.toFixed(2)}ms`);
    assert.strictEqual(fullGraph.persons.length, NODE_COUNT);
    assert.ok(fetchDuration < 500, `getTreeGraph should execute in < 500ms, took ${fetchDuration.toFixed(2)}ms`);

    // 3. Compute ELK layered layout for the 1,000-node graph
    const elk = new (ELK as any)();
    const elkGraph = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'DOWN',
        'elk.spacing.nodeNode': '40',
        'elk.layered.spacing.nodeNodeBetweenLayers': '60',
      },
      children: fullGraph.persons.map((p) => ({
        id: p.id,
        width: 240,
        height: 100,
      })),
      edges: fullGraph.unions.flatMap((u, idx) =>
        u.children.map((ch, cIdx) => ({
          id: `e_${idx}_${cIdx}`,
          sources: [u.partner_ids[0] || u.id],
          targets: [ch.person_id],
        })),
      ),
    };

    const layoutStartTime = performance.now();
    const layoutResult = await elk.layout(elkGraph);
    const layoutDuration = performance.now() - layoutStartTime;
    console.log(`[Benchmark] ELK layered layout for ${layoutResult.children?.length} nodes & ${layoutResult.edges?.length} edges completed in ${layoutDuration.toFixed(2)}ms`);
    assert.strictEqual(layoutResult.children?.length, NODE_COUNT, 'All 1,000 nodes laid out');
    assert.ok(layoutDuration < 5000, `ELK layout for 1,000 nodes should complete in < 5s, took ${layoutDuration.toFixed(2)}ms`);
  });
});
