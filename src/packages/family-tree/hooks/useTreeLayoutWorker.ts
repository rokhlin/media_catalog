import { useState, useEffect, useRef, useCallback } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { TreeGraphData, NodeViewStyle } from '../types/tree.types.js';
import { computeElkLayout } from '../workers/elk-layout.worker.js';
import { computeRelationshipToRoot } from '../utils/kinshipUtils.js';

export function useTreeLayoutWorker(
  graphData: TreeGraphData | null,
  direction: 'TB' | 'LR',
  foldedNodeIds: Set<string>,
  nodeViewStyle: NodeViewStyle = 'default',
  foldedDivorcedUnionIds: Set<string> = new Set(),
) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const pendingRequestId = useRef<string | null>(null);

  const recalculateLayout = useCallback(async () => {
    if (!graphData || (!graphData.persons.length && !graphData.unions.length)) {
      setNodes([]);
      setEdges([]);
      setIsCalculating(false);
      return;
    }

    setIsCalculating(true);
    const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    pendingRequestId.current = reqId;

    try {
      const res = await computeElkLayout(graphData, direction, foldedNodeIds, nodeViewStyle, foldedDivorcedUnionIds);
      if (pendingRequestId.current === reqId) {
        setNodes(res.nodes as Node[]);
        setEdges(res.edges as Edge[]);
      }
    } catch (err) {
      console.error('Tree layout computation error:', err);
      // Fallback: render nodes in fallback layout if ELK fails
      if (pendingRequestId.current === reqId && graphData.persons.length > 0) {
        const fallbackNodes: Node[] = graphData.persons.map((p, idx) => ({
          id: `p_${p.id}`,
          type: 'person',
          position: { x: (idx % 3) * 280 + 50, y: Math.floor(idx / 3) * 180 + 50 },
          data: {
            person: p,
            isRoot: p.id === graphData.root_person_id,
            isFolded: false,
            relationshipToRoot: computeRelationshipToRoot(p, graphData),
          },
        }));
        setNodes(fallbackNodes);
        setEdges([]);
      }
    } finally {
      if (pendingRequestId.current === reqId) {
        setIsCalculating(false);
      }
    }
  }, [graphData, direction, foldedNodeIds, nodeViewStyle, foldedDivorcedUnionIds]);

  useEffect(() => {
    recalculateLayout();
  }, [recalculateLayout]);

  return { nodes, edges, setNodes, setEdges, isCalculating, recalculateLayout };
}

