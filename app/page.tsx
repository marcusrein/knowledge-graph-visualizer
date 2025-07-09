"use client";

import { useState, useCallback, useEffect } from 'react';
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

import RelationNode from '@/components/RelationNode';
import Inspector from '@/components/Inspector';

const nodeTypes = {
  relation: RelationNode,
};

// A more robust check for numeric strings (for relation IDs)
function isNumeric(str: string) {
  if (typeof str !== 'string') return false;
  return /^\d+$/.test(str);
}

export default function GraphPage() {
  const queryClient = useQueryClient();
  const { address } = useAccount();
  const { connect, connectors, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();

  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

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
  const [mounted, setMounted] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    setMounted(true);
    const hide = localStorage.getItem('kg_hide_intro');
    if (!hide) setShowIntro(true);
  }, []);

  const dismissIntro = (neverShow: boolean) => {
    if (neverShow) {
      localStorage.setItem('kg_hide_intro', '1');
    }
    setShowIntro(false);
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
    onSuccess: () => {
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
    // No optimistic update, just refetch on success
    onSuccess: () => {
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
    onSuccess: () => {
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['entities', selectedDate] }),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['relations', selectedDate] }),
  });

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  /* ---------- mutations ---------- */
  // map API to React Flow
  useEffect(() => {
    if (entitiesQuery.data && relationsQuery.data) {
      const entityNodes = entitiesQuery.data.map((e) => ({
        id: e.nodeId,
        type: 'default', // Make entities visually distinct if needed later
        data: { label: e.label },
        position: {
          x: e.x ?? Math.random() * 400,
          y: e.y ?? Math.random() * 400,
        },
      }));

      const relationNodes = relationsQuery.data.map((r) => ({
        id: String(r.id),
        type: 'relation', // Use our custom node type
        data: { label: r.relationType },
        position: {
          x: r.x ?? Math.random() * 400,
          y: r.y ?? Math.random() * 400,
        },
        draggable: true,
      }));

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
  }, [entitiesQuery.data, relationsQuery.data]);

  const onConnect = useCallback(
    (connection: Connection) => {
      console.log('Attempting connection:', connection);
      console.log('Current nodes in state:', nodes);
      if (!address || !connection.source || !connection.target) return;

      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);

      console.log('Found source node:', sourceNode);
      console.log('Found target node:', targetNode);

      if (!sourceNode || !targetNode) return;

      const isSourceNumeric = isNumeric(sourceNode.id);
      const isTargetNumeric = isNumeric(targetNode.id);
      console.log(`Checking IDs: source is numeric? ${isSourceNumeric}, target is numeric? ${isTargetNumeric}`);

      // Prevent connecting to/from a relation node
      if (isSourceNumeric || isTargetNumeric) {
        toast.error('Can only connect main entities');
        return;
      }

      const x = (sourceNode.position.x + targetNode.position.x) / 2;
      const y = (sourceNode.position.y + targetNode.position.y) / 2;

      addRelation.mutate({
        sourceId: connection.source,
        targetId: connection.target,
        relationType: 'related',
        userAddress: address,
        x,
        y,
      });
    },
    [address, addRelation, nodes]
  );

  const handleAddNode = () => {
    if (!address || selectedDate !== today) return;
    const nodeId = crypto.randomUUID();
    const randX = Math.random() * 400;
    const randY = Math.random() * 400;
    addEntity.mutate({
      nodeId,
      label: `Node ${nodes.length + 1}`,
      type: 'category',
      userAddress: address,
      x: randX,
      y: randY,
    });
  };

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const isDraggable = selectedDate === today && address;
      setNodes((nds) => applyNodeChanges(changes, nds));

      if (isDraggable) {
        for (const change of changes) {
          if (change.type === 'remove') {
            // Check if it's a relation (numeric ID) or entity (UUID)
            if (isNumeric(change.id)) {
              deleteRelation.mutate({ id: change.id });
            } else {
              deleteEntity.mutate({ nodeId: change.id });
            }
          }
        }
      }
    },
    [address, selectedDate, today, deleteEntity, deleteRelation]
  );

  const onNodeDragStop = useCallback(
    (_evt: any, node: Node) => {
      if (address) {
        if (isNumeric(node.id)) {
          updateRelationPosition.mutate({ id: node.id, x: node.position.x, y: node.position.y });
        } else {
          updatePosition.mutate({ nodeId: node.id, x: node.position.x, y: node.position.y });
        }
      }
    },
    [address, updatePosition, updateRelationPosition]
  );

  const onNodeClick = useCallback((_evt: any, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      // For now, prevent edge deletion since they are managed by relation nodes
      const isEditable = selectedDate === today && address;
      const filteredChanges = changes.filter(c => c.type !== 'remove');
      setEdges((eds) => applyEdgeChanges(filteredChanges, eds));
    },
    [address, selectedDate, today]
  );

  return (
    <div className="h-screen flex flex-col">
      {showIntro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-6 space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">Welcome to the Knowledge Graph!</h2>
            <p className="text-gray-600 leading-relaxed">
              This collaborative canvas resets daily at&nbsp;00:00&nbsp;UTC. Add nodes and connections today, and use the
              date picker to explore snapshots from previous days.
            </p>
            <div className="flex justify-end gap-4">
              <button
                className="btn btn-outline"
                onClick={() => dismissIntro(false)}
              >
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={() => dismissIntro(true)}
              >
                Don&apos;t Show Again
              </button>
            </div>
          </div>
        </div>
      )}
      <header className="p-4 flex flex-wrap gap-4 justify-between items-center bg-base-200 border-b border-base-300">
        <h1 className="text-xl font-bold">Knowledge Graph</h1>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <input
              type="date"
              className="input input-sm input-bordered hover:border-blue-500 focus:input-primary cursor-pointer"
              value={selectedDate}
              max={today}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleAddNode}
            disabled={!mounted || !address || selectedDate !== today}
          >
            Add Node
          </button>
          {mounted &&
            (address ? (
              <button className="btn btn-outline btn-sm hover:btn-outline-primary font-mono" onClick={() => disconnect()}>
                {address.slice(0, 6)}…{address.slice(-4)}
              </button>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  const connector = connectors[0];
                  if (!connector) {
                    toast.error('No injected wallet found. Please install MetaMask.');
                    return;
                  }
                  connect({ connector });
                }}
              >
                Connect Wallet
              </button>
            ))}
        </div>
      </header>
      <main className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onConnect={onConnect}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </main>
      <Inspector
        selectedNode={selectedNode}
        onClose={() => setSelectedNode(null)}
        onSave={(nodeId, data) => updateNodeData.mutate({ nodeId, data })}
      />
    </div>
  );
}
