import { memo } from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

export const NonBiologicalEdge = memo(({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}: EdgeProps) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <BaseEdge
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        stroke: 'var(--accent-color, #a855f7)',
        strokeWidth: 2,
        strokeDasharray: '5,5',
        opacity: 0.85,
        ...style,
      }}
    />
  );
});

NonBiologicalEdge.displayName = 'NonBiologicalEdge';
