import ELK from 'elkjs/lib/elk.bundled.js';
import type { TreeGraphData, NodeViewStyle } from '../types/tree.types.js';
import { computeRelationshipToRoot } from '../utils/kinshipUtils.js';

export interface LayoutRequestMessage {
  type: 'LAYOUT_REQUEST';
  requestId: string;
  graphData: TreeGraphData;
  direction: 'TB' | 'LR';
  foldedNodeIds: string[];
  foldedDivorcedUnionIds?: string[];
  nodeViewStyle?: NodeViewStyle;
}

export interface LayoutSuccessMessage {
  type: 'LAYOUT_SUCCESS';
  requestId: string;
  nodes: Array<{
    id: string;
    type: 'person' | 'union';
    position: { x: number; y: number };
    data: Record<string, any>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type: 'biological' | 'non_biological' | 'divorced';
    data?: Record<string, any>;
  }>;
}

export interface LayoutErrorMessage {
  type: 'LAYOUT_ERROR';
  requestId: string;
  error: string;
}

const ELKConstructor = (ELK as any)?.default || ELK;
let elkInstance: any = null;

function getElk() {
  if (!elkInstance) {
    elkInstance = typeof ELKConstructor === 'function' ? new ELKConstructor() : new (ELK as any)();
  }
  return elkInstance;
}

const UNION_SIZE = 36;

