import { useState, useEffect, useCallback, useRef } from 'react';

interface UseResizableOptions {
  initialSize: number;
  minSize: number;
  maxSize: number;
  storageKey: string;
  direction: 'horizontal' | 'vertical';
}

interface UseResizableReturn {
  size: number;
  isResizing: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleTouchStart: (e: React.TouchEvent) => void;
}

export function useResizable({
  initialSize,
  minSize,
  maxSize,
  storageKey,
  direction,
}: UseResizableOptions): UseResizableReturn {
  // Load saved size from localStorage or use initial
  const [size, setSize] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsedSize = parseInt(saved, 10);
        return Math.min(Math.max(parsedSize, minSize), maxSize);
      }
    }
    return initialSize;
  });

  const [isResizing, setIsResizing] = useState(false);
  const startPos = useRef(0);
  const startSize = useRef(0);

  // Save size to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, size.toString());
    }
  }, [size, storageKey]);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;

      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = direction === 'horizontal' 
        ? startPos.current - currentPos  // For right-side panels, moving left increases size
        : startPos.current - currentPos; // For bottom panels, moving up increases size

      const newSize = Math.min(Math.max(startSize.current + delta, minSize), maxSize);
      setSize(newSize);
    },
    [isResizing, direction, minSize, maxSize]
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isResizing || !e.touches[0]) return;
      
      const currentPos = direction === 'horizontal' ? e.touches[0].clientX : e.touches[0].clientY;
      const delta = direction === 'horizontal'
        ? startPos.current - currentPos
        : startPos.current - currentPos;

      const newSize = Math.min(Math.max(startSize.current + delta, minSize), maxSize);
      setSize(newSize);
    },
    [isResizing, direction, minSize, maxSize]
  );

  useEffect(() => {
    if (isResizing) {
      document.body.style.cursor = direction === 'horizontal' ? 'ew-resize' : 'ns-resize';
      document.body.style.userSelect = 'none';
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleMouseUp);
      };
    }
  }, [isResizing, direction, handleMouseMove, handleMouseUp, handleTouchMove]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
      startSize.current = size;
    },
    [direction, size]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      if (!e.touches[0]) return;
      
      setIsResizing(true);
      startPos.current = direction === 'horizontal' ? e.touches[0].clientX : e.touches[0].clientY;
      startSize.current = size;
    },
    [direction, size]
  );

  return {
    size,
    isResizing,
    handleMouseDown,
    handleTouchStart,
  };
} 