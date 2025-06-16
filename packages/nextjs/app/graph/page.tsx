"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, memo, useCallback } from "react";
import type { NextPage } from "next";
import { nanoid } from "nanoid";
import { Position, applyNodeChanges, applyEdgeChanges, Node, Edge, MarkerType } from "reactflow";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { Address } from "~~/components/scaffold-eth";

const ReactFlow = dynamic(() => import("reactflow").then(mod => mod.ReactFlow), {
  ssr: false,
});
const Background = dynamic(() => import("reactflow").then(mod => mod.Background), { ssr: false });
const Controls = dynamic(() => import("reactflow").then(mod => mod.Controls), { ssr: false });
const Handle = dynamic(() => import("reactflow").then(mod => mod.Handle), { ssr: false });
// We avoid using Handle directly for static graph – default hidden handles suffice.

import "reactflow/dist/style.css";

type EntityRow = {
  entityId: string;
  name?: string;
  description?: string;
  relatedTo?: string | null;
};

// Custom node components (moved outside component)
const EntityNode = memo(({ data }: any) => {
  return (
    <div className="bg-blue-900 text-white rounded shadow px-4 py-2 text-sm font-semibold border border-blue-300">
      {data.label}
      <Handle id="a" type="target" position={Position.Top} />
      <Handle id="b" type="source" position={Position.Bottom} />
    </div>
  );
});
EntityNode.displayName = "EntityNode";

const ValueNode = memo(({ data }: any) => {
  return (
    <div className="bg-blue-200 text-blue-900 rounded shadow px-3 py-1 text-xs border border-blue-400 flex items-center gap-2">
      <BlockieAvatar address={data.user} size={18} />
      <span>{data.label}</span>
      <Handle id="a" type="target" position={Position.Top} />
    </div>
  );
});
ValueNode.displayName = "ValueNode";

// Node types (defined once, outside component)
const nodeTypes = {
  entity: EntityNode,
  value: ValueNode,
};

// Default edge options (defined once, outside component)
const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: true,
  style: { stroke: '#94a3b8' },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: '#94a3b8',
  },
};

const GraphPage: NextPage = () => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<any | null>(null);

  const onNodesChange = useCallback((changes: any) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes: any) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onNodeClick = (_: any, node: any) => {
    setSelectedNode(node);
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("http://localhost:4000/api/entities");
        if (!res.ok) return;
        const json = (await res.json()) as EntityRow[];

        // Group roots (no relatedTo) and children
        const roots = json.filter(r => !r.relatedTo);
        const childrenMap: Record<string, EntityRow[]> = {};
        json.filter(r => r.relatedTo).forEach(r => {
          const parent = r.relatedTo as string;
          if (!childrenMap[parent]) childrenMap[parent] = [];
          childrenMap[parent].push(r);
        });

        const tempNodes: Node[] = [];
        const tempEdges: Edge[] = [];
        const xSpacing = 250;

        roots.forEach((root, rootIdx) => {
          const x = rootIdx * xSpacing + 100;
          // Root entity node
          tempNodes.push({
            id: root.entityId,
            type: "entity",
            data: { label: root.name || root.entityId.slice(0, 6) },
            position: { x, y: 100 },
            draggable: true,
          });

          const children = [...(childrenMap[root.entityId] || [])];

          // if root has a description, add it as a value node
          if (root.description) {
            const descId = `${root.entityId}-desc`;
            children.unshift({
              entityId: descId,
              name: root.description.slice(0, 24),
              description: root.description,
              relatedTo: root.entityId,
            } as EntityRow);
          }

          children.forEach((child, childIdx) => {
            const childY = 200 + childIdx * 80;
            tempNodes.push({
              id: child.entityId,
              type: "value",
              data: { label: child.name || child.entityId.slice(0, 6) },
              position: { x, y: childY },
              draggable: true,
            });
            tempEdges.push({
              id: nanoid(6),
              source: root.entityId,
              target: child.entityId,
              sourceHandle: "b",
              targetHandle: "a",
              type: 'smoothstep',
            });
          });
        });

        setNodes(tempNodes);
        setEdges(tempEdges);
      } catch {
        /* noop */
      }
    })();
  }, []);

  return (
    <div style={{ height: "90vh", width: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>

      {selectedNode && (
        <div className="modal modal-open">
          <div className="modal-box max-w-3xl">
            <h3 className="font-bold text-lg mb-4">Node Details</h3>
            <div className="space-y-2">
              <p><b>Label:</b> {selectedNode.data.label}</p>
              {selectedNode.data.description && (
                <p><b>Description:</b> {selectedNode.data.description}</p>
              )}
              {selectedNode.data.cid && (
                <p><b>CID:</b> <a href={`https://ipfs.io/ipfs/${selectedNode.data.cid.replace(/^ipfs:\/\//,'')}`} className="link" target="_blank">{selectedNode.data.cid}</a></p>
              )}
              {selectedNode.data.user && (
                <p><b>Author:</b> <Address address={selectedNode.data.user} size="sm" onlyEnsOrAddress /></p>
              )}
              {selectedNode.data.ops && (
                <details className="bg-base-200 p-2 rounded">
                  <summary className="cursor-pointer">Raw Ops JSON</summary>
                  <pre className="max-h-64 overflow-y-auto text-xs mt-2">{JSON.stringify(selectedNode.data.ops, null, 2)}</pre>
                </details>
              )}
            </div>
            <div className="modal-action">
              <button className="btn" onClick={() => setSelectedNode(null)}>Close</button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setSelectedNode(null)}></div>
        </div>
      )}
    </div>
  );
};

export default GraphPage; 