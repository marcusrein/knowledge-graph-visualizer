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
} from 'reactflow';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { usePartySocket } from 'partysocket/react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import 'reactflow/dist/style.css';
import * as dagre from 'dagre';

import RelationNode from '@/components/RelationNode';
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

  const updatePosition = useMutation({
    mutationFn: async (payload: { nodeId: string; x: number; y: number }) => {
      const res = await fetch('/api/entities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to update position');
    },
  });

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
    mutationFn: async ({ nodeId, data }: { nodeId: string; data: { label?: string; properties?: Record<string, string> } }) => {
      const isRelation = isNumeric(nodeId);
      const endpoint = isRelation ? '/api/relations' : '/api/entities';
      const payload = isRelation
        ? { id: nodeId, relationType: data.label, properties: data.properties }
        : { nodeId: nodeId, label: data.label, properties: data.properties };

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
                ...n.data,
                ...variables.data,
                // Ensure label is updated from the server response if available
                label: data.label || data.relationType || n.data.label,
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
    queryKey: ['entities', selectedDate],
    queryFn: async () => {
      const res = await fetch(`/api/entities?date=${selectedDate}`);
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
      type: 'knowledge' | 'category';
      x: number;
      y: number;
      properties: Record<string, unknown>;
      date: string;
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
      const newNode = {
        // Use the same nodeId we sent to the server to keep client and server in sync
        id: variables.nodeId,
        position: { x: 200, y: 150 },
        data: { label: variables.label || 'New Topic' },
        style: {
          backgroundColor: '#fff',
          color: '#000',
          border: '1px solid #ddd',
        },
      };
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
      const entityNodes = entitiesQuery.data.map((e: { nodeId: string; label: string; properties: Record<string, string>; x: number; y: number; }) => {
        const selection = selections.find(s => s.nodeId === e.nodeId);
        const hasWallet = !!address;
        return {
          id: e.nodeId,
          type: 'topic',
          data: { label: e.label, properties: e.properties, selectingAddress: selection ? selection.address : null },
          position: {
            x: e.x ?? Math.random() * 400,
            y: e.y ?? Math.random() * 400,
          },
          draggable: hasWallet,
          style: selection ? {
            borderColor: addressToColor(selection.address),
            borderWidth: 3,
            boxShadow: `0 0 0 3px ${addressToColor(selection.address)}, 0 0 10px ${addressToColor(selection.address)}`,
          } : undefined
        };
      });

      const relationNodes = relationsQuery.data.map((r: { id: number; relationType: string; properties: Record<string, string>; x: number; y: number; }) => {
        const selection = selections.find(s => s.nodeId === String(r.id));
        const hasWallet = !!address;
        return {
          id: String(r.id),
          type: 'relation',
          data: {
            label: r.relationType,
            properties: r.properties,
            selectionColor: selection ? addressToColor(selection.address) : null,
            selectingAddress: selection ? selection.address : null
          },
          position: {
            x: r.x ?? Math.random() * 400,
            y: r.y ?? Math.random() * 400,
          },
          draggable: hasWallet,
          style: selection ? {
            borderColor: addressToColor(selection.address),
            borderWidth: 3,
            boxShadow: `0 0 0 3px ${addressToColor(selection.address)}, 0 0 10px ${addressToColor(selection.address)}`,
          } : undefined
        };
      });

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

      setNodes([...entityNodes, ...relationNodes]);
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
    // Generate a unique client-side identifier for the new topic
    const nodeId = crypto.randomUUID();

    addEntity.mutate({
      nodeId, // required by the API
      label: 'New Topic',
      type: 'knowledge',
      x: 200,
      y: 150,
      properties: {},
      date: selectedDate,
    });
  };

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (!requireWallet()) return;
      socket.send(JSON.stringify({
        type: 'node-move',
        payload: { nodeId: node.id, position: node.position },
      }));

      // Persist position change to the database
      if (isNumeric(node.id)) {
        updateRelationPosition.mutate({
          id: node.id,
          x: node.position.x,
          y: node.position.y,
        });
      } else {
        updatePosition.mutate({
          nodeId: node.id,
          x: node.position.x,
          y: node.position.y,
        });
      }
    },
    [socket, updatePosition, updateRelationPosition, requireWallet]
  );

  const handlePaneClick = () => {
    setSelectedNode(null);
    socket.send(JSON.stringify({ type: 'selection', nodeId: null }));
  };

  // --- Auto-layout using Dagre ---
  const handleAutoLayout = () => {
    if (!requireWallet()) return;
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 100 });

    // give each node a size; if custom style width exists use it
    nodes.forEach((node) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const width = (node.style as any)?.width || 180;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const height = (node.style as any)?.height || 60;
      g.setNode(node.id, { width, height });
    });

    edges.forEach((edge) => {
      g.setEdge(edge.source, edge.target);
    });

    dagre.layout(g);

    setNodes((nds) =>
      nds.map((node) => {
        const n = g.node(node.id);
        return {
          ...node,
          position: { x: n.x, y: n.y },
        };
      })
    );
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
            data-tooltip-content={terms.createTopic}
          >
            +
          </button>

          <button
            onClick={handleAutoLayout}
            className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
            data-tooltip-id="kg-node-tip"
            data-tooltip-content="Tidy up layout"
          >
            ⇆
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
          className="bg-gray-900"
        >
          <Background />
          <Controls />
        </ReactFlow>

        {(showWelcome || (nodes.length === 0 && showWelcome !== false)) && (
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <div className="text-center bg-gray-800 bg-opacity-80 p-8 rounded-lg max-w-lg pointer-events-auto relative">
              <button
                className="absolute -top-3 -right-3 w-8 h-8 flex items-center justify-center bg-gray-700 hover:bg-gray-600 rounded-full text-gray-300 hover:text-white"
                onClick={() => {
                  setShowWelcome(false);
                }}
              >
                &times;
              </button>
              <h2 className="text-2xl font-bold mb-2">Welcome to the Daily {terms.knowledgeGraph} Visualizer</h2>
              <p className="text-gray-400 mb-6">
                This is a mulitiplayer visualizer that demonstrates how {terms.knowledgeGraph}s work! Use it to map ideas, projects, and people, and see how other people connect with your ideas in real time.
              </p>
              <p className="text-gray-400 mb-6">
                The data is cleared every day at midnight UTC as this is simply demonstrating how {terms.knowledgeGraph}s work.
              </p>
              <p className="text-gray-400 mb-6 font-bold">
                To get started, create a new {terms.topic}!
              </p>
              <button
                onClick={handleAddNode}
                className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
              >
                {terms.createTopic}
              </button>
             
            </div>
          </div>
        )}
      </div>
      <Inspector
        selectedNode={selectedNode}
        onSave={(nodeId, data) => {
          if (!requireWallet()) return;
          updateNodeData.mutate({ nodeId, data })
        }}
        onDelete={(id: string, isRelation: boolean) => {
          if (!requireWallet()) return;
          if (isRelation) {
            deleteRelation.mutate({ id });
          } else {
            deleteEntity.mutate({ nodeId: id });
          }
        }}
        onClose={() => setSelectedNode(null)}
      />
      {showChecklist && (
        <OnboardingChecklist
          steps={ONBOARDING_STEPS.map(step => ({
            ...step,
            isCompleted: completedSteps.includes(step.id),
          }))}
          onDismiss={dismissChecklist}
        />
      )}
      {/* Global tooltip for nodes */}
      <Tooltip id="kg-node-tip" className="z-50 max-w-xs" />
    </div>
  );
}
