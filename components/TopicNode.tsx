import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { HelpCircle } from 'lucide-react';
import Avatar from './Avatar';

interface TopicData {
  label: string;
  selectingAddress?: string;
  properties?: Record<string, unknown>;
}

const TopicNode = ({ data }: NodeProps<TopicData>) => {
  const orientation = (data.properties as Record<string, string> | undefined)?.orientation ?? 'vertical';
  const vertical = orientation !== 'horizontal';
  return (
    <div className="px-4 py-3 rounded-md bg-blue-600 text-white text-base shadow relative">
      {data.selectingAddress && (
        <div className="absolute -top-3 -right-3">
          <Avatar address={data.selectingAddress} />
        </div>
      )}
      <span>{data.label}</span>
      <span
        data-tooltip-id="kg-node-tip"
        data-tooltip-content="This is a Topic. Topics can be anything—ideas, projects, or people—and can be linked with other Topics to form knowledge."
        className="inline-flex items-center ml-1.5 cursor-help"
      >
        <HelpCircle size={14} />
      </span>

      {/* Connection handles */}
      {vertical ? (
        <>
          <Handle type="target" position={Position.Top} style={{ background: 'transparent' }} />
          <Handle type="source" position={Position.Bottom} style={{ background: 'transparent' }} />
        </>
      ) : (
        <>
          <Handle type="target" position={Position.Left} style={{ background: 'transparent' }} />
          <Handle type="source" position={Position.Right} style={{ background: 'transparent' }} />
        </>
      )}
    </div>
  );
};

export default memo(TopicNode); 