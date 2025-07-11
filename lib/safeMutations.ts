import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { errorLogger, retryOperation } from './errorHandler';
import { useAccount } from 'wagmi';

// Removed unused interface

export function useSafeEntityMutation() {
  const { address } = useAccount();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      nodeId: string;
      label?: string;
      properties?: Record<string, string>;
      visibility?: 'public' | 'private';
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      parentId?: string | null;
    }) => {
      return await retryOperation(
        async () => {
          const res = await fetch('/api/entities', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, editorAddress: address }),
          });
          
          if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Failed to update entity');
          }
          
          return res.json();
        },
        3,
        `Update entity ${payload.nodeId}`,
        address
      );
    },
    onError: (error: Error) => {
      errorLogger.logError(error, 'Entity mutation failed', address);
      toast.error('Failed to save changes. Please try again.');
    },
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['entities'] });
    },
  });
}

export function useSafeEntityDelete() {
  const { address } = useAccount();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { nodeId: string }) => {
      return await retryOperation(
        async () => {
          const res = await fetch('/api/entities', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          
          if (!res.ok && res.status !== 404) {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Failed to delete entity');
          }
          
          return res.ok || res.status === 404;
        },
        2,
        `Delete entity ${payload.nodeId}`,
        address
      );
    },
    onError: (error: Error) => {
      errorLogger.logError(error, 'Entity deletion failed', address);
      toast.error('Failed to delete. Please try again.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entities'] });
      queryClient.invalidateQueries({ queryKey: ['relations'] });
    },
  });
}

export function useSafeRelationMutation() {
  const { address } = useAccount();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      id: string;
      relationType?: string;
      properties?: Record<string, string>;
      x?: number;
      y?: number;
    }) => {
      return await retryOperation(
        async () => {
          const res = await fetch('/api/relations', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, editorAddress: address }),
          });
          
          if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Failed to update relation');
          }
          
          return res.json();
        },
        3,
        `Update relation ${payload.id}`,
        address
      );
    },
    onError: (error: Error) => {
      errorLogger.logError(error, 'Relation mutation failed', address);
      toast.error('Failed to save relation. Please try again.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['relations'] });
    },
  });
}

export function useSafeWebSocketSend() {
  const { address } = useAccount();

  return (socket: WebSocket | null, message: Record<string, unknown>, context = 'WebSocket message') => {
    try {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('WebSocket not ready, message not sent:', message);
        }
        return false;
      }
      
      socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      errorLogger.logError(
        error instanceof Error ? error : new Error(String(error)),
        `WebSocket send failed - ${context}`,
        address
      );
      return false;
    }
  };
}

// Safe query wrapper with fallback data
export function useSafeQuery<T>(queryFn: () => Promise<T>, fallbackData: T, queryKey: string[]) {
  const { address } = useAccount();
  
  return {
    queryKey,
    queryFn: async () => {
      try {
        return await retryOperation(
          queryFn,
          2,
          `Query ${queryKey.join('.')}`,
          address
        );
      } catch (error) {
        errorLogger.logError(
          error instanceof Error ? error : new Error(String(error)),
          `Query ${queryKey.join('.')} failed`,
          address
        );
        return fallbackData;
      }
    },
    retry: false, // We handle retries manually
    staleTime: 30000, // 30 seconds
  };
} 