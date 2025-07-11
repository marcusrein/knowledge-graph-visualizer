import { memo, useCallback } from 'react';
import { NodeProps } from 'reactflow';
import { Tooltip } from 'react-tooltip';
import { useAccount } from 'wagmi';

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
  const { label, visibility = 'public', onResize, owner } = data;
  const { address } = useAccount();
  
  const isOwner = Boolean(owner && address && owner.toLowerCase() === address.toLowerCase());
  const isPrivate = visibility === 'private';
  const isPrivateNonOwner = isPrivate && !isOwner;

  const tooltipText = isPrivate
    ? isOwner 
      ? 'Your Private Space – only you can view and edit its contents'
      : 'Private Space – contents are hidden from other users'
    : 'Public Space – everyone can view its contents';

  // Helper to adjust size by a delta
  const adjustSize = useCallback(
    (delta: number, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault(); // prevent drag start

      const buttonType = delta > 0 ? 'INCREASE (+)' : 'DECREASE (-)';
      console.log(`%c[SpaceNode] ${buttonType} button clicked`, 'color: orange; font-weight: bold');

      if (!onResize) {
        console.error('[SpaceNode] No onResize callback - cannot resize');
        return;
      }

      // Find the React Flow node wrapper to get the stored style dimensions
      const nodeWrapper = (e.currentTarget as HTMLElement).closest('[data-id]') as HTMLElement | null;
      
      if (!nodeWrapper) {
        console.error('[SpaceNode] Node wrapper not found - cannot resize');
        return;
      }

      const nodeId = nodeWrapper.getAttribute('data-id');
      console.log('[SpaceNode] Found node wrapper:', {
        nodeId,
        classList: nodeWrapper.classList.toString(),
      });

      // Get current dimensions from the node wrapper's inline styles
      // This is more reliable than getBoundingClientRect which can be affected by zoom/transforms
      const computedStyle = window.getComputedStyle(nodeWrapper);
      const currentWidth = parseFloat(computedStyle.width) || MIN_W;
      const currentHeight = parseFloat(computedStyle.height) || MIN_H;

      console.log('[SpaceNode] Current stored dimensions:', {
        width: currentWidth,
        height: currentHeight,
        computedWidth: computedStyle.width,
        computedHeight: computedStyle.height,
      });

      // Compute new dimensions with respect to minimum constraints
      const newWidth = Math.max(MIN_W, currentWidth + delta);
      const newHeight = Math.max(MIN_H, currentHeight + delta);

      console.log('[SpaceNode] Computed new dimensions:', {
        newWidth,
        newHeight,
        delta,
        mins: { MIN_W, MIN_H },
      });

      // Call the onResize callback with the new dimensions
      onResize(newWidth, newHeight);
    },
    [onResize]
  );

  return (
    <div
      className={`w-full h-full rounded border relative flex items-start justify-start p-1 select-none ${
        isPrivate 
          ? 'bg-purple-200/30 border-purple-400' 
          : 'bg-purple-100/40 border-purple-300'
      }`}
      data-tooltip-id="space-visibility-tip"
      data-tooltip-content={tooltipText}
    >
      {/* Privacy Overlay for Non-Owners */}
      {isPrivateNonOwner && (
        <div className="absolute inset-0 rounded bg-gray-900/70 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none z-10">
          <div className="text-center space-y-2 px-4">
            <div className="text-2xl">🔒</div>
            <div className="text-white font-semibold text-sm">Private Space</div>
                         <div className="text-gray-300 text-xs leading-relaxed">
               This space&apos;s contents are private and only visible to its creator
             </div>
            <div className="text-gray-400 text-[10px] font-mono">
              {owner ? `${owner.slice(0, 6)}...${owner.slice(-4)}` : 'Unknown Owner'}
            </div>
          </div>
        </div>
      )}

      {/* Space Header */}
      <div className="flex items-start justify-between w-full">
        <div className="flex-1">
          {/* Space Label */}
          <span className={`text-xs font-semibold ${
            isPrivate ? 'text-purple-900' : 'text-purple-800'
          }`}>
            {label}
          </span>
          
          {/* Ownership Badge for Private Spaces */}
          {isPrivate && isOwner && (
            <div className="flex items-center space-x-1 mt-1">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-green-500/20 text-green-800 border border-green-300">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1"></span>
                Your Private Space
              </span>
            </div>
          )}
        </div>

        {/* Privacy Icon */}
        <div className="flex items-center space-x-1">
          <span className={`text-[10px] cursor-default ${
            isPrivate ? 'text-purple-800' : 'text-purple-700'
          }`}>
            {isPrivate ? '🔒' : '🌍'}
          </span>
        </div>
      </div>

      {/* Resize Controls (only for owners) */}
      {onResize && isOwner && (
        <div className="absolute bottom-1 right-1 flex flex-col space-y-0.5 items-center">
          {/* Smaller (minus) button on top */}
          <button
            className="w-5 h-5 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs leading-none shadow-sm transition-colors"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onClick={(e) => adjustSize(-DELTA, e)}
            title="Decrease size"
          >
            −
          </button>
          {/* Larger (plus) button on bottom */}
          <button
            className="w-5 h-5 bg-purple-400 hover:bg-purple-500 text-white rounded text-xs leading-none shadow-sm transition-colors"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onClick={(e) => adjustSize(DELTA, e)}
            title="Increase size"
          >
            +
          </button>
        </div>
      )}

      {/* Tooltip */}
      <Tooltip id="space-visibility-tip" place="top" />
    </div>
  );
};

export default memo(SpaceNode); 