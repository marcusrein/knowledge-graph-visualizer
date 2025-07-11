"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import ReactFlow, {
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
  ConnectionLineType,
  MarkerType,
  OnConnect,
  ReactFlowInstance,
} from 'reactflow';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { usePartySocket } from 'partysocket/react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import Image from 'next/image';
import 'reactflow/dist/style.css';
import * as dagre from 'dagre';
import { logger } from '@/lib/logger';
import { HelpCircle, X } from 'lucide-react';

import RelationNode from '@/components/RelationNode';
import SpaceNode from '@/components/SpaceNode';
import Inspector from '@/components/Inspector';
import Avatar from '@/components/Avatar';
import OnboardingChecklist from '@/components/OnboardingChecklist';
import TopicNode from '@/components/TopicNode';
import { Tooltip } from 'react-tooltip';
import { useTerminology } from '@/lib/TerminologyContext';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';
import { errorLogger } from '@/lib/errorHandler';

// Define nodeTypes outside component to fix React Flow warnings
const nodeTypes = {
  relation: RelationNode,
  topic: TopicNode,
  knowledge: TopicNode, // alias to silence React Flow warnings
  group: SpaceNode,
};

interface PresentUser {
  id: string;
  address: string;
}

interface Selection {
  address: string;
  nodeId: string | null;
}

// A more robust check for numeric strings (for relation IDs)
function isNumeric(str: string) {
  if (typeof str !== 'string') return false;
  return /^\d+$/.test(str);
}

const ONBOARDING_STEPS = [
  {
    id: 'create-topic',
    title: 'Create your first Topic',
    description: 'Click the + button to create your first Topic.',
    isCompleted: false,
  },
  {
    id: 'name-topic',
    title: 'Name your Topic',
    description: 'Give your new Topic a name in the inspector on the right.',
    isCompleted: false,
  },
  {
    id: 'create-connection',
    title: 'Connect two Topics',
    description: 'Create another Topic and connect it to the first one by dragging from one node to another.',
    isCompleted: false,
  },
];

