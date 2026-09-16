import { describe, it } from 'node:test';
import assert from 'node:assert';
import { computeElkLayout } from '../elk-layout.worker.js';
import type { TreeGraphData } from '../../types/tree.types.js';

describe('ELK Layout Worker Engine', () => {
  const sampleGraph: TreeGraphData = {
    tree: {
      id: 'test_tree',
      name: 'Test Family Tree',
      living_privacy_mode: 'SHOW_ALL',
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
    },
    persons: [
      {
        id: 'father',
        tree_id: 'test_tree',
        first_name: 'John',
        last_name: 'Doe',
        full_name: 'John Doe',
        gender: 'MALE',
        is_living: 1,
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      },
      {
        id: 'mother',
        tree_id: 'test_tree',
        first_name: 'Jane',
        last_name: 'Doe',
        full_name: 'Jane Doe',
        gender: 'FEMALE',
        is_living: 1,
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      },
      {
        id: 'child',
        tree_id: 'test_tree',
        first_name: 'Junior',
        last_name: 'Doe',
        full_name: 'Junior Doe',
        gender: 'MALE',
        is_living: 1,
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      },
    ],
    unions: [
      {
        id: 'parents',
        tree_id: 'test_tree',
        partner_ids: ['father', 'mother'],
        union_type: 'MARRIAGE',
        children: [
          {
            person_id: 'child',
            filiation: 'BIOLOGICAL',
            birth_order: 1,
          },
        ],
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      },
    ],
  };

  it('should compute layered layout in vertical (TB) mode', async () => {
    const layout = await computeElkLayout(sampleGraph, 'TB', new Set<string>());

    assert.ok(layout, 'Layout output should exist');
    assert.ok(Array.isArray(layout.nodes), 'Nodes should be an array');
    assert.ok(Array.isArray(layout.edges), 'Edges should be an array');

    // Should contain 3 person nodes + 1 union node
    assert.strictEqual(layout.nodes.length, 4);

    const fatherNode = layout.nodes.find((n) => n.id === 'p_father');
    const childNode = layout.nodes.find((n) => n.id === 'p_child');

    assert.ok(fatherNode && childNode);
    // In TB mode, father should be positioned above child (lower Y)
    assert.ok(fatherNode.position.y < childNode.position.y, 'Parents should be above children in TB mode');
  });

  it('should compute layered layout in horizontal (LR) mode', async () => {
    const layout = await computeElkLayout(sampleGraph, 'LR', new Set<string>());

    assert.strictEqual(layout.nodes.length, 4);

    const fatherNode = layout.nodes.find((n) => n.id === 'p_father');
    const childNode = layout.nodes.find((n) => n.id === 'p_child');

    assert.ok(fatherNode && childNode);
    // In LR mode, father should be positioned to the left of child (lower X)
    assert.ok(fatherNode.position.x < childNode.position.x, 'Parents should be to the left of children in LR mode');
  });

  it('should filter out descendant subtrees when a branch is folded', async () => {
    // Fold father node
    const foldedLayout = await computeElkLayout(sampleGraph, 'TB', new Set<string>(['father']));

    const visibleNodeIds = foldedLayout.nodes.map((n) => n.id);
    assert.ok(visibleNodeIds.includes('p_father'), 'Folded node itself should remain visible');
    assert.strictEqual(visibleNodeIds.includes('p_child'), false, 'Child of folded node should be hidden');
  });
});
