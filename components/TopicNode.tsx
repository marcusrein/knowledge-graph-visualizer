import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import Tooltip from './Tooltip';

const TopicNode: React.FC<NodeProps> = ({ data }) => {
  return (
    <div className="react-flow__node-default">
      <div className="flex items-center justify-between px-4 py-2">
        <span>{data.label}</span>
        <div className="nodrag">
          <Tooltip content="A Topic (or Entity) is the basic building block of the graph. It can be a person, place, idea—anything you want to connect." />
        </div>
      </div>
      <Handle type="source" position={Position.Top} />
      <Handle type="source" position={Position.Right} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="source" position={Position.Left} />
    </div>
  );
};

export default memo(TopicNode); 