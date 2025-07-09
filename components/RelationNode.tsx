import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const RelationNode = ({ data }: NodeProps) => {
  return (
    <div className="px-4 py-2 shadow-md rounded-full bg-blue-500 text-white border-2 border-stone-400">
      <Handle type="target" position={Position.Top} className="w-16 !bg-teal-500" />
      <div className="text-center">{data.label}</div>
      <Handle type="source" position={Position.Bottom} className="w-16 !bg-teal-500" />
    </div>
  );
};

export default memo(RelationNode); 