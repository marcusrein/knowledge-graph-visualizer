import { memo, useCallback } from 'react';
import { NodeProps } from 'reactflow';
import { Tooltip } from 'react-tooltip';

interface SpaceData {
  label: string;
  visibility?: 'public' | 'private';
  owner?: string;
  onResize?: (width: number, height: number) => void;
}

const MIN_W = 200;
const MIN_H = 150;
const DELTA = 50;

const SpaceNode = ({ data }: NodeProps<SpaceData>) => {
  const { label, visibility = 'public', onResize } = data;

  // Helper to adjust size by a delta
  const adjustSize = useCallback(
    (delta: number, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault(); // prevent drag start

      // Prefer the node wrapper (react-flow__node) for accurate size
      const nodeWrapper = (e.currentTarget as HTMLElement).closest('[data-id]') as HTMLElement | null;
      const rect = nodeWrapper?.getBoundingClientRect();

      if (!rect || !onResize) return;

      const newWidth = Math.max(MIN_W, rect.width + delta);
      const newHeight = Math.max(MIN_H, rect.height + delta);

      console.log('[SpaceNode] adjustSize', { delta, oldW: rect.width, oldH: rect.height, newW: newWidth, newH: newHeight });

      onResize(newWidth, newHeight);
    },
    [onResize]
  );

  return (
    <div
      className="w-full h-full rounded bg-purple-100/40 border border-purple-300 relative flex items-start justify-start p-1 select-none"
      {...(visibility === 'private'
        ? {
            'data-tooltip-id': 'space-privacy-tip',
            'data-tooltip-content': 'Private Space – only the creator (or invited members) can view its contents',
          }
        : {})}
    >
      {/* Space label & privacy icon */}
      <span className="text-xs font-semibold text-purple-800">{label}</span>
      <span className="ml-auto text-[10px] text-purple-700 cursor-default">
        {visibility === 'public' ? '🌍' : '🔒'}
      </span>

      {/* + / − controls (shown only if onResize callback exists → owner) */}
      {onResize && (
        <div className="absolute bottom-1 right-1 flex flex-col space-y-0.5">
          <button
            className="w-5 h-5 bg-purple-400 hover:bg-purple-500 text-white rounded text-xs leading-none"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onClick={(e) => adjustSize(DELTA, e)}
            title="Increase size"
          >
            +
          </button>
          <button
            className="w-5 h-5 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs leading-none"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onClick={(e) => adjustSize(-DELTA, e)}
            title="Decrease size"
          >
            −
          </button>
        </div>
      )}

      {visibility === 'private' && <Tooltip id="space-privacy-tip" place="top" />}
    </div>
  );
};

export default memo(SpaceNode); 