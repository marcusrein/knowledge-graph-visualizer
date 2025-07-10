import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { HelpCircle } from 'lucide-react';

const RelationNode = ({ data }: NodeProps) => {
  return (
    <div className="px-3 py-1.5 shadow-md rounded-full bg-purple-600 text-white border-2 border-purple-300 relative text-sm">
      {/* Tooltip icon */}
      <span
        data-tooltip-id="kg-node-tip"
        data-tooltip-content="A Relation describes how two Topics are connected."
        className="absolute -top-1 -right-1 cursor-help"
      >
        <HelpCircle size={8} />
      </span>

      <Handle type="target" position={Position.Top} className="w-11 !bg-purple-500" />
      <div className="text-center">{data.label}</div>
      <Handle type="source" position={Position.Bottom} className="w-11 !bg-purple-500" />
    </div>
  );
};

export default memo(RelationNode); 