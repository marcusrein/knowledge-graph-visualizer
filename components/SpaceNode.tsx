import { memo, useCallback } from 'react';
import { NodeProps } from 'reactflow';
import { Tooltip } from 'react-tooltip';
import { useTerminology } from '@/lib/TerminologyContext';

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

  const tooltipText =
    visibility === 'private'
      ? 'Private Space – only the creator can view its useTerminology '
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

      // Calculate new dimensions with constraints
      const newWidth = Math.max(MIN_W, currentWidth + delta);
      const newHeight = Math.max(MIN_H, currentHeight + delta);

      console.log('[SpaceNode] Size calculation:', {
        delta,
        currentSize: { width: currentWidth, height: currentHeight },
        targetSize: { width: currentWidth + delta, height: currentHeight + delta },
        finalSize: { width: newWidth, height: newHeight },
        constraints: { MIN_W, MIN_H },
        wasConstrained: {
          width: (currentWidth + delta) !== newWidth,
          height: (currentHeight + delta) !== newHeight,
        }
      });

      // Validate the calculation makes sense
      if (newWidth === currentWidth && newHeight === currentHeight) {
        console.warn('[SpaceNode] No size change needed (hit constraints)');
        return;
      }

      console.log(`%c[SpaceNode] Calling onResize with: ${newWidth}x${newHeight}`, 'color: lightgreen');
      onResize(newWidth, newHeight);
    },
    [onResize]
  );

  return (
    <div
      className="w-full h-full rounded bg-purple-100/40 border border-purple-300 relative flex items-start justify-start p-1 select-none"
      data-tooltip-id="space-visibility-tip"
      data-tooltip-content={tooltipText}
    >
      {/* Space label & privacy icon */}
      <span className="text-xs font-semibold text-purple-800">{label}</span>
      <span className="ml-auto text-[10px] text-purple-700 cursor-default">
        {visibility === 'public' ? '🌍' : '🔒'}
      </span>

      {/* + / − controls (shown only if onResize callback exists → owner) */}
      {onResize && (
        <div className="absolute bottom-1 right-1 flex flex-col space-y-0.5 items-center">
          {/* Smaller (minus) button on top */}
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
          {/* Larger (plus) button on bottom */}
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
        </div>
      )}

      {/* One tooltip definition per space */}
      <Tooltip id="space-visibility-tip" place="top" />
    </div>
  );
};

export default memo(SpaceNode); 