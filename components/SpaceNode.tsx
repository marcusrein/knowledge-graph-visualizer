import { memo, useCallback, useMemo } from 'react';
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
  
  // Stable owner detection to prevent flashing
  const isOwner = useMemo(() => {
    if (!owner || !address) return false;
    
    return (
      owner.toLowerCase() === address.toLowerCase() || 
      owner === address ||
      // Handle case where owner might be stored without checksumming
      owner.replace(/^0x/, '').toLowerCase() === address.replace(/^0x/, '').toLowerCase()
    );
  }, [owner, address]);
  
  const isPrivate = visibility === 'private';
  
  // Safety fallback: if there's no clear owner set, assume current user can see content
  // This prevents accidentally hiding content from legitimate users
  const shouldHideContent = useMemo(() => {
    return isPrivate && !isOwner && Boolean(owner) && Boolean(address);
  }, [isPrivate, isOwner, owner, address]);

  const ownerDisplayName = owner ? `${owner.slice(0, 6)}...${owner.slice(-4)}` : 'Unknown';
  
  const privacyLabel = isPrivate
    ? isOwner 
      ? 'Your Private Space'
      : `${ownerDisplayName}'s Private Space`
    : isOwner
      ? 'Your Public Space'
      : `${ownerDisplayName}'s Public Space`;

  const tooltipText = isPrivate
    ? isOwner 
      ? 'Your Private Space – only you can view and edit its contents'
      : `Private Space owned by ${ownerDisplayName} – contents are hidden from other users`
    : isOwner
      ? 'Your Public Space – everyone can view its contents'
      : `Public Space owned by ${ownerDisplayName} – everyone can view its contents`;

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
      className={`w-full h-full rounded border relative flex items-start justify-start p-1 select-none bg-transparent ${
        isPrivate 
          ? 'border-purple-400' 
          : 'border-purple-300'
      }`}
    >
      {/* Privacy Overlay for Non-Owners */}
      {shouldHideContent && (
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
      <div className="flex items-center justify-between w-full">
        {/* Space Name */}
        <h3 className={`text-sm font-semibold truncate px-2 py-1 rounded ${
          isPrivate 
            ? 'bg-purple-100 text-purple-700 border border-purple-200' 
            : 'bg-blue-50 text-blue-700 border border-blue-200'
        }`}>
          {label}
        </h3>

        {/* Privacy State */}
        <span 
          className={`text-xs font-medium px-2 py-1 rounded ${
            isPrivate 
              ? 'bg-purple-100 text-purple-700 border border-purple-200' 
              : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}
          data-tooltip-id="space-visibility-tip"
          data-tooltip-content={tooltipText}
        >
          {privacyLabel}
        </span>
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