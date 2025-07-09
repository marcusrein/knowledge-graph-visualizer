"use client";

import { useState, useCallback, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import ReactFlow, {
  Background,
  Controls,
  addEdge,
  Connection,
  Edge,
  Node,
  OnConnectStartParams,
  applyNodeChanges,
  NodeChange,
  applyEdgeChanges,
  EdgeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import toast from 'react-hot-toast';
import usePartySocket from 'partysocket/react';

import RelationNode from '@/components/RelationNode';
import TopicNode from '@/components/TopicNode';
import Inspector from '@/components/Inspector';
import { useTerminology } from '@/lib/TerminologyContext';
import Avatar from '@/components/Avatar';
import OnboardingChecklist from '@/components/OnboardingChecklist';

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
  { id: 'create-topic', title: 'Create your first Topic' },
  { id: 'name-topic', title: 'Give your Topic a name' },
  { id: 'create-connection', title: 'Connect it to another Topic' },
];

export default function GraphPage() {
  const queryClient = useQueryClient();
  const { address } = useAccount();
  const { connect, connectors, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { getTerm } = useTerminology();

  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [presentUsers, setPresentUsers] = useState<PresentUser[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const today = format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [showIntro, setShowIntro] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [showChecklist, setShowChecklist] = useState(false);

  const socket = usePartySocket({
    host: process.env.NEXT_PUBLIC_PARTYKIT_HOST || '127.0.0.1:1999',
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
      if ((connectError as any).name === 'ConnectorNotFoundError') {
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
    mutationFn: async ({ nodeId, data }: { nodeId: string; data: { label?: string; properties?: any } }) => {
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
      if (!res.ok) {
        const error = await res.json();
        toast.error(error.error || 'Failed to delete relation');
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
      if (!res.ok) {
        const error = await res.json();
        toast.error(error.error || 'Failed to delete node');
        throw new Error(error.error || 'Failed to delete node');
      }
    },
    onSuccess: (data, variables) => {
      // Optimistically remove the node and its edges
      setNodes((nds) => nds.filter((n) => n.id !== variables.nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== variables.nodeId && e.target !== variables.nodeId));
      setSelectedNode(null);
      queryClient.invalidateQueries({ queryKey: ['entities', selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['relations', selectedDate] });
    },
  });

  // fetch nodes and edges
  const entitiesQuery = useQuery({
    queryKey: ['entities', selectedDate],
    queryFn: async () => {
      const res = await fetch(`/api/entities?date=${selectedDate}`);
      return (await res.json()) as any[];
    },
  });

  const relationsQuery = useQuery({
    queryKey: ['relations', selectedDate],
    queryFn: async () => {
      const res = await fetch(`/api/relations?date=${selectedDate}`);
      return (await res.json()) as any[];
    },
  });

  const addEntity = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.json();
    },
    onSuccess: (newNodeData) => {
      completeStep('create-topic');
      // Add the new node to the state optimistically
      const newNode: Node = {
        id: newNodeData.id,
        position: { x: 200, y: 150 },
        data: { label: newNodeData.label || 'New Topic' },
        type: 'topic', // Use our custom node type
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
    mutationFn: async (payload: any) => {
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
    },
  });

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  /* ---------- mutations ---------- */
  // map API to React Flow
  useEffect(() => {
    if (entitiesQuery.data && relationsQuery.data) {
      const entityNodes = entitiesQuery.data.map((e: any) => ({
        id: e.id,
        position: { x: e.x, y: e.y },
        data: { label: e.label, properties: e.properties },
        type: 'topic', // Assign the custom type to fetched nodes
        style: {
          backgroundColor: '#fff',
          color: '#000',
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '10px 15px',
        },
      }));

      const relationNodes = relationsQuery.data.map((r: any) => {
        const selection = selections.find(s => s.nodeId === String(r.id));
        return {
          id: String(r.id),
          type: 'relation',
          data: { label: r.relationType, properties: r.properties },
          position: {
            x: r.x ?? Math.random() * 400,
            y: r.y ?? Math.random() * 400,
          },
          draggable: true,
          style: selection ? {
            // custom nodes need a different way to style, we can do this later
          } : undefined
        };
      });

      const newEdges = relationsQuery.data.flatMap((r) => [
        {
          id: `${r.sourceId}-${r.id}`,
          source: r.sourceId,
          target: String(r.id),
          type: 'straight',
        },
        {
          id: `${r.id}-${r.targetId}`,
          source: String(r.id),
          target: r.targetId,
          type: 'straight',
        },
      ]);

      setNodes([...entityNodes, ...relationNodes]);
      setEdges(newEdges);
    }
  }, [entitiesQuery.data, relationsQuery.data, selections]);

  const onConnect = useCallback(
    (params: Connection | Edge) => {
      // prevent self-looping connections or connecting to null
      if (!params.source || !params.target || params.source === params.target) {
        return;
      }

      const newEdge: Edge = {
        id: `${params.source}-${params.target}`,
        source: params.source,
        target: params.target,
      };

      addRelation.mutate({
        fromId: params.source,
        toId: params.target,
        relationType: 'connected to',
        date: selectedDate,
      });

      setEdges((eds) => addEdge(newEdge, eds));
    },
    [addRelation, selectedDate]
  );

  const handleAddNode = () => {
    addEntity.mutate({
      label: 'New Topic',
      type: 'topic',
      x: 200,
      y: 150,
      properties: {},
      date: selectedDate,
    });
  };

  const onNodeDragStop = useCallback(
    (_: any, node: Node) => {
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
    [socket, updatePosition, updateRelationPosition]
  );

  const handlePaneClick = () => {
    setSelectedNode(null);
    socket.send(JSON.stringify({ type: 'selection', nodeId: null }));
  };

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const handleNodeClick = (_: any, node: Node) => {
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

  return (
    <div className="flex h-screen bg-gray-800 text-white">
      <div className="flex-1 h-screen relative">
        <div className="absolute top-4 left-4 z-10 flex items-center space-x-4">
          <div className="flex items-center space-x-2 bg-gray-700 p-2 rounded-lg">
            <img src="/file.svg" alt="File" className="w-6 h-6" />
            <span className="font-mono text-lg">GRC-20</span>
            <span className="font-mono text-lg text-gray-400">/</span>
            <img src="/globe.svg" alt="Globe" className="w-6 h-6" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-gray-600 border border-gray-500 rounded px-2 py-1 text-sm"
            />
          </div>

          <div className="flex items-center space-x-2">
            {presentUsers.map(user => (
              <Avatar key={user.id} address={user.address} />
            ))}
          </div>
        </div>

        <div className="absolute top-4 right-4 z-10 flex items-center space-x-2">
          {address ? (
            <div className="flex items-center space-x-2 bg-gray-700 p-2 rounded-lg">
              <span className="text-sm font-mono">{`${address.slice(
                0,
                6
              )}...${address.slice(-4)}`}</span>
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

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onPaneClick={handlePaneClick}
          onNodeClick={handleNodeClick}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          fitView
          className="bg-gray-900"
        >
          <Background />
          <Controls />
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center bg-gray-800 bg-opacity-80 p-8 rounded-lg pointer-events-auto">
                <h2 className="text-2xl font-bold mb-2">Welcome to your Knowledge Graph</h2>
                <p className="text-gray-400 mb-6">
                  Map ideas, projects, and people to see how they connect.
                </p>
                <button
                  onClick={handleAddNode}
                  className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
                >
                  Create your first Topic
                </button>
              </div>
            </div>
          )}
        </ReactFlow>

      </div>
      <Inspector
        selectedNode={selectedNode}
        onSave={(nodeId, data) => updateNodeData.mutate({ nodeId, data })}
        onDelete={(id: string, isRelation: boolean) => {
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
    </div>
  );
}

const addressToColor = (address: string) => {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase();
  return `#${'00000'.substring(0, 6 - c.length)}${c}`;
};
