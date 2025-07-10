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
import 'reactflow/dist/style.css';
import * as dagre from 'dagre';

import RelationNode from '@/components/RelationNode';
import SpaceNode from '@/components/SpaceNode';
import Inspector from '@/components/Inspector';
import Avatar from '@/components/Avatar';
import OnboardingChecklist from '@/components/OnboardingChecklist';
import TopicNode from '@/components/TopicNode';
import { Tooltip } from 'react-tooltip';
import { useTerminology } from '@/lib/TerminologyContext';

interface PresentUser {
  id: string;
  address: string;
}

interface Selection {
  address: string;
  nodeId: string | null;
}

const nodeTypes = {
  relation: RelationNode,
  topic: TopicNode,
  group: SpaceNode,
};

// A more robust check for numeric strings (for relation IDs)
function isNumeric(str: string) {
  if (typeof str !== 'string') return false;
  return /^\d+$/.test(str);
}

const ONBOARDING_STEPS = [
  {
    id: 'create-topic',
    title: 'Create your first Topic',
    description: 'Click the + button in the top left to create your first topic.',
    isCompleted: false,
  },
  {
    id: 'name-topic',
    title: 'Name your Topic',
    description: 'Give your new topic a name in the inspector on the right.',
    isCompleted: false,
  },
  {
    id: 'create-connection',
    title: 'Connect two topics',
    description: 'Create another topic and connect it to the first one by dragging from one node to another.',
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


  const socket = usePartySocket({
    host: process.env.NEXT_PUBLIC_PARTY_HOST || 'localhost:1999',
    room: selectedDate,
    onMessage(event) {
      const message = JSON.parse(event.data);
      if (message.type === 'sync') {
        setPresentUsers(message.users);
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
    },
  });

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
    // Show checklist if not all steps are completed and it hasn't been dismissed
    if (completed && JSON.parse(completed).length === ONBOARDING_STEPS.length) {
      setShowChecklist(false);
    } else if (!hide) {
      setShowChecklist(true);
    }
    setConnecting(false);
  }, []);

  const dismissChecklist = () => {
    setShowChecklist(false);
    localStorage.setItem('kg_hide_checklist', '1');
  };

  const completeStep = (stepId: string) => {
    setCompletedSteps(prev => {
      if (prev.includes(stepId)) return prev;
      const newCompletedSteps = [...prev, stepId];
      localStorage.setItem('kg_completed_steps', JSON.stringify(newCompletedSteps));
      if (newCompletedSteps.length === ONBOARDING_STEPS.length) {
        setTimeout(() => setShowChecklist(false), 2000); // Hide after a delay
      }
      return newCompletedSteps;
    });
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
        ? { id: nodeId, relationType: data.label, properties: data.properties }
        : {
            nodeId: nodeId,
            label: data.label,
            properties: data.properties,
            visibility: data.visibility,
          };

      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to save node data');
      return res.json();
    },
    onSuccess: (data, variables) => {
      // Check if a non-default name has been set
      if (variables.data.label && variables.data.label !== 'New Topic') {
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
    },
    onSuccess: (data, variables) => {
      const deletedNodeId = variables.nodeId;

      // First update edges and compute connected relation IDs based on the latest edge state
      setEdges((prevEdges) => {
        // Remove only edges connected to the deleted entity
        const filtered = prevEdges.filter(
          (e) => e.source !== deletedNodeId && e.target !== deletedNodeId
        );

        // Update nodes state in the same callback to avoid stale state
        setNodes((prevNodes) => prevNodes.filter((n) => n.id !== deletedNodeId));

        return filtered;
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
        type: variables.type,
      };

      if (variables.type === 'group') {
        newNode.style = {
          width: 400,
          height: 300,
          backgroundColor: 'rgba(208, 192, 247, 0.2)',
          borderColor: '#D0C0F7',
        };
        newNode.type = 'group';
        // Provide owner and visibility immediately so Inspector can allow editing
        newNode.data = {
          ...newNode.data,
          owner: variables.userAddress,
          visibility: variables.visibility ?? 'public',
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
      return res.json();
    },
    onSuccess: () => {
      if (nodes.filter(n => !isNumeric(n.id)).length > 1) {
        completeStep('create-connection');
      }
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
        // Build new nodes preserving positions
        const positionMap = new Map(nodes.map(n => [n.id, n.position]));

        // --- first pass: Spaces (groups) ---
        const groupEntities = entitiesQuery.data.filter((e: { type: string }) => e.type === 'group');
        const groupIds = new Set(groupEntities.map((g: { nodeId: string }) => g.nodeId));

        const groupNodes = groupEntities.map((e: { nodeId: string; label: string; properties: Record<string, string>; x: number; y: number; type: string; userAddress: string; visibility: string; width?: number; height?: number; }) => {
          const selection = selections.find(s => s.nodeId === e.nodeId);
          const isOwner = Boolean(e.userAddress && address && e.userAddress.toLowerCase() === address.toLowerCase());
          const maskedLabel = e.visibility === 'private' && !isOwner ? `${e.userAddress?.slice(0,6)}...${e.userAddress?.slice(-4)}` : e.label;
          
          const handleResize = (width: number, height: number) => {
            updateEntityPatch.mutate({
              nodeId: e.nodeId,
              width,
              height,
            });
            // Update the node style immediately for visual feedback
            setNodes((nds) =>
              nds.map((n) =>
                n.id === e.nodeId
                  ? { ...n, style: { ...n.style, width, height } }
                  : n
              )
            );
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

          if (selection) {
            node.style = {
              ...node.style,
              borderColor: addressToColor(selection.address),
              borderWidth: 3,
              boxShadow: `0 0 0 3px ${addressToColor(selection.address)}, 0 0 10px ${addressToColor(selection.address)}`,
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
          const node: Node = {
            id: e.nodeId,
            type: 'topic',
            data: { label: e.label, properties: e.properties, selectingAddress: selection ? selection.address : null, owner: e.userAddress, visibility: e.visibility },
            position: positionMap.get(e.nodeId) ?? { x: e.x ?? Math.random() * 400, y: e.y ?? Math.random() * 400 },
            draggable: hasWallet,
          };

          if (e.parentId && groupIds.has(e.parentId)) {
            const gInfo = groupInfoMap.get(e.parentId)!;
            const isOwnerOfGroup = gInfo.owner && address && gInfo.owner.toLowerCase() === address.toLowerCase();
            if (gInfo.visibility === 'private' && !isOwnerOfGroup) {
              return null; // skip topics hidden inside private space
            }
            node.parentId = e.parentId;
          }

          if (selection) {
            node.style = {
              ...node.style,
              borderColor: addressToColor(selection.address),
              borderWidth: 3,
              boxShadow: `0 0 0 3px ${addressToColor(selection.address)}, 0 0 10px ${addressToColor(selection.address)}`,
            };
          }

          return node;
        });

        const relationNodes = relationsQuery.data.map((r: { id: number; relationType: string; properties: Record<string, string>; x: number; y: number; }) => {
          const idStr = String(r.id);
          const selection = selections.find(s => s.nodeId === idStr);
          const hasWallet = !!address;

          // Determine if relation visually inside any space
          let relPos = positionMap.get(idStr) ?? { x: r.x ?? Math.random() * 400, y: r.y ?? Math.random() * 400 };
          let parentId: string | undefined = undefined;
          for (const sp of groupNodes) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sW = ((sp.style as any)?.width ?? 400) as number;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sH = ((sp.style as any)?.height ?? 300) as number;
            const withinX = relPos.x >= sp.position.x && relPos.x <= sp.position.x + sW;
            const withinY = relPos.y >= sp.position.y && relPos.y <= sp.position.y + sH;
            if (withinX && withinY) {
              parentId = sp.id;
              relPos = { x: relPos.x - sp.position.x, y: relPos.y - sp.position.y };
              break;
            }
          }

          return {
            id: idStr,
            type: 'relation',
            parentId,
            data: {
              label: r.relationType,
              properties: r.properties,
              selectionColor: selection ? addressToColor(selection.address) : null,
              selectingAddress: selection ? selection.address : null
            },
            position: relPos,
            draggable: hasWallet,
            style: selection ? {
              borderColor: addressToColor(selection.address),
              borderWidth: 3,
              boxShadow: `0 0 0 3px ${addressToColor(selection.address)}, 0 0 10px ${addressToColor(selection.address)}`,
            } : undefined
          };
        });

        return [...groupNodes, ...topicNodes.filter(Boolean), ...relationNodes];
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

      setNodes(buildNodes());
      setEdges(newEdges);
    }
  }, [entitiesQuery.data, relationsQuery.data, linksQuery.data, selections, addressToColor]);

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

    // --- helper: find first non-overlapping spot ---
    const TOPIC_W = 180;
    const TOPIC_H = 60;
    const PADDING = 20;
    const STEP = 40; // grid step when scanning for space

    const doesOverlap = (x: number, y: number): boolean => {
      for (const n of nodes) {
        // Approximate dimensions
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nW = ((n.style as any)?.width ?? (n.type === 'group' ? 400 : TOPIC_W)) as number;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nH = ((n.style as any)?.height ?? (n.type === 'group' ? 300 : TOPIC_H)) as number;
        const overlapX = x + TOPIC_W + PADDING > n.position.x && n.position.x + nW + PADDING > x;
        const overlapY = y + TOPIC_H + PADDING > n.position.y && n.position.y + nH + PADDING > y;
        if (overlapX && overlapY) return true;
      }
      return false;
    };

    let posX = 50;
    let posY = 50;
    const MAX_RANGE = 2000; // search bounds
    while (doesOverlap(posX, posY) && posY < MAX_RANGE) {
      posX += STEP;
      if (posX > MAX_RANGE) {
        posX = 50;
        posY += STEP;
      }
    }

    const nodeId = crypto.randomUUID();

    addEntity.mutate({
      nodeId,
      label: 'New Topic',
      type: 'knowledge',
      x: posX,
      y: posY,
      properties: {},
      date: selectedDate,
      userAddress: address!,
    });
  };

  const handleAddSpace = () => {
    if (!requireWallet()) return;
    console.log('Creating a new space...');
    const nodeId = crypto.randomUUID();

    addEntity.mutate({
      nodeId,
      label: 'New Space',
      type: 'group',
      x: 200,
      y: 200,
      width: 400,
      height: 300,
      properties: {},
      date: selectedDate,
      userAddress: address!,
    });
  };

  const updateEntityPatch = useMutation({
    mutationFn: async (payload: { nodeId: string, x?: number, y?: number, parentId?: string | null, width?: number, height?: number }) => {
      await fetch('/api/entities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    },
  });

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (!requireWallet()) return;

      // Relation nodes remain global; no toast needed on simple drag.

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
        if (newParentId !== node.parentId) {
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
          if (newParentId) {
            const spaceNode = nodes.find((n) => n.id === newParentId);
            const spaceName = spaceNode?.data?.label || 'Space';
            toast.success(`Moved to ${spaceName}`);
          } else {
            toast.success('Removed from Space');
          }

          // skip the later patch below to avoid duplicate if we already handled
          return;
        }
      }

      // Broadcast movement to other clients
      socket.send(
        JSON.stringify({
          type: 'node-move',
          payload: {
            nodeId: node.id,
            position: node.position,
          },
        })
      );

      // Persist change to DB
      if (isNumeric(node.id)) {
        let relX = node.position.x;
        let relY = node.position.y;
        if (node.parentId) {
          const sp = nodes.find((n) => n.id === node.parentId);
          if (sp) {
            relX += sp.position.x;
            relY += sp.position.y;
          }
        }
        updateRelationPosition.mutate({
          id: node.id,
          x: relX,
          y: relY,
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
    [nodes, socket, updateEntityPatch, updateRelationPosition, requireWallet]
  );

  const handlePaneClick = () => {
    setSelectedNode(null);
    socket.send(JSON.stringify({ type: 'selection', nodeId: null }));
  };

  // --- Auto-layout using Dagre ---
  const handleAutoLayout = () => {
    if (!requireWallet()) return;

    // helper to run dagre on a subset and return new positions
    const runLayout = (
      subsetNodes: Node[],
      subsetEdges: Edge[],
      offsetX = 0,
      offsetY = 0
    ) => {
      const g = new dagre.graphlib.Graph();
      g.setDefaultEdgeLabel(() => ({}));
      g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 });

      subsetNodes.forEach((n) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = (n.style as any)?.width || 180;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const h = (n.style as any)?.height || 60;
        g.setNode(n.id, { width: w, height: h });
      });

      subsetEdges.forEach((e) => g.setEdge(e.source, e.target));

      dagre.layout(g);

      const posMap = new Map<string, { x: number; y: number }>();
      subsetNodes.forEach((n) => {
        const nodeWithPos = g.node(n.id);
        if (nodeWithPos) {
          posMap.set(n.id, { x: nodeWithPos.x + offsetX, y: nodeWithPos.y + offsetY });
        }
      });
      return posMap;
    };

    setNodes((curr) => {
      let next = [...curr];

      // 1) Global layout (nodes without parentId)
      const globalNodes = next.filter((n) => !n.parentId);
      const globalNodeIds = new Set(globalNodes.map((n) => n.id));
      const globalEdges = edges.filter(
        (e) => globalNodeIds.has(e.source.toString()) && globalNodeIds.has(e.target.toString())
      );
      const globalPos = runLayout(globalNodes, globalEdges);
      next = next.map((n) => (globalPos.has(n.id) ? { ...n, position: globalPos.get(n.id)! } : n));

      // 2) Per-space layout
      const spaces = next.filter((n) => n.type === 'group');
      spaces.forEach((space) => {
        const children = next.filter((c) => c.parentId === space.id);
        if (!children.length) return;

        const childIds = new Set(children.map((c) => c.id));
        const childEdges = edges.filter(
          (e) => childIds.has(e.source.toString()) && childIds.has(e.target.toString())
        );

        // Give kids some padding inside space (20px)
        const posInsideRaw = runLayout(children, childEdges, 20, 20);

        // Clamp to stay within Space bounds
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sWidth = ((space.style as any)?.width ?? 400) as number;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sHeight = ((space.style as any)?.height ?? 300) as number;

        const clamped = new Map<string, { x: number; y: number }>();
        children.forEach((child) => {
          const raw = posInsideRaw.get(child.id);
          if (!raw) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cW = ((child.style as any)?.width ?? 180) as number;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cH = ((child.style as any)?.height ?? 60) as number;
          const maxX = Math.max(0, sWidth - cW - 20);
          const maxY = Math.max(0, sHeight - cH - 20);
          clamped.set(child.id, {
            x: Math.min(Math.max(raw.x, 20), maxX),
            y: Math.min(Math.max(raw.y, 20), maxY),
          });
        });

        next = next.map((n) =>
          clamped.has(n.id) ? { ...n, position: clamped.get(n.id)! } : n
        );
      });

      return next;
    });
  };

  const handleCenterView = () => {
    if (rfInstance) {
      rfInstance.fitView({ padding: 0.2 });
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

  const handleNodeClick = (e: React.MouseEvent, node: Node) => {
    if (!requireWallet()) return;
    if (node.type === 'group') {
      const gData = node.data as { visibility?: string; owner?: string };
      if (
        gData.visibility === 'private' &&
        gData.owner &&
        address &&
        gData.owner.toLowerCase() !== address.toLowerCase()
      ) {
        return; // non-owner cannot inspect private space
      }
    }
    if (e.altKey) {
      // Toggle orientation property
      const currentOrientation = (node.data.properties?.orientation as string | undefined) ?? 'vertical';
      const newOrientation = currentOrientation === 'horizontal' ? 'vertical' : 'horizontal';
      const newProps = { ...(node.data.properties ?? {}), orientation: newOrientation };
      updateNodeData.mutate({ nodeId: node.id, data: { properties: newProps } });
      return; // don't open inspector on alt-click
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
                className="flex items-center space-x-2"
                onClick={() => setShowMenu(prev => !prev)}
              >
                <img src="/file.svg" alt="File" className="w-6 h-6" />
                <span className="text-sm font-mono">GRC-20</span>
                <span className="text-xs">▼</span>
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
            <div
              onClick={toggleMode}
              className="flex items-center font-mono text-sm bg-gray-800 rounded-full cursor-pointer select-none p-1"
            >
              <div
                className={`px-3 py-1 rounded-full transition-colors duration-300 ${
                  !isDevMode ? 'bg-blue-600 text-white' : 'text-gray-400'
                }`}
              >
                Normie Mode
              </div>
              <div
                className={`px-3 py-1 rounded-full transition-colors duration-300 ${
                  isDevMode ? 'bg-green-600 text-white' : 'text-gray-400'
                }`}
              >
                Dev Mode
              </div>
            </div>

            <span className="font-mono text-lg">{terms.knowledgeGraph}</span>
            <span className="font-mono text-lg text-gray-400">/</span>
            <img src="/globe.svg" alt="Globe" className="w-6 h-6" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-gray-600 border border-gray-500 rounded px-2 py-1 text-sm"
              data-tooltip-id="kg-node-tip"
              data-tooltip-content={`Select a date to view the ${terms.knowledgeGraph} for that day. It is ephemeral and resets daily.`}
            />
          </div>

          <button
            onClick={handleAddNode}
            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
            data-tooltip-id="kg-node-tip"
            data-tooltip-content="Create Topic"
          >
            +
          </button>

          <button
            onClick={handleAddSpace}
            className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-4 rounded"
            data-tooltip-id="kg-node-tip"
            data-tooltip-content="Create Space"
          >
            □
          </button>

          <button
            onClick={handleAutoLayout}
            className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
            data-tooltip-id="kg-node-tip"
            data-tooltip-content="Tidy up layout"
          >
            ⇆
          </button>

          <button
            onClick={handleCenterView}
            className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
            data-tooltip-id="kg-node-tip"
            data-tooltip-content="Center view"
          >
            ☉
          </button>

          <div className="flex items-center space-x-2">
            {presentUsers.filter(u => u.address !== address).map(user => (
              <Avatar key={user.id} address={user.address} />
            ))}
          </div>
        </div>

        <div className="absolute top-4 right-4 z-10 flex items-center space-x-2">
          {connecting ? (
            <div className="flex items-center space-x-2 bg-gray-700 p-2 rounded-lg">
              <span className="text-sm font-mono">Loading...</span>
            </div>
          ) : address ? (
            <div className="flex items-center space-x-2 bg-gray-700 p-2 rounded-lg">
              <span className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: addressToColor(address) }} />
                <span className="text-sm font-mono">{`${address.slice(0,6)}...${address.slice(-4)}`}</span>
              </span>
              <button
                onClick={() => disconnect()}
                className="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-2 rounded text-xs"
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
                  className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
                >
                  {connector.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {!hasWallet && (
          <div className="absolute inset-0 z-30 flex items-center justify-center backdrop-blur-xs">
            <div className="bg-gray-800/90 rounded-lg px-6 py-4 flex flex-col items-center space-y-4">
              <p className="text-white text-lg font-medium text-center">The Knowledge Graph Visualizer</p>

              <button
                onClick={() => connectors[0] && connect({ connector: connectors[0] })}
                className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
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
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed, width: 30, height: 30, color: '#fff' },
            style: { strokeWidth: 2, stroke: '#AAA' },
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
          className={`bg-gray-900 ${((showWelcome) || (nodes.length === 0 && showWelcome !== false)) ? 'pointer-events-none opacity-10' : ''}`}
        >
          <Background />
          <Controls />
        </ReactFlow>

        {selectedNode && (
          <Inspector
            selectedNode={selectedNode}
            onClose={() => {
              setSelectedNode(null);
              socket.send(JSON.stringify({ type: 'selection', nodeId: null }));
            }}
            onSave={(nodeId, data) => updateNodeData.mutate({ nodeId, data })}
            onDelete={(nodeId, isRelation) => {
              if (isRelation) {
                deleteRelation.mutate({ id: nodeId });
              } else {
                deleteEntity.mutate({ nodeId });
              }
            }}
          />
        )}

        {showChecklist && (
          <OnboardingChecklist
            steps={ONBOARDING_STEPS.map(step => ({ ...step, isCompleted: completedSteps.includes(step.id) }))}
            onDismiss={dismissChecklist}
          />
        )}

        <Tooltip id="kg-node-tip" place="bottom" />
      </div>

      {showWelcome && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80">
          <div className="bg-gray-800 p-8 rounded-lg text-center space-y-4 max-w-md">
            <h2 className="text-2xl font-bold">Welcome to the Knowledge Graph Visualizer</h2>
            <p className="text-gray-300">Create topics and connections to build your graph.</p>
            <button
              onClick={() => setShowWelcome(false)}
              className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
            >
              Get Started
            </button>
          </div>
        </div>
      )}
    </div>
  );
}