export async function computeElkLayout(
  graphData: TreeGraphData,
  direction: 'TB' | 'LR',
  foldedNodeIds: Set<string>,
  nodeViewStyle: NodeViewStyle = 'default',
  foldedDivorcedUnionIds: Set<string> = new Set(),
): Promise<{
  nodes: Array<{ id: string; type: 'person' | 'union'; position: { x: number; y: number }; data: Record<string, any> }>;
  edges: Array<{ id: string; source: string; target: string; type: 'biological' | 'non_biological' | 'divorced'; data?: Record<string, any> }>;
}> {
  const isHorizontal = direction === 'LR';
  const elkDirection = isHorizontal ? 'RIGHT' : 'DOWN';

  const personWidth = nodeViewStyle === 'circle' ? 110 : nodeViewStyle === 'square' ? 130 : 250;
  const personHeight = nodeViewStyle === 'circle' ? 120 : nodeViewStyle === 'square' ? 140 : 140;

  // 1. Filter out folded descendant subtrees
  const hiddenPersonIds = new Set<string>();
  if (foldedNodeIds && foldedNodeIds.size > 0) {
    const queue = Array.from(foldedNodeIds);
    while (queue.length > 0) {
      const pId = queue.shift()!;
      // Find all unions where pId is partner
      const partnerUnions = graphData.unions.filter((u) => u.partner_ids.includes(pId));
      for (const u of partnerUnions) {
        for (const ch of u.children) {
          if (!hiddenPersonIds.has(ch.person_id) && !foldedNodeIds.has(ch.person_id)) {
            hiddenPersonIds.add(ch.person_id);
            queue.push(ch.person_id);
          }
        }
      }
    }
  }

  // 1b. Filter out folded divorced spouses (hide divorced partner and their separate branch, preserve mutual children)
  if (foldedDivorcedUnionIds && foldedDivorcedUnionIds.size > 0) {
    for (const unionId of foldedDivorcedUnionIds) {
      const u = graphData.unions.find((un) => un.id === unionId);
      if (u && u.union_type === 'DIVORCED' && u.partner_ids.length >= 2) {
        // Find which partner is the divorced spouse to hide:
        // Prioritize preserving the root person or the partner with other connections
        const p0 = u.partner_ids[0];
        const p1 = u.partner_ids[1];
        const rootId = graphData.root_person_id;
        const spouseToHide = p0 === rootId ? p1 : (p1 === rootId ? p0 : p1);
        hiddenPersonIds.add(spouseToHide);
      }
    }
  }

  const visiblePersons = graphData.persons.filter((p) => !hiddenPersonIds.has(p.id));
  const visiblePersonIds = new Set(visiblePersons.map((p) => p.id));

  const visibleUnions = graphData.unions.filter((u) => {
    const validPartners = u.partner_ids.filter((pid) => visiblePersonIds.has(pid));
    const validChildren = u.children.filter((ch) => visiblePersonIds.has(ch.person_id));

    // A union is valid if:
    // 1. It has >= 2 partners (couple/marriage), OR
    // 2. It has >= 1 partner AND >= 1 child (single parent with child), OR
    // 3. It has 0 partners but >= 2 children (siblings sharing unknown parents)
    return (
      validPartners.length >= 2 ||
      (validPartners.length >= 1 && validChildren.length >= 1) ||
      (validPartners.length === 0 && validChildren.length >= 2)
    );
  });

  // 2. Build ELK Nodes
  const elkNodes: any[] = [];
  const elkEdges: any[] = [];
  const reactFlowNodes: any[] = [];
  const reactFlowEdges: any[] = [];

  for (const p of visiblePersons) {
    elkNodes.push({
      id: `p_${p.id}`,
      width: personWidth,
      height: personHeight,
      layoutOptions: {
        'elk.padding': '[top=10,left=10,bottom=10,right=10]',
      },
    });
  }

  for (const u of visibleUnions) {
    elkNodes.push({
      id: `u_${u.id}`,
      width: UNION_SIZE,
      height: UNION_SIZE,
      layoutOptions: {
        'elk.padding': '[top=4,left=4,bottom=4,right=4]',
      },
    });

    const isDivorcedUnion = u.union_type === 'DIVORCED';

    // Edges: Partners -> Union
    u.partner_ids.forEach((partnerId, idx) => {
      if (visiblePersonIds.has(partnerId)) {
        const edgeId = `edge_p_${partnerId}_to_u_${u.id}_${idx}`;
        elkEdges.push({
          id: edgeId,
          sources: [`p_${partnerId}`],
          targets: [`u_${u.id}`],
        });

        reactFlowEdges.push({
          id: edgeId,
          source: `p_${partnerId}`,
          target: `u_${u.id}`,
          type: isDivorcedUnion ? 'divorced' : 'biological',
          data: { unionId: u.id, partnerId },
        });
      }
    });

    // Edges: Union -> Children
    u.children.forEach((child) => {
      if (visiblePersonIds.has(child.person_id)) {
        const edgeId = `edge_u_${u.id}_to_p_${child.person_id}`;
        const isBiological = child.filiation === 'BIOLOGICAL' || !child.filiation;

        elkEdges.push({
          id: edgeId,
          sources: [`u_${u.id}`],
          targets: [`p_${child.person_id}`],
        });

        reactFlowEdges.push({
          id: edgeId,
          source: `u_${u.id}`,
          target: `p_${child.person_id}`,
          type: isBiological ? 'biological' : 'non_biological',
          data: { unionId: u.id, filiation: child.filiation },
        });
      }
    });
  }

  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': elkDirection,
      'elk.spacing.nodeNode': isHorizontal ? '60' : '45',
      'elk.layered.spacing.nodeNodeBetweenLayers': isHorizontal ? '80' : '65',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.edgeRouting': 'SPLINES',
      'elk.layered.mergeEdges': 'true',
    },
    children: elkNodes,
    edges: elkEdges,
  };

  const layouted = await getElk().layout(elkGraph);

  const nodeMap = new Map<string, { x: number; y: number }>();
  if (layouted.children) {
    for (const child of layouted.children) {
      nodeMap.set(child.id, { x: child.x || 0, y: child.y || 0 });
    }
  }

  // Build final React Flow Nodes
  for (const p of visiblePersons) {
    const pos = nodeMap.get(`p_${p.id}`) || { x: 0, y: 0 };
    const personUnions = graphData.unions.filter((u) => u.partner_ids.includes(p.id));
    const spouses = personUnions.map((u) => {
      const spouseId = u.partner_ids.find((id) => id !== p.id);
      const spousePerson = spouseId ? graphData.persons.find((sp) => sp.id === spouseId) : null;
      return {
        unionId: u.id,
        unionType: u.union_type,
        spouseId,
        spouseName: spousePerson ? (spousePerson.full_name || `${spousePerson.first_name} ${spousePerson.last_name || ''}`.trim()) : 'Spouse',
        startDate: u.start_date,
        endDate: u.end_date,
      };
    });

    reactFlowNodes.push({
      id: `p_${p.id}`,
      type: 'person',
      position: pos,
      data: {
        person: p,
        isRoot: p.id === graphData.root_person_id,
        isFolded: foldedNodeIds.has(p.id),
        spouses,
        relationshipToRoot: computeRelationshipToRoot(p, graphData),
      },
    });
  }

  for (const u of visibleUnions) {
    const pos = nodeMap.get(`u_${u.id}`) || { x: 0, y: 0 };
    reactFlowNodes.push({
      id: `u_${u.id}`,
      type: 'union',
      position: pos,
      data: {
        union: u,
      },
    });
  }

  return {
    nodes: reactFlowNodes,
    edges: reactFlowEdges,
  };
}

// Web Worker message dispatcher (if run in worker context)
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  self.onmessage = async (e: MessageEvent<LayoutRequestMessage>) => {
    const { type, requestId, graphData, direction, foldedNodeIds, foldedDivorcedUnionIds, nodeViewStyle } = e.data;
    if (type === 'LAYOUT_REQUEST') {
      try {
        const result = await computeElkLayout(
          graphData,
          direction,
          new Set(foldedNodeIds || []),
          nodeViewStyle || 'default',
          new Set(foldedDivorcedUnionIds || []),
        );
        const res: LayoutSuccessMessage = {
          type: 'LAYOUT_SUCCESS',
          requestId,
          nodes: result.nodes,
          edges: result.edges,
        };
        self.postMessage(res);
      } catch (err: any) {
        const errRes: LayoutErrorMessage = {
          type: 'LAYOUT_ERROR',
          requestId,
          error: err?.message || String(err),
        };
        self.postMessage(errRes);
      }
    }
  };
}