export default function GraphPage() {
  const queryClient = useQueryClient();
  const { address } = useAccount();
  const { connect, connectors, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { terms, isDevMode, toggleMode } = useTerminology();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as HTMLElement)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);


  const [showWelcome, setShowWelcome] = useState(true);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [presentUsers, setPresentUsers] = useState<PresentUser[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const today = format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [mounted, setMounted] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const relationToastCooldownRef = useRef<number>(0);
  const relationSpaceStateRef = useRef<Map<string, boolean>>(new Map()); // tracks if relation is inside a space
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const nodeToDeleteRef = useRef<Node | null>(null);
  const pendingOperations = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const optimisticOperations = useRef<Map<string, { type: string; rollback: () => void }>>(new Map());
  const positionDebounceRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Initialize component logging
  useEffect(() => {
    const startTime = Date.now();
    logger.info('Component', 'GraphPage mounting', { date: selectedDate }, address);
    
    return () => {
      const duration = Date.now() - startTime;
      logger.info('Component', 'GraphPage unmounting', { duration }, address);
    };
  }, []);

  // Track selected date changes
  useEffect(() => {
    logger.info('Navigation', 'Date changed', { newDate: selectedDate, previousDate: today }, address);
  }, [selectedDate, today, address]);

  // Track user interactions
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Hidden keyboard command to clear all data for the day: Ctrl+Shift+D
      if (event.ctrlKey && event.shiftKey && event.key === 'D') {
        event.preventDefault();
        const confirmed = window.confirm(`Are you sure you want to clear ALL data for ${selectedDate}? This action cannot be undone.`);
        if (confirmed) {
          // Clear all entities and relations for the current date
          fetch('/api/entities', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clearAll: true, date: selectedDate }),
          }).then(() => {
            fetch('/api/relations', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clearAll: true, date: selectedDate }),
            }).then(() => {
              // Clear local state
              setNodes([]);
              setEdges([]);
              setSelectedNode(null);
              setCompletedSteps([]);
              localStorage.removeItem('kg_completed_steps');
              localStorage.removeItem('kg_hide_checklist');
              queryClient.invalidateQueries({ queryKey: ['entities', selectedDate] });
              queryClient.invalidateQueries({ queryKey: ['relations', selectedDate] });
              queryClient.invalidateQueries({ queryKey: ['relationLinks', selectedDate] });
              toast.success(`All data cleared for ${selectedDate}`);
            });
          }).catch((error) => {
            console.error('Error clearing data:', error);
            toast.error('Failed to clear data');
          });
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedDate, queryClient]);



  // Real-time sync event handlers
  const handleRecentEventsSync = useCallback((events: unknown[]) => {
    // Process recent events for initial sync - helps new users catch up
    if (events.length > 0) {
      console.log('Processing recent events for sync:', events.length);
    }
    // This could trigger a full refetch or selective updates
    queryClient.invalidateQueries({ queryKey: ['entities', selectedDate] });
    queryClient.invalidateQueries({ queryKey: ['relations', selectedDate] });
    queryClient.invalidateQueries({ queryKey: ['relationLinks', selectedDate] });
  }, [queryClient, selectedDate]);

  const handleDataSyncEvent = useCallback((event: { type: string; data: Record<string, unknown> }) => {
    // Only log important sync events to reduce noise
    if (event.type === 'entity-delete' || event.type === 'relation-delete') {
      console.log('Received data sync event:', event);
    }
    
    // Apply the remote change to local state
    switch (event.type) {
      case 'entity-create':
        setNodes(prev => {
          // Check if node already exists to avoid duplicates
          if (prev.find(n => n.id === event.data.nodeId)) return prev;
          
          const newNode: Node = {
            id: String(event.data.nodeId),
            type: event.data.type === 'group' ? 'group' : 'topic',
            position: { x: Number(event.data.x) || 0, y: Number(event.data.y) || 0 },
            data: { 
              label: String(event.data.label || 'Untitled'),
              properties: (event.data.properties as Record<string, string>) || {},
              owner: String(event.data.userAddress),
              visibility: (event.data.visibility as 'public' | 'private') || 'public'
            },
            draggable: true
          };
          
          if (event.data.type === 'group') {
            newNode.style = {
              width: Number(event.data.width) || 400,
              height: Number(event.data.height) || 300,
              backgroundColor: 'rgba(208, 192, 247, 0.2)',
              borderColor: '#D0C0F7',
            };
          }
          
          return [...prev, newNode];
        });
        break;

      case 'entity-update':
        if (event.data.operationType === 'move') {
          // Handle real-time node movement
          setNodes(prev => 
            prev.map(n => 
              n.id === String(event.data.nodeId) 
                ? { ...n, position: event.data.position as { x: number; y: number } }
                : n
            )
          );
        } else {
          // Handle other updates (label, properties, etc.)
          setNodes(prev => 
            prev.map(n => 
              n.id === String(event.data.nodeId) 
                ? { ...n, data: { ...n.data, ...event.data } }
                : n
            )
          );
        }
        break;

      case 'entity-delete':
        setNodes(prev => prev.filter(n => n.id !== String(event.data.nodeId)));
        setEdges(prev => prev.filter(e => e.source !== String(event.data.nodeId) && e.target !== String(event.data.nodeId)));
        break;

      case 'relation-create':
        // Add new relation node
        setNodes(prev => {
          if (prev.find(n => n.id === String(event.data.id))) return prev;
          
          const newRelationNode: Node = {
            id: String(event.data.id),
            type: 'relation',
            position: { x: Number(event.data.x) || 0, y: Number(event.data.y) || 0 },
            data: {
              label: String(event.data.relationType || 'relation'),
              properties: (event.data.properties as Record<string, string>) || {},
              selectionColor: null,
              selectingAddress: null
            },
            draggable: true,
          };
          
          return [...prev, newRelationNode];
        });
        // Invalidate relation links to get the new edges
        queryClient.invalidateQueries({ queryKey: ['relationLinks', selectedDate] });
        break;

      case 'relation-update':
        setNodes(prev => 
          prev.map(n => 
            n.id === String(event.data.id) 
              ? { ...n, data: { ...n.data, ...event.data } }
              : n
          )
        );
        break;

      case 'relation-delete':
        setNodes(prev => prev.filter(n => n.id !== String(event.data.id)));
        setEdges(prev => prev.filter(e => e.source !== String(event.data.id) && e.target !== String(event.data.id)));
        break;

      case 'relation-link-create':
        queryClient.invalidateQueries({ queryKey: ['relationLinks', selectedDate] });
        break;
    }
  }, [queryClient, selectedDate]);

  const handleDataAcknowledgment = useCallback((ack: { eventId: string; status: string; resolution?: { loserEventId: string } }) => {
    console.log('Received acknowledgment:', ack);
    
    // Clear pending operation
    const timeout = pendingOperations.current.get(ack.eventId);
    if (timeout) {
      clearTimeout(timeout);
      pendingOperations.current.delete(ack.eventId);
    }

    // Handle successful operations
    if (ack.status === 'success') {
      optimisticOperations.current.delete(ack.eventId);
    } else if (ack.status === 'conflict-resolved') {
      // Handle conflict resolution
      const op = optimisticOperations.current.get(ack.eventId);
      if (op && ack.resolution && ack.resolution.loserEventId === ack.eventId) {
        // Our operation lost, rollback
        op.rollback();
        optimisticOperations.current.delete(ack.eventId);
        toast('Your change was overridden by a more recent edit', { duration: 4000 });
      }
    }
  }, []);

  const handleConflictResolution = useCallback((resolution: { resolution: string; loserEventId?: string }) => {
    console.log('Conflict resolved:', resolution);
    
    // Only show toast for conflicts that actually impact the user
    // Skip automatic position sync conflicts as they're handled seamlessly
    if (resolution.resolution === 'last-write-wins' && 
        resolution.loserEventId && 
        optimisticOperations.current.has(resolution.loserEventId)) {
      toast('Conflict resolved: most recent change was kept');
    }
  }, []);

  const socket = usePartySocket({
    host: process.env.NEXT_PUBLIC_PARTY_HOST || 'localhost:1999',
    room: selectedDate,
    onMessage(event) {
      const message = JSON.parse(event.data);
      
      if (message.type === 'sync') {
        setPresentUsers(message.users);
        // Handle initial sync with recent events
        if (message.recentEvents) {
          handleRecentEventsSync(message.recentEvents);
        }
      }
      
      if (message.type === 'selection') {
        const { address, nodeId } = message;
        setSelections(prev => {
          const otherSelections = prev.filter(s => s.address !== address);
          if (nodeId) {
            return [...otherSelections, { address, nodeId }];
          }
          return otherSelections;
        });
      }
      
      if (message.type === 'node-move') {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === message.payload.nodeId
              ? { ...n, position: message.payload.position }
              : n
          )
        );
      }

      // Handle real-time data synchronization
      if (message.type === 'data-sync') {
        handleDataSyncEvent(message.event);
      }

      // Handle acknowledgments from server
      if (message.type === 'data-ack') {
        handleDataAcknowledgment(message);
      }

      // Handle conflict resolutions
      if (message.type === 'conflict-resolution') {
        handleConflictResolution(message.resolution);
      }
    },
  });

  // Debounced position update broadcaster (defined after socket)
  const broadcastPositionUpdate = useCallback((nodeId: string, position: { x: number; y: number }) => {
    // Clear existing timeout for this node
    const existingTimeout = positionDebounceRef.current.get(nodeId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      if (socket) {
        const eventId = `position-update-${nodeId}-${Date.now()}`;
        socket.send(JSON.stringify({
          type: 'entity-update',
          timestamp: Date.now(),
          data: { nodeId, position, operationType: 'move' },
          eventId
        }));
      }
      positionDebounceRef.current.delete(nodeId);
    }, 300); // 300ms debounce

    positionDebounceRef.current.set(nodeId, timeout);
  }, [socket]);

  useEffect(() => {
    if (address && socket) {
      socket.send(JSON.stringify({ type: 'sync-user', address }));
    }
  }, [address, socket]);

  useEffect(() => {
    if (connectError) {
      console.debug('connect error', connectError);
      if ((connectError as { name?: string }).name === 'ConnectorNotFoundError') {
        toast.error('No browser wallet detected. Install MetaMask or choose WalletConnect.');
      } else {
        toast.error(connectError.message);
      }
    }
  }, [connectError]);

  /* ---------- hydration & modal ---------- */
  useEffect(() => {
    setMounted(true);
    // Onboarding checklist state
    const completed = localStorage.getItem('kg_completed_steps');
    if (completed) {
      setCompletedSteps(JSON.parse(completed));
    }
    const hide = localStorage.getItem('kg_hide_checklist');
    // Show checklist initially only if not all steps are completed and it hasn't been dismissed
    if (completed && JSON.parse(completed).length === ONBOARDING_STEPS.length) {
      setShowChecklist(false);
    } else if (!hide) {
      setShowChecklist(true);
    } else {
      setShowChecklist(false);
    }
    setConnecting(false);
  }, []);

  const dismissChecklist = () => {
    setShowChecklist(false);
  };

  const toggleChecklist = () => {
    setShowChecklist(prev => !prev);
    // If user manually shows it, clear the "hide forever" preference
    if (!showChecklist) {
      localStorage.removeItem('kg_hide_checklist');
    }
  };

  const completeStep = (stepId: string) => {
    setCompletedSteps(prev => {
      if (prev.includes(stepId)) return prev;
      const newCompletedSteps = [...prev, stepId];
      localStorage.setItem('kg_completed_steps', JSON.stringify(newCompletedSteps));
      // Keep checklist visible when all steps are completed so users can see their success
      // They can dismiss it manually if they want
      return newCompletedSteps;
    });
  };

  const resetChecklist = () => {
    setCompletedSteps([]);
    localStorage.removeItem('kg_completed_steps');
    toast.success('Checklist progress reset! Try the steps again.');
  };

  const updateRelationPosition = useMutation({
    mutationFn: async (payload: { id: string; x: number; y: number }) => {
      await fetch('/api/relations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    },
  });

  const updateNodeData = useMutation({
    mutationFn: async ({ nodeId, data }: { nodeId: string; data: { label?: string; properties?: Record<string, string>; visibility?: 'public' | 'private' } }) => {
      const isRelation = isNumeric(nodeId);
      const endpoint = isRelation ? '/api/relations' : '/api/entities';
      const payload = isRelation
        ? { id: nodeId, relationType: data.label, properties: data.properties, editorAddress: address }
        : {
            nodeId: nodeId,
            label: data.label,
            properties: data.properties,
            visibility: data.visibility,
            editorAddress: address,
          };

      console.log('[updateNodeData] Sending update:', {
        nodeId,
        endpoint,
        payload,
        hasProperties: !!data.properties,
        propertyCount: Object.keys(data.properties || {}).length
      });

      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to save node data');
      
      // Broadcast the change to other users
      if (socket && res.ok) {
        const eventId = `entity-update-${nodeId}-${Date.now()}`;
        socket.send(JSON.stringify({
          type: isRelation ? 'relation-update' : 'entity-update',
          timestamp: Date.now(),
          data: { nodeId, ...data, id: isRelation ? nodeId : undefined },
          eventId
        }));
      }
      
      return res.json();
    },
    onSuccess: (data, variables) => {
      // Check if a non-default name has been set (covers both normie and dev mode defaults)
      if (variables.data.label && variables.data.label !== 'New Topic' && variables.data.label !== 'New Entity') {
        completeStep('name-topic');
      }
      // After successfully saving, update the node in React Flow state
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === variables.nodeId) {
            return {
              ...n,
              data: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...(variables.data as any),
                // Ensure label is updated from the server response if available
                label: data.label || data.relationType || n.data.label,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                visibility: (variables.data as any).visibility ?? n.data.visibility,
              },
            };
          }
          return n;
        })
      );
      // Invalidate queries to refetch from the source of truth if needed,
      // though the manual update above provides a snappier feel.
      queryClient.invalidateQueries({ queryKey: ['entities', selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['relations', selectedDate] });
    },
  });

  const deleteRelation = useMutation({
    mutationFn: async (payload: { id: string }) => {
      const res = await fetch('/api/relations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok && res.status !== 404) {
        const error = await res.json();
        toast.error(error.error || 'Failed to delete relation');
        console.error('Delete relation error', error);
        throw new Error(error.error || 'Failed to delete relation');
      }
    },
    onSuccess: (data, variables) => {
      // Optimistically remove the node and its edges
      setNodes((nds) => nds.filter((n) => n.id !== variables.id));
      setEdges((eds) => eds.filter((e) => e.source !== variables.id && e.target !== variables.id));
      setSelectedNode(null);
      queryClient.invalidateQueries({ queryKey: ['relations', selectedDate] });
    },
  });

  const deleteEntity = useMutation({
    mutationFn: async (payload: { nodeId: string }) => {
      const res = await fetch('/api/entities', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok && res.status !== 404) {
        const error = await res.json();
        toast.error(error.error || 'Failed to delete node');
        console.error('Delete entity error', error);
        throw new Error(error.error || 'Failed to delete node');
      }
      
      // Broadcast the change to other users
      if (socket && (res.ok || res.status === 404)) {
        const eventId = `entity-delete-${payload.nodeId}-${Date.now()}`;
        socket.send(JSON.stringify({
          type: 'entity-delete',
          timestamp: Date.now(),
          data: { nodeId: payload.nodeId },
          eventId
        }));
      }
    },
    onSuccess: (data, variables) => {
      const deletedNodeId = variables.nodeId;

      // Check if the deleted node was a space (group) and handle child nodes
      setNodes((prevNodes) => {
        const deletedNode = prevNodes.find(n => n.id === deletedNodeId);
        const isSpace = deletedNode?.type === 'group';
        
        if (isSpace) {
          // If deleting a space, also remove all child nodes that have this space as parent
          // This prevents the "Parent node not found" error in React Flow
          const filteredNodes = prevNodes.filter((n) => {
            if (n.id === deletedNodeId) return false; // Remove the space itself
            if (n.parentNode === deletedNodeId) return false; // Remove child nodes
            return true;
          });
          
          console.log(`[Delete Space] Removed space ${deletedNodeId} and its ${prevNodes.filter(n => n.parentNode === deletedNodeId).length} child nodes`);
          return filteredNodes;
        } else {
          // For non-space nodes, just remove the node itself
          return prevNodes.filter((n) => n.id !== deletedNodeId);
        }
      });

      // Update edges to remove any connected to the deleted node(s)
      setEdges((prevEdges) => {
        return prevEdges.filter((e) => {
          // Keep edges that are not connected to the deleted node
          return e.source !== deletedNodeId && e.target !== deletedNodeId;
        });
      });

      setSelectedNode(null);
      queryClient.invalidateQueries({ queryKey: ['entities', selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['relations', selectedDate] });
    },
  });

  const addRelationLink = useMutation({
    mutationFn: async (payload: { relationId: string; entityId: string; role: 'source' | 'target' }) => {
      const res = await fetch('/api/relation-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to add relation link');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['relationLinks', selectedDate] });
    },
  });

  // fetch nodes and edges
  const entitiesQuery = useQuery({
    queryKey: ['entities', selectedDate, address],
    queryFn: async () => {
      const res = await fetch(`/api/entities?date=${selectedDate}&address=${address ?? ''}`);
      return res.json();
    },
  });

  const relationsQuery = useQuery({
    queryKey: ['relations', selectedDate],
    queryFn: async () => {
      const res = await fetch(`/api/relations?date=${selectedDate}`);
      return res.json();
    },
  });

  const linksQuery = useQuery({
    queryKey: ['relationLinks', selectedDate],
    queryFn: async () => {
      const res = await fetch('/api/relation-links');
      return res.json();
    },
  });

  const addEntity = useMutation({
    mutationFn: async (payload: {
      nodeId: string;
      label: string;
      type: 'knowledge' | 'category' | 'group';
      x: number;
      y: number;
      width?: number;
      height?: number;
      properties: Record<string, unknown>;
      date: string;
      userAddress: string;
      parentId?: string | null;
      visibility?: 'public' | 'private';
    }) => {
      const res = await fetch('/api/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      // Broadcast the change to other users
      if (socket && res.ok) {
        const eventId = `entity-create-${payload.nodeId}-${Date.now()}`;
        socket.send(JSON.stringify({
          type: 'entity-create',
          timestamp: Date.now(),
          data: payload,
          eventId
        }));
      }
      
      return res.json();
    },
    onSuccess: (_data, variables) => {
      completeStep('create-topic');
      // Add the new node to the state optimistically
      const newNode: Node = {
        // Use the same nodeId we sent to the server to keep client and server in sync
        id: variables.nodeId,
        position: { x: variables.x, y: variables.y },
        data: { label: variables.label || 'New' },
        // Normalize to a React Flow node type
        type: variables.type === 'knowledge' ? 'topic' : variables.type,
      };

      if (variables.type === 'group') {
        newNode.style = {
          width: 400,
          height: 300,
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderColor: '#3B82F6',
        };
        newNode.type = 'group';
        // Provide owner and visibility immediately so Inspector can allow editing
        newNode.data = {
          ...newNode.data,
          owner: variables.userAddress,
          visibility: variables.visibility ?? 'public',
          onResize: undefined, // Will be set later when data comes back from server
        };
      }

      setNodes((nds) => [...nds, newNode]);
      setSelectedNode(newNode);
      queryClient.invalidateQueries({ queryKey: ['entities', selectedDate] });
    },
  });

  const addRelation = useMutation({
    mutationFn: async (payload: { sourceId: string, targetId: string, relationType: string, x: number, y: number, date: string }) => {
      const res = await fetch('/api/relations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      // Broadcast the change to other users
      if (socket && res.ok) {
        const data = await res.json();
        const eventId = `relation-create-${data.id}-${Date.now()}`;
        socket.send(JSON.stringify({
          type: 'relation-create',
          timestamp: Date.now(),
          data: { ...payload, id: data.id },
          eventId
        }));
        return data;
      }
      
      return res.json();
    },
    onSuccess: (data, variables) => {
      // Check if this is the first connection between topics
      const topicNodes = nodes.filter(n => !isNumeric(n.id)); // Get all topic nodes (non-relation nodes)
      if (topicNodes.length >= 2) {
        completeStep('create-connection');
      }
      
      // Create and select the new relation node to show the Inspector immediately
      const newRelationNode: Node = {
        id: String(data.id),
        type: 'relation',
        data: {
          label: variables.relationType,
          properties: {},
          selectionColor: null,
          selectingAddress: null
        },
        position: { x: variables.x, y: variables.y },
        draggable: !!address,
      };
      
      // Add the new relation node to the state and select it
      setNodes((nds) => [...nds, newRelationNode]);
      setSelectedNode(newRelationNode);
      
      // Broadcast selection to other users
      socket.send(JSON.stringify({ type: 'selection', nodeId: String(data.id) }));
      
      queryClient.invalidateQueries({ queryKey: ['relations', selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['relationLinks', selectedDate] });
    },
  });

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  // Wallet guard helper
  const requireWallet = useCallback((): boolean => {
    if (!address) {
      toast.error('Please connect your wallet to interact with the Knowledge Graph Visualizer');
      return false;
    }
    return true;
  }, [address]);

  // Keyboard delete functionality
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedNode && 
            (event.target as HTMLElement)?.tagName !== 'INPUT' && 
            (event.target as HTMLElement)?.tagName !== 'TEXTAREA') {
          event.preventDefault();
          nodeToDeleteRef.current = selectedNode;
          setShowDeleteModal(true);
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedNode]);

  function handleConfirmDelete() {
    const nodeToDelete = nodeToDeleteRef.current;
    if (nodeToDelete) {
      const isRelation = /^\d+$/.test(nodeToDelete.id);
      if (isRelation) {
        deleteRelation.mutate({ id: nodeToDelete.id });
      } else {
        deleteEntity.mutate({ nodeId: nodeToDelete.id });
      }
      setSelectedNode(null);
      setShowDeleteModal(false);
      nodeToDeleteRef.current = null;
    }
  }

  // Escape key to close welcome modal
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && showWelcome) {
        setShowWelcome(false);
      }
    }

    if (showWelcome) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [showWelcome]);

  const addressToColor = useCallback((addr: string) => {
    // simple deterministic hash to hue
    let hash = 0;
    for (let i = 0; i < addr.length; i++) {
      hash = addr.charCodeAt(i) + ((hash << 5) - hash);
    }
    let hue = Math.abs(hash) % 360;
    // avoid blue/purple range (200-300)
    if (hue >= 200 && hue <= 300) {
      hue = (hue + 120) % 360;
    }
    const saturation = 70; // vivid
    const lightness = 50;
    return `hsl(${hue}deg ${saturation}% ${lightness}%)`;
  }, []);

  /* ---------- mutations ---------- */
  // map API to React Flow
  useEffect(() => {
    if (entitiesQuery.data && relationsQuery.data && linksQuery.data) {
      const buildNodes = () => {
        try {
          // Build new nodes preserving positions
          const positionMap = new Map(nodes.map(n => [n.id, n.position]));

        // --- first pass: Spaces (groups) ---
        const groupEntities = entitiesQuery.data.filter((e: { type: string }) => e.type === 'group');
        const groupIds = new Set(groupEntities.map((g: { nodeId: string }) => g.nodeId));

        const groupNodes = groupEntities.map((e: { nodeId: string; label: string; properties: Record<string, string>; x: number; y: number; type: string; userAddress: string; visibility: string; width?: number; height?: number; }) => {
          const selection = selections.find(s => s.nodeId === e.nodeId);
          const isOwner = Boolean(e.userAddress && address && e.userAddress.toLowerCase() === address.toLowerCase());
          const maskedLabel = e.visibility === 'private' && !isOwner ? `${e.userAddress?.slice(0,6)}...${e.userAddress?.slice(-4)}` : e.label;
          const isSelected = selectedNode?.id === e.nodeId;

          const handleResize = (width: number, height: number) => {
            updateEntityPatch.mutate({ nodeId: e.nodeId, width, height });
          };

          const node: Node = {
            id: e.nodeId,
            type: 'group',
            data: { 
              label: maskedLabel, 
              properties: e.properties, 
              selectingAddress: selection ? selection.address : null, 
              owner: e.userAddress, 
              visibility: e.visibility,
              onResize: isOwner ? handleResize : undefined,
            },
            position: positionMap.get(e.nodeId) ?? { x: e.x ?? Math.random() * 400, y: e.y ?? Math.random() * 400 },
            draggable: isOwner,
            selectable: isOwner,
            style: {
              width: e.width ?? 400,
              height: e.height ?? 300,
              backgroundColor: 'rgba(208, 192, 247, 0.2)',
              borderColor: '#D0C0F7',
            },
          };

          // Add gentle highlighting for currently selected space
          if (isSelected) {
            node.style = {
              ...node.style,
              borderColor: '#3B82F6',
              borderWidth: '2px',
              boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.3), 0 0 12px rgba(59, 130, 246, 0.2)',
            };
          }

          // Add selection styling for other users
          if (selection) {
            node.style = {
              ...node.style,
              borderColor: isSelected ? '#3B82F6' : addressToColor(selection.address),
              borderWidth: isSelected ? '2px' : '3px',
              boxShadow: isSelected 
                ? '0 0 0 2px rgba(59, 130, 246, 0.3), 0 0 12px rgba(59, 130, 246, 0.2)'
                : `0 0 0 3px ${addressToColor(selection.address)}, 0 0 10px ${addressToColor(selection.address)}`,
            };
          }

          return node;
        });

        // --- second pass: Topics (non-group entities) ---
        const groupInfoMap = new Map<string, { visibility: string; owner: string }>();
        groupEntities.forEach((g: { nodeId: string; visibility: string; userAddress: string }) => {
          groupInfoMap.set(g.nodeId, { visibility: g.visibility, owner: g.userAddress });
        });
        const topicEntities = entitiesQuery.data.filter((e: { type: string }) => e.type !== 'group');

        const topicNodes = topicEntities.map((e: { nodeId: string; label: string; properties: Record<string, string>; x: number; y: number; type: string; parentId: string | null; userAddress: string; visibility: string; }) => {
          const selection = selections.find(s => s.nodeId === e.nodeId);
          const hasWallet = !!address;
          const isSelected = selectedNode?.id === e.nodeId;
          
          // Transform default labels based on current mode, but preserve custom labels
          let displayLabel = e.label;
          if (e.label === 'New Topic' || e.label === 'New Entity') {
            displayLabel = isDevMode ? 'New Entity' : 'New Topic';
          }
          
          const node: Node = {
            id: e.nodeId,
            type: 'topic',
            data: { label: displayLabel, properties: e.properties, selectingAddress: selection ? selection.address : null, owner: e.userAddress, visibility: e.visibility },
            position: positionMap.get(e.nodeId) ?? { x: e.x ?? Math.random() * 400, y: e.y ?? Math.random() * 400 },
            draggable: hasWallet,
          };

          if (e.parentId) {
            if (groupIds.has(e.parentId)) {
              const gInfo = groupInfoMap.get(e.parentId)!;
              const isOwnerOfGroup = gInfo.owner && address && gInfo.owner.toLowerCase() === address.toLowerCase();
              if (gInfo.visibility === 'private' && !isOwnerOfGroup) {
                return null; // skip topics hidden inside private space
              }
              node.parentId = e.parentId;
            } else {
              if (process.env.NODE_ENV === 'development') {
                console.warn(`Topic ${e.nodeId} has orphaned parentId ${e.parentId}`);
              }
            }
          }

          // Add gentle highlighting for currently selected entity
          if (isSelected) {
            node.style = {
              ...node.style,
              boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.5), 0 0 8px rgba(59, 130, 246, 0.3)',
              borderRadius: '8px',
            };
          }

          // Add selection styling for other users
          if (selection) {
            node.style = {
              ...node.style,
              borderColor: addressToColor(selection.address),
              borderWidth: 2,
              boxShadow: isSelected 
                ? `0 0 0 2px rgba(59, 130, 246, 0.5), 0 0 8px rgba(59, 130, 246, 0.3), 0 0 0 4px ${addressToColor(selection.address)}`
                : `0 0 0 2px ${addressToColor(selection.address)}, 0 0 6px ${addressToColor(selection.address)}`,
            };
          }

          return node;
        }).filter(Boolean);

        // Build a quick map of relationId -> [sourceId, targetId]
        const relLinkMap = new Map<number, { source?: string; target?: string }>();
        linksQuery.data.forEach((l: { relationId: number; entityId: string; role: string }) => {
          const entry = relLinkMap.get(l.relationId) || {};
          if (l.role === 'source') entry.source = l.entityId;
          if (l.role === 'target') entry.target = l.entityId;
          relLinkMap.set(l.relationId, entry);
        });

        const relationNodes = relationsQuery.data.map((r: { id: number; relationType: string; properties: Record<string, string>; x: number; y: number; }) => {
          const idStr = String(r.id);
          const selection = selections.find(s => s.nodeId === idStr);
          const hasWallet = !!address;
          const isSelected = selectedNode?.id === idStr;

          // Detect if both endpoints live inside the same Space
          let parentId: string | undefined;
          const endpoints = relLinkMap.get(r.id);
          if (endpoints?.source && endpoints?.target) {
            const srcNode = entitiesQuery.data.find((e: { nodeId: string }) => e.nodeId === endpoints.source);
            const tgtNode = entitiesQuery.data.find((e: { nodeId: string }) => e.nodeId === endpoints.target);
            if (srcNode?.parentId && srcNode.parentId === tgtNode?.parentId) {
              // Validate that the parent actually exists in the group nodes
              const parentExists = groupIds.has(srcNode.parentId);
              if (parentExists) {
                parentId = srcNode.parentId;
              } else {
                if (process.env.NODE_ENV === 'development') {
                  console.warn(`Relation ${idStr} tried to reference non-existent parent ${srcNode.parentId}`);
                }
              }
            }
          }

          // If we previously saved position (r.x/y) they are already in the correct coordinate space
          // (relative to Space if parentId is set, otherwise global). Do not adjust further.
          const initPos = positionMap.get(idStr) ?? { x: r.x ?? Math.random() * 400, y: r.y ?? Math.random() * 400 };

          const relNode: Node = {
            id: idStr,
            type: 'relation',
            parentId,
            data: {
              label: r.relationType,
              properties: r.properties,
              selectionColor: selection ? addressToColor(selection.address) : null,
              selectingAddress: selection ? selection.address : null
            },
            position: initPos,
            draggable: hasWallet,
          };

          // Add gentle highlighting for currently selected relation
          if (isSelected) {
            relNode.style = {
              boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.5), 0 0 8px rgba(59, 130, 246, 0.3)',
              borderRadius: '8px',
            };
          }

          // Add selection styling for other users
          if (selection) {
            relNode.style = {
              ...relNode.style,
              borderColor: addressToColor(selection.address),
              borderWidth: 2,
              boxShadow: isSelected 
                ? '0 0 0 2px rgba(59, 130, 246, 0.5), 0 0 8px rgba(59, 130, 246, 0.3)'
                : `0 0 0 2px ${addressToColor(selection.address)}, 0 0 6px ${addressToColor(selection.address)}`,
            };
          }

          return relNode;
        });

          const allNodes = [...groupNodes, ...topicNodes, ...relationNodes];
          
          // Final safety check: remove any nodes with orphaned parent references
          const validParentIds = new Set(groupNodes.map((n: Node) => n.id));
          const safeNodes = allNodes.filter(node => {
            if (node.parentId && !validParentIds.has(node.parentId)) {
              // Only log orphaned nodes in development
              if (process.env.NODE_ENV === 'development') {
                console.warn(`Removing orphaned node ${node.id} with invalid parentId ${node.parentId}`);
              }
              return false;
            }
            return true;
          });
          
          return safeNodes;
        } catch (error) {
          errorLogger.logError(error instanceof Error ? error : new Error(String(error)), 'BuildNodes failed', address);
          return []; // Return empty array as fallback
        }
      };

      const newEdges = linksQuery.data.map((l: { id: number; relationId: number; entityId: string; role: string; }) => {
        if (l.role === 'source') {
          return {
            id: `${l.entityId}-${l.relationId}-${l.id}`,
            source: l.entityId,
            target: String(l.relationId),
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed, width: 30, height: 30, color: '#fff' },
          };
        } else {
          return {
            id: `${l.relationId}-${l.entityId}-${l.id}`,
            source: String(l.relationId),
            target: l.entityId,
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed, width: 30, height: 30, color: '#fff' },
          };
        }
      });

      const built = buildNodes();
      console.log('[BuildNodes] count', built.length);
      console.table(built.map((n) => ({ id: n.id, type: n.type, parentId: n.parentId, x: n.position.x, y: n.position.y })));
      setNodes(built);
      setEdges(newEdges);
    }
  }, [entitiesQuery.data, relationsQuery.data, linksQuery.data, selections, addressToColor, isDevMode]);

  const onConnect: OnConnect = useCallback(
    (params: Connection | Edge) => {
      if (!requireWallet()) return;
      // prevent self-looping connections or connecting to null
      if (!params.source || !params.target || params.source === params.target) {
        return;
      }

      const sourceNode = nodes.find(n => n.id === params.source);
      const targetNode = nodes.find(n => n.id === params.target);
      if (!sourceNode || !targetNode) return;

      const isSourceRelation = sourceNode.type === 'relation';
      const isTargetRelation = targetNode.type === 'relation';

      // Disallow Relation -> Relation connections
      if (isSourceRelation && isTargetRelation) {
        toast.error("Cannot connect a Relation to another Relation.");
        return;
      }

      // Case 1: Topic -> Topic (Create a new relation)
      if (!isSourceRelation && !isTargetRelation) {
        const x = (sourceNode.position.x + targetNode.position.x) / 2;
        const y = (sourceNode.position.y + targetNode.position.y) / 2;

        addRelation.mutate({
          sourceId: params.source,
          targetId: params.target,
          relationType: 'connected to',
          x,
          y,
          date: selectedDate,
        });
        return;
      }

      // Case 2: Topic -> Relation : add source link
      if (!isSourceRelation && isTargetRelation) {
        addRelationLink.mutate({ relationId: targetNode.id, entityId: sourceNode.id, role: 'source' });
        return;
      }

      // Case 3: Relation -> Topic : add target link
      if (isSourceRelation && !isTargetRelation) {
        addRelationLink.mutate({ relationId: sourceNode.id, entityId: targetNode.id, role: 'target' });
        return;
      }
    },
    [nodes, addRelation, selectedDate, addRelationLink, requireWallet]
  );

  const handleAddNode = () => {
    if (!requireWallet()) return;
    console.log('Creating a new topic...');

    // --- helper: find first non-overlapping spot OUTSIDE of any space ---
    const TOPIC_W = 180;
    const TOPIC_H = 60;
    const PADDING = 40; // Increased padding for better spacing
    const STEP = 60; // Larger grid step for better distribution

    // Check if position overlaps with existing nodes OR is inside any space
    const doesOverlapOrInsideSpace = (x: number, y: number): boolean => {
      // Check overlap with existing nodes
      for (const n of nodes) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nW = ((n.style as any)?.width ?? (n.type === 'group' ? 400 : TOPIC_W)) as number;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nH = ((n.style as any)?.height ?? (n.type === 'group' ? 300 : TOPIC_H)) as number;
        const overlapX = x + TOPIC_W + PADDING > n.position.x && n.position.x + nW + PADDING > x;
        const overlapY = y + TOPIC_H + PADDING > n.position.y && n.position.y + nH + PADDING > y;
        if (overlapX && overlapY) return true;
      }

      // Check if position is inside any space boundary (ensure nodes stay OUTSIDE spaces)
      for (const space of nodes.filter(n => n.type === 'group')) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const spaceW = ((space.style as any)?.width ?? 400) as number;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const spaceH = ((space.style as any)?.height ?? 300) as number;
        
        // Check if the new node would be entirely inside the space
        const nodeLeft = x;
        const nodeRight = x + TOPIC_W;
        const nodeTop = y;
        const nodeBottom = y + TOPIC_H;
        
        const spaceLeft = space.position.x;
        const spaceRight = space.position.x + spaceW;
        const spaceTop = space.position.y;
        const spaceBottom = space.position.y + spaceH;
        
        // If node is entirely inside space boundaries, it's invalid
        if (nodeLeft >= spaceLeft && nodeRight <= spaceRight && 
            nodeTop >= spaceTop && nodeBottom <= spaceBottom) {
          return true; // Position is inside a space - avoid it
        }
      }
      
      return false;
    };

    // Start searching from a position that's more likely to be outside spaces
    let posX = 100;
    let posY = 100;
    const MAX_RANGE = 2500; // Expanded search bounds
    
    while (doesOverlapOrInsideSpace(posX, posY) && posY < MAX_RANGE) {
      posX += STEP;
      if (posX > MAX_RANGE) {
        posX = 100;
        posY += STEP;
      }
    }

    console.log(`[AddNode] Found position outside spaces: (${posX}, ${posY})`);

    // --- Auto-numbering for new entities ---
    const baseLabel = isDevMode ? 'New Entity' : 'New Topic';
    const existingLabels = nodes
      .filter(n => n.type === 'topic' || n.type === 'knowledge')
      .map(n => n.data?.label || '')
      .filter(label => label.startsWith(baseLabel));
    
    // Extract numbers from existing labels and find the next available number
    const existingNumbers = existingLabels
      .map(label => {
        const match = label.match(new RegExp(`^${baseLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`));
        return match ? parseInt(match[1], 10) : (label === baseLabel ? 1 : 0);
      })
      .filter(num => num > 0);
    
    const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
    const numberedLabel = `${baseLabel} ${nextNumber}`;

    const nodeId = crypto.randomUUID();

    addEntity.mutate({
      nodeId,
      label: numberedLabel,
      type: 'knowledge',
      x: posX,
      y: posY,
      properties: {},
      date: selectedDate,
      userAddress: address!,
    });

    // Center view to include the new node after a brief delay
    setTimeout(() => {
      if (rfInstance) {
        console.log('[AddNode] Centering view to include new node');
        rfInstance.fitView({ padding: 0.2, duration: 800 });
      }
    }, 300);
  };

  const handleAddSpace = () => {
    if (!requireWallet()) return;
    console.log('Creating a new space...');
    
    // --- Find non-overlapping position for new space ---
    const SPACE_W = 400;
    const SPACE_H = 300;
    const PADDING = 60; // Generous padding between spaces
    const STEP = 80; // Large grid step for space distribution

    // Check if space position overlaps with existing nodes/spaces
    const doesSpaceOverlap = (x: number, y: number): boolean => {
      for (const n of nodes) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nW = ((n.style as any)?.width ?? (n.type === 'group' ? 400 : 180)) as number;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nH = ((n.style as any)?.height ?? (n.type === 'group' ? 300 : 60)) as number;
        
        const overlapX = x + SPACE_W + PADDING > n.position.x && n.position.x + nW + PADDING > x;
        const overlapY = y + SPACE_H + PADDING > n.position.y && n.position.y + nH + PADDING > y;
        if (overlapX && overlapY) return true;
      }
      return false;
    };

    // Start searching from a position that spreads spaces out
    let posX = 150;
    let posY = 150;
    const MAX_RANGE = 3000; // Large search area for spaces
    
    while (doesSpaceOverlap(posX, posY) && posY < MAX_RANGE) {
      posX += STEP;
      if (posX > MAX_RANGE) {
        posX = 150;
        posY += STEP;
      }
    }

    console.log(`[AddSpace] Found position for new space: (${posX}, ${posY})`);
    
    // --- Auto-numbering for new spaces ---
    const baseLabel = 'New Space';
    const existingLabels = nodes
      .filter(n => n.type === 'group')
      .map(n => n.data?.label || '')
      .filter(label => label.startsWith(baseLabel));
    
    // Extract numbers from existing labels and find the next available number
    const existingNumbers = existingLabels
      .map(label => {
        const match = label.match(/^New Space (\d+)$/);
        return match ? parseInt(match[1], 10) : (label === baseLabel ? 1 : 0);
      })
      .filter(num => num > 0);
    
    const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
    const numberedLabel = `${baseLabel} ${nextNumber}`;
    
    const nodeId = crypto.randomUUID();

    const spacePayload = {
      nodeId,
      label: numberedLabel,
      type: 'group' as const,
      x: posX,
      y: posY,
      width: SPACE_W,
      height: SPACE_H,
      properties: {},
      date: selectedDate,
      userAddress: address!,
    };

    addEntity.mutate(spacePayload);

    // Center view to include the new space after a brief delay
    setTimeout(() => {
      if (rfInstance) {
        console.log('[AddSpace] Centering view to include new space');
        rfInstance.fitView({ padding: 0.2, duration: 800 });
      }
    }, 300);
  };

  const updateEntityPatch = useMutation({
    mutationFn: async (payload: { nodeId: string, x?: number, y?: number, parentId?: string | null, width?: number, height?: number }) => {
      console.log('[updateEntityPatch] Sending PATCH request:', payload);
      const response = await fetch('/api/entities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[updateEntityPatch] PATCH failed:', response.status, errorText);
        throw new Error(`PATCH failed: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('[updateEntityPatch] PATCH successful:', result);
      return result;
    },
  });

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (!requireWallet()) return;

      // Show toast for relation movement only when crossing space boundaries
      if (isNumeric(node.id)) {
        // Check if relation is currently inside any space
        // Debug logging reduced to minimize console noise
        
        // Get absolute position (convert from relative if inside a space)
        let absoluteX = node.position.x;
        let absoluteY = node.position.y;
        
        if (node.parentId) {
          const parentSpace = nodes.find(n => n.id === node.parentId);
          if (parentSpace) {
            absoluteX += parentSpace.position.x;
            absoluteY += parentSpace.position.y;
            // Position conversion logging reduced
          }
        }
        
        const relationCenterX = absoluteX + 90; // approximate relation node center
        const relationCenterY = absoluteY + 30;
        // Relation position logging reduced
        
        const isInsideSpace = nodes.some(spaceNode => {
          if (spaceNode.type !== 'group') return false;
          
          const spaceData = spaceNode.data as { visibility?: string; owner?: string };
          if (spaceData.visibility === 'private' && 
              spaceData.owner && address && 
              spaceData.owner.toLowerCase() !== address.toLowerCase()) {
            console.log(`[Relation Toast] Skipping private space ${spaceNode.id} (not owner)`);
            return false; // skip private spaces not owned by current user
          }
          
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sWidth = (spaceNode.style as any)?.width || 400;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sHeight = (spaceNode.style as any)?.height || 300;
          
          const spaceLeft = spaceNode.position.x;
          const spaceRight = spaceNode.position.x + sWidth;
          const spaceTop = spaceNode.position.y;
          const spaceBottom = spaceNode.position.y + sHeight;
          
          const isInside = relationCenterX >= spaceLeft && 
                          relationCenterX <= spaceRight &&
                          relationCenterY >= spaceTop && 
                          relationCenterY <= spaceBottom;
          
          // Space boundary check logging reduced
          
          return isInside;
        });
        
        // Check previous state and show toast only if boundary was crossed
        const wasInsideSpace = relationSpaceStateRef.current.get(node.id) || false;
        const boundaryChanged = wasInsideSpace !== isInsideSpace;
        
        // Only log when boundary actually changes
        
        if (boundaryChanged) {
          const now = Date.now();
          const cooldownPeriod = 5000; // 5 seconds cooldown for boundary changes
          
          console.log(`[Relation Toast] Boundary crossed! Direction: ${isInsideSpace ? 'INTO space' : 'OUT OF space'}`);
          
          if (now - relationToastCooldownRef.current > cooldownPeriod) {
            console.log('[Relation Toast] Showing toast (cooldown passed)');
            toast(terms.relationSpaceToast, {
              duration: 4000,
            });
            relationToastCooldownRef.current = now;
          } else {
            console.log(`[Relation Toast] Cooldown active (${Math.ceil((cooldownPeriod - (now - relationToastCooldownRef.current)) / 1000)}s remaining)`);
          }
        }
        
        // Update the stored state
        relationSpaceStateRef.current.set(node.id, isInsideSpace);
      }

      // Helper: find enclosing Space (group) for a point (using center of node for more predictable behavior)
      const findEnclosingSpace = (nodeId: string, x: number, y: number): string | null => {
        // Consider only group nodes (Spaces)
        const spaces = nodes.filter((n) => n.type === 'group');
        
        // Use approximate node dimensions for center calculation
        const nodeWidth = 180; // approximate topic node width
        const nodeHeight = 60; // approximate topic node height
        
        // Use center point of the node for more predictable snapping
        const centerX = x + nodeWidth / 2;
        const centerY = y + nodeHeight / 2;
        
        for (const space of spaces) {
          const spaceData = space.data as { visibility?: string; owner?: string };
          if (
            spaceData.visibility === 'private' &&
            spaceData.owner &&
            address &&
            spaceData.owner.toLowerCase() !== address.toLowerCase()
          ) {
            continue; // skip private spaces not owned by current user
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sWidth = (space.style as any)?.width || 400;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sHeight = (space.style as any)?.height || 300;
          
          // Add some padding inside the space for better UX
          const padding = 10;
          const spaceLeft = space.position.x + padding;
          const spaceRight = space.position.x + sWidth - padding;
          const spaceTop = space.position.y + padding;
          const spaceBottom = space.position.y + sHeight - padding;
          
          const withinX = centerX >= spaceLeft && centerX <= spaceRight;
          const withinY = centerY >= spaceTop && centerY <= spaceBottom;
          
          if (withinX && withinY) {
            return space.id;
          }
        }
        return null;
      };

      // Determine new parentId if this is an Entity (non-relation, non-space)
      let newParentId: string | null = node.parentId ?? null;
      if (!isNumeric(node.id) && node.type !== 'group') {
        const getGlobalPos = (nd: Node) => {
          if (nd.parentId) {
            const sp = nodes.find((n) => n.id === nd.parentId);
            if (sp) {
              return { x: nd.position.x + sp.position.x, y: nd.position.y + sp.position.y };
            }
          }
          return nd.position;
        };

        const globalPos = getGlobalPos(node);

        newParentId = findEnclosingSpace(node.id, globalPos.x, globalPos.y);

        // If currently inside a space and still within its bounds, keep parentId
        if (node.parentId) {
          const currentSpace = nodes.find((n) => n.id === node.parentId);
          if (currentSpace) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sW = ((currentSpace.style as any)?.width ?? 400) as number;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sH = ((currentSpace.style as any)?.height ?? 300) as number;
            const cx = globalPos.x + 90; // half TOPIC_W approx centre adjustment
            const cy = globalPos.y + 30; // half TOPIC_H approx
            const insideX = cx >= currentSpace.position.x && cx <= currentSpace.position.x + sW;
            const insideY = cy >= currentSpace.position.y && cy <= currentSpace.position.y + sH;
            if (insideX && insideY) {
              newParentId = currentSpace.id;
            }
          }
        }

        // If parent is changing, convert between absolute and relative coords
        // Normalize null/undefined comparison (both represent "no parent")
        const normalizedCurrentParent = node.parentId ?? null;
        const normalizedNewParent = newParentId ?? null;
        
        if (normalizedNewParent !== normalizedCurrentParent) {
          let adjustedX = node.position.x;
          let adjustedY = node.position.y;

          if (newParentId) {
            // Moving INTO a space → convert to coordinates relative to the space
            const space = nodes.find((n) => n.id === newParentId);
            if (space) {
              adjustedX = node.position.x - space.position.x;
              adjustedY = node.position.y - space.position.y;
            }
          } else if (node.parentId) {
            // Moving OUT of a space → convert back to global coords
            const oldSpace = nodes.find((n) => n.id === node.parentId);
            if (oldSpace) {
              adjustedX = node.position.x + oldSpace.position.x;
              adjustedY = node.position.y + oldSpace.position.y;
            }
          }

          // Update local state optimistically with new parent + converted coords
          setNodes((prev) =>
            prev.map((n) =>
              n.id === node.id
                ? { ...n, parentId: newParentId ?? undefined, position: { x: adjustedX, y: adjustedY } }
                : n
            )
          );

          // Persist converted position
          updateEntityPatch.mutate({
            nodeId: node.id,
            x: adjustedX,
            y: adjustedY,
            parentId: newParentId,
          });

          // Toast feedback
          const entityName = node.data?.label || 'Untitled';
          if (newParentId) {
            const spaceNode = nodes.find((n) => n.id === newParentId);
            const spaceName = spaceNode?.data?.label || 'Space';
            toast.success(`Moved ${entityName} into ${spaceName}`);
          } else if (normalizedCurrentParent) {
            // Moving out of a space - show which space it was removed from
            const previousSpaceNode = nodes.find((n) => n.id === normalizedCurrentParent);
            const previousSpaceName = previousSpaceNode?.data?.label || 'Space';
            toast.success(`Moved ${entityName} out of ${previousSpaceName}`);
          }

          // skip the later patch below to avoid duplicate if we already handled
          return;
        }
      }

      // Broadcast movement to other clients using debounced function
      broadcastPositionUpdate(node.id, node.position);

      // Persist change to DB
      if (isNumeric(node.id)) {
        updateRelationPosition.mutate({
          id: node.id,
          x: node.position.x,
          y: node.position.y,
        });
      } else {
        updateEntityPatch.mutate({
          nodeId: node.id,
          x: node.position.x,
          y: node.position.y,
          parentId: newParentId,
        });
      }
    },
    [nodes, updateEntityPatch, updateRelationPosition, requireWallet, terms, broadcastPositionUpdate]
  );

  const handlePaneClick = () => {
    setSelectedNode(null);
    socket.send(JSON.stringify({ type: 'selection', nodeId: null }));
  };

  // --- Auto-layout using Dagre ---
  const handleAutoLayout = () => {
    if (!requireWallet()) return;

    console.log('%c[AutoLayout] Triggered', 'color: lightgreen; font-weight: bold');
    console.log('[AutoLayout] Current node positions', nodes.map((n) => ({ id: n.id, parentId: n.parentId, pos: n.position })));

    // Helper to run dagre layout with improved spacing and alignment
    const runLayout = (
      subsetNodes: Node[],
      subsetEdges: Edge[],
      offsetX = 0,
      offsetY = 0,
      isSpace = false
    ) => {
      if (subsetNodes.length === 0) return new Map();

      const g = new dagre.graphlib.Graph();
      g.setDefaultEdgeLabel(() => ({}));
      
      // Improved spacing parameters for better design
      const spacing = isSpace 
        ? { rankdir: 'TB', nodesep: 80, ranksep: 100, align: 'UL' } // More compact inside spaces
        : { rankdir: 'TB', nodesep: 120, ranksep: 140, align: 'UL' }; // More spacious globally
      
      g.setGraph(spacing);

      subsetNodes.forEach((n) => {
        // Get actual dimensions or use standardized defaults
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = (n.style as any)?.width || (n.type === 'group' ? 300 : 180);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const h = (n.style as any)?.height || (n.type === 'group' ? 200 : 60);
        g.setNode(n.id, { width: w, height: h });
      });

      subsetEdges.forEach((e) => g.setEdge(e.source, e.target));

      dagre.layout(g);

      const posMap = new Map<string, { x: number; y: number }>();
      subsetNodes.forEach((n) => {
        const nodeWithPos = g.node(n.id);
        if (nodeWithPos) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = (n.style as any)?.width || (n.type === 'group' ? 300 : 180);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const h = (n.style as any)?.height || (n.type === 'group' ? 200 : 60);
          // Convert Dagre center to React Flow top-left coordinates
          const topLeftX = nodeWithPos.x - w / 2;
          const topLeftY = nodeWithPos.y - h / 2;
          posMap.set(n.id, { x: topLeftX + offsetX, y: topLeftY + offsetY });
        }
      });

      console.log('[runLayout] subset ids', subsetNodes.map((n) => n.id));
      console.log('[runLayout] offset', { offsetX, offsetY }, 'isSpace:', isSpace);
      console.table(Array.from(posMap.entries()).map(([id, p]) => ({ id, ...p })));

      return posMap;
    };

    setNodes((curr) => {
      let next = [...curr];
 
      // Separate nodes by their current container state
      const spaces = next.filter((n) => n.type === 'group');
      const globalNodes = next.filter((n) => !n.parentId && n.type !== 'group');
      
      console.log('[AutoLayout] === Spaces found ===', spaces.length);
      console.log('[AutoLayout] === Global nodes ===', globalNodes.length);

      // --- 1) Layout global nodes (entities outside of spaces) ---
      if (globalNodes.length > 0) {
        console.log('[AutoLayout] === Global layout ===');
        
        const globalNodeIds = new Set(globalNodes.map((n) => n.id));
        const globalEdges = edges.filter(
          (e) => globalNodeIds.has(e.source.toString()) && globalNodeIds.has(e.target.toString())
        );
        
        // Include spaces in global layout for proper positioning
        const allGlobalEntities = [...globalNodes, ...spaces];
        const globalPos = runLayout(allGlobalEntities, globalEdges, 50, 50, false);
        
        // Apply new positions to global entities
        next = next.map((n) => {
          if (globalPos.has(n.id)) {
            return { ...n, position: globalPos.get(n.id)! };
          }
          return n;
        });
      }
 
      // --- 2) Layout entities within each space ---
      console.log('[AutoLayout] === Per-Space layout ===');
      
      spaces.forEach((space) => {
        const spaceChildren = next.filter((c) => c.parentId === space.id);
        
        if (spaceChildren.length === 0) {
          console.log(`[SpaceLayout] Space ${space.id} is empty, skipping`);
          return;
        }
 
        console.log(`[SpaceLayout] Space ${space.id} (${spaceChildren.length} children)`);
 
        // Get space dimensions
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sWidth = ((space.style as any)?.width ?? 400) as number;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sHeight = ((space.style as any)?.height ?? 300) as number;
 
        // Layout children within the space
        const childIds = new Set(spaceChildren.map((c) => c.id));
        const childEdges = edges.filter(
          (e) => childIds.has(e.source.toString()) && childIds.has(e.target.toString())
        );
 
        console.log('[SpaceLayout] Running layout for children', Array.from(childIds));
 
        // Use generous padding inside spaces for better visual hierarchy
        const padding = 40;
        const posInsideRaw = runLayout(spaceChildren, childEdges, padding, padding, true);
 
        console.log('[SpaceLayout] Raw positions', Array.from(posInsideRaw.entries()));
 
        // Ensure nodes stay within space bounds with proper padding
        const layoutPositions = new Map<string, { x: number; y: number }>();
        spaceChildren.forEach((child) => {
          const raw = posInsideRaw.get(child.id);
          if (!raw) return;
          
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cW = ((child.style as any)?.width ?? 180) as number;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cH = ((child.style as any)?.height ?? 60) as number;
          
          // Ensure minimum and maximum bounds with padding
          const minX = padding;
          const minY = padding;
          const maxX = Math.max(minX, sWidth - cW - padding);
          const maxY = Math.max(minY, sHeight - cH - padding);
          
          layoutPositions.set(child.id, {
            x: Math.max(minX, Math.min(raw.x, maxX)),
            y: Math.max(minY, Math.min(raw.y, maxY)),
          });
        });
 
        console.log('[SpaceLayout] Final clamped positions', Array.from(layoutPositions.entries()));
 
        // Apply the new positions to children
        next = next.map((n) => {
          if (layoutPositions.has(n.id)) {
            return { ...n, position: layoutPositions.get(n.id)! };
          }
          return n;
        });
      });

      // --- 3) Handle orphaned relations (relations that should be inside spaces) ---
      const orphanedRelations = next.filter((n) => n.type === 'relation' && !n.parentId);
      
      orphanedRelations.forEach((relation) => {
        const relatedEdges = edges.filter(
          (e) => e.source.toString() === relation.id || e.target.toString() === relation.id
        );
        
        if (relatedEdges.length > 0) {
          // Check if all connected nodes are in the same space
          const connectedNodeIds = relatedEdges.flatMap((e) => [
            e.source.toString() === relation.id ? e.target.toString() : e.source.toString()
          ]);
          
          const connectedNodes = next.filter((n) => connectedNodeIds.includes(n.id));
          const parentSpaces = [...new Set(connectedNodes.map((n) => n.parentId).filter(Boolean))];
          
          // If all connected nodes are in the same space, move the relation there
          if (parentSpaces.length === 1) {
            const targetSpaceId = parentSpaces[0];
            const targetSpace = next.find((n) => n.id === targetSpaceId);
            
            if (targetSpace) {
              // Position the relation in the center of its connected nodes within the space
              const connectedInSpace = connectedNodes.filter((n) => n.parentId === targetSpaceId);
              if (connectedInSpace.length > 0) {
                const avgX = connectedInSpace.reduce((sum, n) => sum + n.position.x, 0) / connectedInSpace.length;
                const avgY = connectedInSpace.reduce((sum, n) => sum + n.position.y, 0) / connectedInSpace.length;
                
                next = next.map((n) => 
                  n.id === relation.id 
                    ? { ...n, parentId: targetSpaceId, position: { x: avgX, y: avgY } }
                    : n
                );
                
                console.log(`[AutoLayout] Moved relation ${relation.id} into space ${targetSpaceId}`);
              }
            }
          }
        }
      });
 
      console.log('[AutoLayout] Final positions', next.map((n) => ({ id: n.id, pos: n.position, parentId: n.parentId })));
      console.log('%c[AutoLayout] Complete', 'color: lightgreen; font-weight: bold');
 
      return next;
    });

    // Automatically center view after tidying up with a brief delay
    setTimeout(() => {
      console.log('[AutoLayout] Auto-centering view after tidy');
      handleCenterView();
    }, 400);
  };

  const handleCenterView = () => {
    if (rfInstance) {
      // Close inspector panel if it's open (it will collapse but stay visible)
      if (selectedNode) {
        setSelectedNode(null);
        // Also clear selection state in socket
        socket.send(JSON.stringify({ type: 'selection', nodeId: null }));
      }
      
      // Center view accounting for collapsed inspector
      rfInstance.fitView({ 
        padding: 0.15,
        duration: 600 
      });
    }
  };

  const onNodesChange: (changes: NodeChange[]) => void = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes]
  );
  const onEdgesChange: (changes: EdgeChange[]) => void = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );

  const handleNodeClick = (_: React.MouseEvent, node: Node) => {
    if (!requireWallet()) return;
    if (node.type === 'group') {
      const gData = node.data as { visibility?: string; owner?: string };
      if (
        gData.visibility === 'private' &&
        gData.owner &&
        address &&
        gData.owner.toLowerCase() !== address.toLowerCase()
      ) {
        // Show helpful message when non-owner tries to interact with private space
        toast('This is a private space. Only the creator can view and edit its contents.', {
          duration: 3000,
          icon: '🔒'
        });
        return; // non-owner cannot inspect private space
      }
    }
    setSelectedNode(node);
    socket.send(JSON.stringify({ type: 'selection', nodeId: node.id }));
  };

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  const hasWallet = !!address;

  return (
		<div className="flex h-screen bg-gray-800 text-white">
			<div className="flex-1 h-screen relative">
				<div className="absolute top-4 left-4 z-10 flex items-center space-x-4">
					<div className="flex items-center space-x-2 bg-gray-700 p-2 rounded-lg">
						<div ref={menuRef} className="relative">
							<button
								className="flex items-center justify-center w-8 h-8 transition-transform duration-200 focus:ring-2 focus:ring-blue-300 rounded"
								onClick={() => setShowMenu((prev) => !prev)}
								tabIndex={0}
								aria-label={`${showMenu ? 'Close' : 'Open'} navigation menu`}
								aria-expanded={showMenu}
							>
								<div className={`flex flex-col space-y-1 transition-transform duration-300 ${showMenu ? 'rotate-90' : ''}`}>
									<div className={`w-5 h-0.5 bg-white transition-all duration-300 ${showMenu ? 'rotate-45 translate-y-1.5' : ''}`}></div>
									<div className={`w-5 h-0.5 bg-white transition-all duration-300 ${showMenu ? 'opacity-0' : ''}`}></div>
									<div className={`w-5 h-0.5 bg-white transition-all duration-300 ${showMenu ? '-rotate-45 -translate-y-1.5' : ''}`}></div>
								</div>
							</button>
							{showMenu && (
								<ul className="absolute top-full left-0 mt-2 bg-gray-800 rounded-lg shadow-lg p-2 w-48">
									<li>
										<a
											href="#"
											onClick={() => setShowWelcome(true)}
											className="block px-4 py-2 hover:bg-gray-700 rounded"
										>
											Help
										</a>
									</li>
									<li>
										<a
											href="https://thegraph.com"
											target="_blank"
											rel="noopener noreferrer"
											className="block px-4 py-2 hover:bg-gray-700 rounded"
										>
											The Graph
										</a>
									</li>
									<li>
										<a
											href="https://github.com/yanivtal/graph-improvement-proposals/blob/new-ops/grcs/0020-knowledge-graph.md"
											target="_blank"
											rel="noopener noreferrer"
											className="block px-4 py-2 hover:bg-gray-700 rounded"
										>
											GRC-20 Spec
										</a>
									</li>
									<li>
										<a
											href="https://github.com/graphprotocol/hypergraph"
											target="_blank"
											rel="noopener noreferrer"
											className="block px-4 py-2 hover:bg-gray-700 rounded"
										>
											Hypergraph Repo
										</a>
									</li>
								</ul>
							)}
						</div>
						<button
							onClick={toggleMode}
							className="flex items-center font-mono text-sm bg-gray-800 rounded-full cursor-pointer select-none p-1 focus:ring-2 focus:ring-blue-300 transition-all duration-200"
							tabIndex={0}
							aria-label={`Switch to ${isDevMode ? 'Normie' : 'Dev'} mode`}
						>
							<div
								className={`px-3 py-1 rounded-full transition-colors duration-300 ${
									!isDevMode ? "bg-blue-600 text-white" : "text-gray-400"
								}`}
							>
								Normie Mode
							</div>
							<div
								className={`px-3 py-1 rounded-full transition-colors duration-300 ${
									isDevMode ? "bg-green-600 text-white" : "text-gray-400"
								}`}
							>
								Dev Mode
							</div>
						</button>

						<div className="flex items-center space-x-2">
							<span className="font-mono text-lg">{terms.knowledgeGraph}</span>
							<span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 rounded-full border border-orange-200 dark:border-orange-700/50">
								BETA
							</span>
						</div>
						<span className="font-mono text-lg text-gray-400">/</span>
						<Image src="/globe.svg" alt="Globe" width={24} height={24} />
						<input
							type="date"
							value={selectedDate}
							onChange={(e) => setSelectedDate(e.target.value)}
							className="bg-gray-600 border border-gray-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-200 rounded px-2 py-1 text-sm transition-all duration-200"
							data-tooltip-id="kg-node-tip"
							data-tooltip-content={`Select a date to view the ${terms.knowledgeGraph} for that day. \n\n As this app is multiplayer, you can see how daily collaborative knowledge graphs are built over time.`}
							tabIndex={0}
							aria-label="Select date for knowledge graph"
						/>
					</div>

					<button
						onClick={handleAddNode}
						className="bg-purple-500 hover:bg-purple-600 focus:bg-purple-600 focus:ring-2 focus:ring-purple-300 text-white font-bold py-2 px-4 rounded transition-all duration-200"
						data-tooltip-id="kg-node-tip"
						data-tooltip-content="Create Topic"
						tabIndex={0}
						aria-label="Create Topic"
					>
						+
					</button>

					<button
						onClick={handleAddSpace}
						className="bg-blue-500 hover:bg-blue-600 focus:bg-blue-600 focus:ring-2 focus:ring-blue-300 text-white font-bold py-2 px-4 rounded transition-all duration-200"
						data-tooltip-id="kg-node-tip"
						data-tooltip-content="Create Space"
						tabIndex={0}
						aria-label="Create Space"
					>
						□
					</button>

					<button
						onClick={handleAutoLayout}
						className="bg-gray-500 hover:bg-gray-600 focus:bg-gray-600 focus:ring-2 focus:ring-gray-300 text-white font-bold py-2 px-4 rounded transition-all duration-200"
						data-tooltip-id="kg-node-tip"
						data-tooltip-content="Tidy up layout"
						tabIndex={0}
						aria-label="Tidy up layout"
					>
						⇆
					</button>

					<button
						onClick={handleCenterView}
						className="bg-gray-500 hover:bg-gray-600 focus:bg-gray-600 focus:ring-2 focus:ring-gray-300 text-white font-bold py-2 px-4 rounded transition-all duration-200"
						data-tooltip-id="kg-node-tip"
						data-tooltip-content="Center view"
						tabIndex={0}
						aria-label="Center view"
					>
						☉
					</button>

					<div className="flex items-center space-x-2">
						{presentUsers
							.filter((u) => u.address !== address)
							.map((user) => (
								<Avatar key={user.id} address={user.address} />
							))}
					</div>
				</div>

				<div className="absolute top-4 right-16 z-10 flex flex-col items-end space-y-2">
					{/* Private Space Ownership Indicator */}
					{selectedNode && selectedNode.type === 'group' && selectedNode.data?.visibility === 'private' && 
					 selectedNode.data?.owner && address && selectedNode.data.owner.toLowerCase() === address.toLowerCase() && (
						<div className="bg-gradient-to-r from-green-600/90 to-emerald-600/90 backdrop-blur-sm p-3 rounded-lg border border-green-400/30 shadow-lg">
							<div className="flex items-center space-x-2">
								<div className="flex items-center space-x-1">
									<span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
									<span className="text-green-100 text-sm font-semibold">Your Private Space</span>
								</div>
								<span className="text-xl">🔒</span>
							</div>
							<div className="text-green-200 text-xs mt-1">
								Only you can view and edit this space&apos;s contents
							</div>
						</div>
					)}

					{/* Wallet Connection Status */}
					<div className="flex items-center space-x-2">
						{connecting ? (
							<div className="flex items-center space-x-2 bg-gray-700 p-2 rounded-lg">
								<span className="text-sm font-mono">Loading...</span>
							</div>
						) : address ? (
							<div className="flex items-center space-x-2 bg-gray-700 p-2 rounded-lg">
								<span className="flex items-center space-x-2">
									<span
										className="w-3 h-3 rounded-full bg-green-500 animate-pulse"
										style={{ 
											animation: 'gentle-flash 2s ease-in-out infinite',
											boxShadow: '0 0 8px rgba(34, 197, 94, 0.6)'
										}}
									/>
									<span className="text-sm font-mono">{`${address.slice(
										0,
										6
									)}...${address.slice(-4)}`}</span>
								</span>
								<button
									onClick={() => disconnect()}
									className="bg-red-500 hover:bg-red-600 focus:bg-red-600 focus:ring-2 focus:ring-red-300 text-white font-bold py-1 px-2 rounded text-xs transition-all duration-200"
									tabIndex={0}
									aria-label="Disconnect wallet"
								>
									Disconnect
								</button>
							</div>
						) : (
							<div className="flex items-center space-x-2">
								{connectors.map((connector) => (
									<button
										key={connector.uid}
										onClick={() => connect({ connector })}
										className="bg-blue-500 hover:bg-blue-600 focus:bg-blue-600 focus:ring-2 focus:ring-blue-300 text-white font-bold py-2 px-4 rounded transition-all duration-200"
										tabIndex={0}
										aria-label={`Connect with ${connector.name}`}
									>
										{connector.name}
									</button>
								))}
							</div>
						)}
					</div>
				</div>

				{!hasWallet && (
					<div className="absolute inset-0 z-30 flex items-center justify-center backdrop-blur-xs">
						<div className="bg-gray-800/90 rounded-lg px-6 py-4 flex flex-col items-center space-y-4">
							<p className="text-white text-lg font-medium text-center">
								The Knowledge Graph Visualizer
							</p>

							<button
								onClick={() =>
									connectors[0] && connect({ connector: connectors[0] })
								}
								className="bg-blue-500 hover:bg-blue-600 focus:bg-blue-600 focus:ring-2 focus:ring-blue-300 text-white font-bold py-2 px-4 rounded transition-all duration-200"
								tabIndex={0}
								aria-label="Connect with MetaMask"
							>
								Connect with MetaMask
							</button>
						</div>
					</div>
				)}

				{/* Default edge styling */}
				<ReactFlow
					onInit={setRfInstance}
					deleteKeyCode={null}
					defaultEdgeOptions={{
						type: "smoothstep",
						markerEnd: {
							type: MarkerType.ArrowClosed,
							width: 30,
							height: 30,
							color: "#fff",
						},
						style: { strokeWidth: 2, stroke: "#AAA" },
					}}
					panOnDrag={hasWallet}
					panOnScroll={hasWallet}
					zoomOnScroll={hasWallet}
					zoomOnPinch={hasWallet}
					nodes={nodes}
					edges={edges}
					onNodesChange={onNodesChange}
					onEdgesChange={onEdgesChange}
					onConnect={onConnect}
					onPaneClick={handlePaneClick}
					onNodeClick={handleNodeClick}
					onNodeDragStop={onNodeDragStop}
					nodeTypes={nodeTypes}
					connectionLineType={ConnectionLineType.SmoothStep}
					fitView
					className={`bg-gray-900 ${
						showWelcome || (nodes.length === 0 && showWelcome !== false)
							? "pointer-events-none opacity-10"
							: ""
					}`}
				>
					<Background />
					<Controls />
				</ReactFlow>

				<Inspector
					selectedNode={selectedNode}
					onSave={(nodeId, data) => updateNodeData.mutate({ nodeId, data })}
					onDelete={(nodeId, isRelation) => {
						const node = nodes.find((n) => n.id === nodeId);
						const isSpace = node?.type === "group";
						const itemType = isSpace
							? "Space"
							: isRelation
							? "Relation"
							: "Topic";
						const itemName = node?.data?.label || "Untitled";

						const confirmMessage = `Are you sure you want to delete this ${itemType}? "${itemName}" will be permanently removed.`;

						if (window.confirm(confirmMessage)) {
							if (isRelation) {
								deleteRelation.mutate({ id: nodeId });
							} else {
								deleteEntity.mutate({ nodeId });
							}
						}
					}}
				/>

				{showChecklist && (
					<OnboardingChecklist
						steps={ONBOARDING_STEPS.map(step => ({
							...step,
							isCompleted: completedSteps.includes(step.id)
						}))}
						onDismiss={dismissChecklist}
						onTryAgain={resetChecklist}
					/>
				)}

				{/* Bottom Right Button Layout - Well arranged according to design principles */}
				{/* 
					Layout from right to left:
					1. Inspector panel (always visible, collapsible)
					2. Debug drawer button (right-20)
					3. Todo list toggle (right-[196px] hidden, right-[212px] shown) - moved 100px farther left
					This creates proper visual hierarchy and spacing
				*/}
				<button
					onClick={toggleChecklist}
					className={`fixed z-30 p-3 rounded-full shadow-lg ${
						showChecklist 
							? 'bottom-4 right-[212px] bg-gray-600 text-gray-300' 
							: 'bottom-4 right-[196px] bg-blue-600 text-white'
					}`}
					title={showChecklist ? 'Hide getting started guide' : 'Show getting started guide'}
					tabIndex={0}
					aria-label={showChecklist ? 'Hide getting started guide' : 'Show getting started guide'}
				>
					{showChecklist ? <X size={20} /> : <HelpCircle size={20} />}
				</button>

				<Tooltip
					id="kg-node-tip"
					place="bottom"
					className="z-50 max-w-xs whitespace-pre-line"
				/>
			</div>

			{showWelcome && (
				<div 
					className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm"
					onClick={() => setShowWelcome(false)}
				>
					<div 
						className="bg-gray-900/95 p-8 rounded-xl text-center space-y-6 max-w-4xl mx-4 shadow-2xl border border-gray-700"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="space-y-3">
							<div className="flex items-center justify-center space-x-3">
								<h2 className="text-3xl font-extrabold text-white">
									Welcome to the {terms.knowledgeGraph}
								</h2>
								<span className="inline-flex items-center px-3 py-1 text-sm font-semibold bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 rounded-full border border-orange-200 dark:border-orange-700/50 shadow-sm">
									BETA
								</span>
							</div>
							<p className="text-gray-300 text-lg leading-relaxed">
								Learn knowledge graphs by building them collaboratively!
							</p>
							
							{/* Mode Toggle */}
							<div className="flex justify-center pt-2">
								<div
									onClick={toggleMode}
									className="flex items-center font-mono text-sm bg-gray-800 rounded-full cursor-pointer select-none p-1"
								>
									<div
										className={`px-3 py-1 rounded-full transition-colors duration-300 ${
											!isDevMode ? "bg-blue-600 text-white" : "text-gray-400"
										}`}
									>
										Normie Mode
									</div>
									<div
										className={`px-3 py-1 rounded-full transition-colors duration-300 ${
											isDevMode ? "bg-green-600 text-white" : "text-gray-400"
										}`}
									>
										Dev Mode
									</div>
								</div>
							</div>
						</div>

						<div className="grid md:grid-cols-2 gap-6 text-left">
							<div className="space-y-3">
								<h3 className="text-lg font-semibold text-white border-b border-gray-600 pb-2">
									How to Use
								</h3>
								<ul className="text-sm text-gray-300 space-y-2">
									<li className="flex items-start space-x-2">
										<span className="text-blue-400 font-bold">+</span>
										<span>
											Create a <span className="font-semibold text-purple-400">{terms.topic}</span> to represent key ideas
										</span>
									</li>
									<li className="flex items-start space-x-2">
										<span className="text-blue-400 font-bold">□</span>
										<span>
											Group{" "}
											<span className="font-semibold text-purple-400">
												{terms.topics}
											</span>{" "}
											<span>
												into public or private{" "}
												<span className="font-bold text-blue-400">Spaces</span>
											</span>{" "}
											for organization
										</span>
									</li>
									<li className="flex items-start space-x-2">
										<span className="text-orange-400">🔗</span>
										<span>
											Draw{" "}
											<span className="font-bold text-orange-400">
												{terms.relations}
											</span>{" "}
											between{" "}
											<span className="font-bold text-purple-400">{terms.topics}</span>{" "}
											to show how different ideas connect
										</span>
									</li>
								</ul>
							</div>

							<div className="space-y-3">
								<h3 className="text-lg font-semibold text-white border-b border-gray-600 pb-2">
									About This App
								</h3>
								<ul className="text-sm text-gray-300 space-y-2">
				
									<li>
										• Multiple users can connect wallets and build together in
										real-time
									</li>
									<li>• Data is ephemeral and resets daily. Go play!</li>
								</ul>
							</div>
						</div>

						{/* Key Insight - Full Width */}
						<div className="mt-6 p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-400/20 rounded-lg">
							<div className="flex items-start space-x-4">
								<span className="text-3xl">✨</span>
								<div className="flex-1">
									<div className="text-blue-300 font-semibold text-sm uppercase tracking-wide mb-2">
										Key Insight
									</div>
									<div className="text-white font-medium text-lg leading-relaxed">
										When two <span className="font-semibold text-purple-400">{terms.topics}</span> are connected by a relationship, we now have{" "}
										<span className="text-blue-300 font-bold">Knowledge</span>{" "}
										in our knowledge graph!
									</div>
								</div>
							</div>
						</div>

						<div className="pt-4 border-t border-gray-700">
							<p className="text-sm text-gray-400 mb-4">
								To learn more, see the{" "}
								<a
									href="https://github.com/yanivtal/graph-improvement-proposals/blob/new-ops/grcs/0020-knowledge-graph.md"
									target="_blank"
									rel="noopener noreferrer"
									className="text-blue-400 hover:text-blue-300 underline transition-colors"
								>
									GRC-20 spec
								</a>{" "}
								and The Graph&apos;s knowledge graph{" "}
								<a
									href="https://thegraph.com/blog/grc20-knowledge-graph/"
									target="_blank"
									rel="noopener noreferrer"
									className="text-blue-400 hover:text-blue-300 underline transition-colors"
								>
									announcement
								</a>
							</p>
							<button
								onClick={() => setShowWelcome(false)}
								className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-8 rounded-lg transition-colors duration-200 shadow-lg"
							>
								Start Building
							</button>
							<p className="text-xs text-gray-500 mt-4">
								Built by{" "}
								<a
									href="https://github.com/marcusrein"
									target="_blank"
									rel="noopener noreferrer"
									className="text-gray-400 hover:text-gray-300 underline transition-colors"
								>
									Marcus Rein
								</a>
							</p>
						</div>
					</div>
				</div>
			)}

			<DeleteConfirmModal
				isOpen={showDeleteModal}
				onClose={() => {
					setShowDeleteModal(false);
					nodeToDeleteRef.current = null;
				}}
				onConfirm={handleConfirmDelete}
				itemType={
					nodeToDeleteRef.current?.type === 'group'
						? 'Space'
						: /^\d+$/.test(nodeToDeleteRef.current?.id || '')
						? 'Relation'
						: isDevMode
						? 'Entity'
						: 'Topic'
				}
				itemName={nodeToDeleteRef.current?.data?.label || 'Untitled'}
			/>
		</div>
	);
}