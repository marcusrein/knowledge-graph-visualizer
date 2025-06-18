import React from "react";
import { getBezierPath, type ConnectionLineComponentProps } from "reactflow";

const CustomConnectionLine: React.FC<ConnectionLineComponentProps> = ({ fromX, fromY, toX, toY }) => {
  const [edgePath] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    targetX: toX,
    targetY: toY,
  });

  return (
    <g>
      <defs>
        <marker
          id="react-flow-arrow"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
        </marker>
      </defs>
      <path
        fill="none"
        stroke="#f59e0b"
        strokeWidth={2}
        d={edgePath}
        markerEnd="url(#react-flow-arrow)"
      />
    </g>
  );
};

export default CustomConnectionLine; 