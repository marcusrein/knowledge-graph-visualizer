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

export default function GraphPage() {
  const queryClient = useQueryClient();
  const { address } = useAccount();
  const { connect, connectors, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();

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
    if (entitiesQuery.data) {
      setNodes(
        entitiesQuery.data.map((e) => ({
          id: e.nodeId,
          data: { label: e.label },
          position: {
            x: e.x ?? Math.random() * 400,
            y: e.y ?? Math.random() * 400,
          },
        }))
      );
    }
  }, [entitiesQuery.data]);

  useEffect(() => {
    if (relationsQuery.data) {
      setEdges(
        relationsQuery.data.map((r) => ({
          id: String(r.id),
          source: r.sourceId,
          target: r.targetId,
          label: r.relationType,
        }))
      );
    }
  }, [relationsQuery.data]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!address) return;
      addRelation.mutate({
        sourceId: connection.source,
        targetId: connection.target,
        relationType: 'related',
        userAddress: address,
      });
    },
    [address, addRelation]
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
            deleteEntity.mutate({ nodeId: change.id });
          }
        }
      }
    },
    [address, selectedDate, today, deleteEntity]
  );

  const onNodeDragStop = useCallback(
    (_evt: any, node: Node) => {
      if (address) {
        updatePosition.mutate({ nodeId: node.id, x: node.position.x, y: node.position.y });
      }
    },
    [address, updatePosition]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const isEditable = selectedDate === today && address;
      setEdges((eds) => applyEdgeChanges(changes, eds));

      if (isEditable) {
        for (const change of changes) {
          if (change.type === 'remove') {
            deleteRelation.mutate({ id: change.id });
          }
        }
      }
    },
    [address, selectedDate, today, deleteRelation]
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
          {address ? (
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
          )}
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
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </main>
    </div>
  );
}
