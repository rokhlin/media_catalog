import { memo, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type NodeTypes,
  type EdgeTypes,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { PersonCardNode } from './nodes/PersonCardNode.js';
import { UnionNode } from './nodes/UnionNode.js';
import { BiologicalEdge } from './edges/BiologicalEdge.js';
import { NonBiologicalEdge } from './edges/NonBiologicalEdge.js';
import { DivorcedEdge } from './edges/DivorcedEdge.js';
import { CanvasToolbar } from './controls/CanvasToolbar.js';
import { KinshipHUD } from './controls/KinshipHUD.js';
import { TreeSearchBar } from './controls/TreeSearchBar.js';
import { useTreeLayoutWorker } from '../../hooks/useTreeLayoutWorker.js';
import { useFamilyTreeStore } from '../../state/useFamilyTreeStore.js';
import { useTheme } from '../../../../theme/ThemeContext.js';
import { useLanguage } from '../../../../i18n/LanguageContext.js';
import type { TreeGraphData } from '../../types/tree.types.js';

interface TreeCanvasProps {
  graphData: TreeGraphData | null;
  isLoading: boolean;
  onAddMember: () => void;
}

const nodeTypes: NodeTypes = {
  person: PersonCardNode,
  union: UnionNode,
};

const edgeTypes: EdgeTypes = {
  biological: BiologicalEdge,
  non_biological: NonBiologicalEdge,
  divorced: DivorcedEdge,
};

export const TreeCanvas = memo(({ graphData, isLoading, onAddMember }: TreeCanvasProps) => {
  const {
    layoutDirection,
    foldedNodeIds,
    foldedDivorcedUnionIds,
    nodeViewStyle,
    selectPerson,
  } = useFamilyTreeStore();
  const { fitView } = useReactFlow();
  const { themeMode } = useTheme();
  const { t } = useLanguage();
  const isDark = themeMode === 'dark';

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    isCalculating,
    recalculateLayout,
  } = useTreeLayoutWorker(graphData, layoutDirection, foldedNodeIds, nodeViewStyle, foldedDivorcedUnionIds) as any;

  // Auto fit on initial load
  useEffect(() => {
    if (nodes && nodes.length > 0) {
      const timer = setTimeout(() => {
        fitView({ padding: 0.15, duration: 600 });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [nodes?.length, fitView]);

  const defaultEdgeOptions = useMemo(
    () => ({
      animated: false,
    }),
    [],
  );

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <TreeSearchBar />

      <CanvasToolbar
        graphData={graphData}
        onAddMember={onAddMember}
        onRecalculateLayout={recalculateLayout}
      />

      <KinshipHUD graphData={graphData} />

      {/* Loading overlay indicator */}
      {(isLoading || isCalculating) && (
        <div
          style={{
            position: 'absolute',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 30,
            background: 'var(--card-bg-solid)',
            border: '1px solid var(--primary-color)',
            color: 'var(--text-primary)',
            padding: '6px 16px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: 'var(--shadow-card)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span style={{ animation: 'pulse 1s infinite' }}>⚙️</span>
          {t('computingLayoutNotice')}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isCalculating && (!graphData?.persons || graphData.persons.length === 0) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            gap: 16,
          }}
        >
          <div style={{ fontSize: 48 }}>🌳</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            {t('emptyTreeTitle')}
          </div>
          <div style={{ fontSize: 13, maxWidth: 360, textAlign: 'center', color: 'var(--text-secondary)' }}>
            {t('emptyTreeDesc')}
          </div>
          <button
            type="button"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 10,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(99, 102, 241, 0.4)',
            }}
            onClick={onAddMember}
          >
            ➕ {t('emptyTreeAddButton')}
          </button>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onPaneClick={() => selectPerson(null, false)}
        minZoom={0.1}
        maxZoom={2.5}
        fitView
        proOptions={{ hideAttribution: true }}
        style={{
          background: 'transparent',
        }}
      >
        <Background color={isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.12)'} gap={24} size={1} />
        <Controls
          position="bottom-right"
          showInteractive={false}
          style={{
            background: 'var(--card-bg-solid)',
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: 'var(--shadow-card)',
          }}
        />
        <MiniMap
          position="bottom-left"
          nodeColor={(n: Node) => (n.type === 'person' ? 'var(--primary-color, #6366f1)' : 'var(--accent-color, #a855f7)')}
          maskColor={isDark ? 'rgba(11, 15, 25, 0.75)' : 'rgba(240, 243, 248, 0.75)'}
          style={{
            width: 200,
            height: 150,
            background: 'var(--card-bg-solid)',
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            bottom: 24,
            left: 24,
            right: 'auto',
            margin: 0,
            boxShadow: 'var(--shadow-card)',
          }}
          zoomable
          pannable
        />
      </ReactFlow>
    </div>
  );
});

TreeCanvas.displayName = 'TreeCanvas';
