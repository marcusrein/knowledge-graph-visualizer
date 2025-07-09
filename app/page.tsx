"use client";

import { useState, useCallback, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  addEdge,
  Connection,
  Edge,
  Node,
  OnConnectStartParams,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

export default function GraphPage() {
  const queryClient = useQueryClient();
  const { address } = useAccount();

  // fetch nodes and edges
  const entitiesQuery = useQuery({
    queryKey: ['entities'],
    queryFn: async () => {
      const res = await fetch('/api/entities');
      return (await res.json()) as any[];
    },
  });

  const relationsQuery = useQuery({
    queryKey: ['relations'],
    queryFn: async () => {
      const res = await fetch('/api/relations');
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['entities'] }),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['relations'] }),
  });

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  // map API to React Flow
  useEffect(() => {
    if (entitiesQuery.data) {
      setNodes(
        entitiesQuery.data.map((e) => ({
          id: e.nodeId,
          data: { label: e.label },
          position: { x: Math.random() * 400, y: Math.random() * 400 },
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
    if (!address) return;
    const nodeId = crypto.randomUUID();
    addEntity.mutate({
      nodeId,
      label: `Node ${nodes.length + 1}`,
      type: 'category',
      userAddress: address,
    });
  };

  return (
    <div className="h-screen flex flex-col">
      <header className="p-4 flex justify-between items-center bg-base-200">
        <h1 className="text-xl font-bold">Knowledge Graph</h1>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={handleAddNode} disabled={!address}>
            Add Node
          </button>
          <ConnectButton />
        </div>
      </header>
      <main className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onConnect={onConnect}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </main>
    </div>
  );
}
