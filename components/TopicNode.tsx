import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { HelpCircle } from 'lucide-react';

const TopicNode = ({ data }: NodeProps) => {
  return (
    <div className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm shadow relative">
      <span>{data.label}</span>
      <span
        data-tooltip-id="kg-node-tip"
        data-tooltip-content="A Topic (Entity) is a unique thing in the Knowledge Graph. Topics can be anything—ideas, projects, or people—and can be linked to form knowledge."
        className="inline-flex items-center ml-2 cursor-help"
      >
        <HelpCircle size={14} />
      </span>

      {/* Connection handles */}
      <Handle type="target" position={Position.Top} style={{ background: 'transparent' }} />
      <Handle type="source" position={Position.Bottom} style={{ background: 'transparent' }} />
    </div>
  );
};

export default memo(TopicNode); 