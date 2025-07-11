import { useEffect, useRef } from 'react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemType: 'Topic' | 'Entity' | 'Relation' | 'Space';
  itemName: string;
}

export default function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  itemType,
  itemName,
}: DeleteConfirmModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  // Handle keyboard navigation
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isOpen) return;

      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          onClose();
          break;
        case 'Enter':
          event.preventDefault();
          onConfirm();
          break;
        case 'Tab':
          // Let default tab behavior work, but ensure we stay within modal
          const focusableElements = [cancelButtonRef.current, deleteButtonRef.current].filter(Boolean);
          const activeElement = document.activeElement;
          const currentIndex = focusableElements.findIndex(el => el === activeElement);
          
          if (event.shiftKey) {
            // Shift+Tab - go backwards
            if (currentIndex <= 0) {
              event.preventDefault();
              deleteButtonRef.current?.focus();
            }
          } else {
            // Tab - go forwards
            if (currentIndex >= focusableElements.length - 1) {
              event.preventDefault();
              cancelButtonRef.current?.focus();
            }
          }
          break;
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onClose, onConfirm]);

  // Auto-focus when modal opens
  useEffect(() => {
    if (isOpen && cancelButtonRef.current) {
      // Focus the Cancel button by default (safer option)
      setTimeout(() => {
        cancelButtonRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-base-300 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <h3 className="text-lg font-bold mb-4">Delete {itemType}</h3>
        <p className="mb-4">
          Are you sure you want to delete this {itemType.toLowerCase()}?{' '}
          <span className="font-semibold">&ldquo;{itemName}&rdquo;</span> will be permanently removed.
        </p>
        <p className="text-sm text-gray-400 mb-6">
          <kbd className="kbd kbd-sm">Enter</kbd> to confirm • <kbd className="kbd kbd-sm">Esc</kbd> to cancel • <kbd className="kbd kbd-sm">Tab</kbd> to navigate
        </p>
        <div className="flex justify-end gap-3">
          <button 
            ref={cancelButtonRef}
            className="btn btn-ghost" 
            onClick={onClose}
            tabIndex={0}
          >
            Cancel
          </button>
          <button 
            ref={deleteButtonRef}
            className="btn btn-error" 
            onClick={onConfirm}
            tabIndex={0}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
} 