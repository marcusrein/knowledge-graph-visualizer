import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { HelpCircle } from 'lucide-react';
import Avatar from './Avatar';

const RelationNode = ({ data }: NodeProps<{ label: string; selectionColor?: string | null; selectingAddress?: string | null }>) => {
  const style = data.selectionColor ? {
    borderColor: data.selectionColor,
    boxShadow: `0 0 10px ${data.selectionColor}`,
  } : {};

  return (
    <div
      className="pl-3 pr-6 py-1.5 shadow-md rounded-full bg-orange-600 text-white border-2 border-orange-300 relative text-sm"
      style={style}
    >
      {data.selectingAddress && (
        <div className="absolute -top-3 -right-3">
          <Avatar address={data.selectingAddress} />
        </div>
      )}
      {/* Tooltip icon */}
      <span
        data-tooltip-id="kg-node-tip"
        data-tooltip-content="This is a Relation. Relations describe how two Topics are connected."
        className="absolute top-1/2 -translate-y-1/2 right-1 cursor-help"
      >
        <HelpCircle size={14} />
      </span>

      <Handle type="target" position={Position.Top} className="w-11 !bg-orange-500" />
      <div className="text-center">{data.label}</div>
      <Handle type="source" position={Position.Bottom} className="w-11 !bg-orange-500" />
    </div>
  );
};

export default memo(RelationNode); 