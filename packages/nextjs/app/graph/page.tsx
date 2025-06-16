"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, memo, useCallback } from "react";
import type { NextPage } from "next";
import { nanoid } from "nanoid";
import { Position, applyNodeChanges, applyEdgeChanges, Node, Edge, MarkerType, addEdge } from "reactflow";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { Address } from "~~/components/scaffold-eth";
import { Edit } from "@graphprotocol/grc-20/proto";
import { useAccount, useWalletClient } from "wagmi";
import toast from "react-hot-toast";
import { Graph } from "@graphprotocol/grc-20";

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
  spaceId?: string;
  name?: string;
  description?: string;
  relatedTo?: string | null;
  userAddress: string;
  cid: string;
  timestamp: string;
  opsJson?: string;
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
  const [decodedData, setDecodedData] = useState<any>(null);
  const [isDecoding, setIsDecoding] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [linkSource, setLinkSource] = useState<any | null>(null);
  const [linkTarget, setLinkTarget] = useState<any | null>(null);
  const [relationshipDescription, setRelationshipDescription] = useState("");
  const { address: userAddress } = useAccount();

  const { data: walletClient } = useWalletClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spaceId, setSpaceId] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  // Retrieve personalSpaceId from localStorage on client
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('personalSpaceId');
      setSpaceId(saved);
    }
  }, []);

  const onNodesChange = useCallback((changes: any) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes: any) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onNodeClick = (_: any, node: any) => {
    setSelectedNode(node);
  };

  const onConnect = useCallback(
    (params: any) => {
      setLinkSource(nodes.find(n => n.id === params.source));
      setLinkTarget(nodes.find(n => n.id === params.target));
      setIsLinking(true);
    },
    [nodes],
  );

  const handleCreateRelationship = useCallback(async () => {
    if (!linkSource || !linkTarget || !relationshipDescription || !userAddress || !walletClient || !spaceId) return;

    setLoading(true);
    setError(null);

    try {
      // 1. Use the GRC-20 SDK to create an entity representing the relationship.
      const entityName = `Relation: ${linkSource.data.label} → ${linkTarget.data.label}`;
      const { id: newEntityId, ops } = Graph.createEntity({
        name: entityName,
        description: relationshipDescription,
        values: [
          { property: 'from' as any, value: linkSource.id },
          { property: 'to' as any, value: linkTarget.id },
        ],
      });

      // 2. Send ops to backend
      const uploadRes = await fetch("http://localhost:4000/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress, edits: ops, entityId: newEntityId, name: entityName, description: relationshipDescription, spaceId }),
      });

      if (!uploadRes.ok) {
        const text = await uploadRes.text();
        throw new Error(`Upload API error: ${uploadRes.status} - ${text}`);
      }
      const uploadJson = await uploadRes.json();
      const cidWithPrefix: string = uploadJson.cid;

      await new Promise(resolve => setTimeout(resolve, 2000));

      // 3. Publish on-chain
      const metaRes = await fetch(`https://api-testnet.grc-20.thegraph.com/space/${spaceId}/edit/calldata`, {
        method: "POST",
        body: JSON.stringify({ cid: cidWithPrefix, network: "TESTNET" }),
        headers: { "Content-Type": "application/json" },
      });

      if (!metaRes.ok) {
        const text = await metaRes.text();
        throw new Error(`GRC-20 API error: ${metaRes.status} - ${text}`);
      }
      const json = await metaRes.json();
      const { to, data } = json;
      await walletClient.sendTransaction({ to, data: data as `0x${string}` });

      // 4. Update UI
      const newEdge = { id: newEntityId, source: linkSource.id, target: linkTarget.id, type: 'smoothstep', animated: false, style: { stroke: '#f59e0b', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' }, label: relationshipDescription };
      setEdges(eds => addEdge(newEdge, eds));
    } catch (e: any) {
      setError(e.message);
      console.error("Failed to create relationship", e);
    } finally {
      setIsLinking(false);
      setLinkSource(null);
      setLinkTarget(null);
      setRelationshipDescription("");
      setLoading(false);
    }
  }, [linkSource, linkTarget, relationshipDescription, userAddress, walletClient, spaceId]);

  const handleDecodeCID = async (cid: string) => {
    setIsDecoding(true);
    setDecodedData(null);
    
    try {
      // Strip ipfs:// prefix if present
      const cleanCid = cid.replace(/^ipfs:\/\//, "");
      
      // Fetch the binary data from IPFS
      const response = await fetch(`https://ipfs.io/ipfs/${cleanCid}`);
      if (!response.ok) throw new Error(`Failed to fetch IPFS data: ${response.status}`);
      
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Decode the binary data
      const decoded = Edit.fromBinary(uint8Array);
      setDecodedData(decoded);
    } catch (err: any) {
      console.error("Failed to decode IPFS data:", err);
      setDecodedData({ error: err.message });
    } finally {
      setIsDecoding(false);
    }
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
            data: { 
              label: root.name || root.entityId.slice(0, 6),
              description: root.description,
              user: root.userAddress,
              cid: root.cid,
              timestamp: root.timestamp,
              ops: root.opsJson ? JSON.parse(root.opsJson) : undefined
            },
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
              userAddress: root.userAddress,
              cid: root.cid,
              timestamp: root.timestamp,
              opsJson: root.opsJson
            } as EntityRow);
          }

          children.forEach((child, childIdx) => {
            const childY = 200 + childIdx * 80;
            const childLabel = child.name
              ? child.name
              : child.description
                ? child.description.slice(0, 24)
                : child.entityId.slice(0, 6);
            tempNodes.push({
              id: child.entityId,
              type: "value",
              data: {
                label: childLabel,
                knowledgeCategoryName: root.name,
                description: child.description,
                user: child.userAddress,
                cid: child.cid,
                timestamp: child.timestamp,
                ops: child.opsJson ? JSON.parse(child.opsJson) : undefined,
              },
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
        onConnect={onConnect}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>

      {selectedNode && (
        <div className="modal modal-open">
          <div className="modal-box max-w-3xl">
            <div className="flex justify-end items-center mb-4">
              <button className="btn btn-sm btn-circle" onClick={() => setSelectedNode(null)}>✕</button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="font-semibold">Knowledge Category</p>
                  <p>{selectedNode.data.knowledgeCategoryName || selectedNode.data.label}</p>
                </div>
                <div>
                  <p className="font-semibold">Created</p>
                  <p>{selectedNode.data.timestamp ? new Date(selectedNode.data.timestamp).toLocaleString() : "—"}</p>
                </div>
                <div>
                  <p className="font-semibold">Author</p>
                  {selectedNode.data.user && (
                    <div className="flex items-center gap-2">
                      <BlockieAvatar address={selectedNode.data.user} size={24} />
                      <Address address={selectedNode.data.user} size="sm" onlyEnsOrAddress />
                    </div>
                  )}
                </div>
                {selectedNode.data.cid && (
                  <div>
                    <p className="font-semibold">CID</p>
                    <button
                      onClick={() => handleDecodeCID(selectedNode.data.cid)}
                      className="link link-primary text-sm break-all"
                    >
                      {selectedNode.data.cid.replace(/^ipfs:\/\//, "")}
                    </button>
                  </div>
                )}
              </div>

              {selectedNode.data.description && (
                <div>
                  <p className="font-semibold">Knowledge</p>
                  <p className="bg-base-200 p-3 rounded-lg">{selectedNode.data.description}</p>
                </div>
              )}

              {selectedNode.data.ops && (
                <div>
                  <p className="font-semibold">Operations</p>
                  <details className="bg-base-200 p-3 rounded-lg">
                    <summary className="cursor-pointer">View Raw Ops JSON</summary>
                    <pre className="mt-2 bg-base-300 p-3 rounded-lg text-xs font-mono overflow-x-auto max-h-64">
                      {JSON.stringify(selectedNode.data.ops, null, 2)}
                    </pre>
                  </details>
                </div>
              )}

              {isDecoding && (
                <div className="flex items-center justify-center py-4">
                  <span className="loading loading-spinner loading-md"></span>
                  <span className="ml-2">Decoding IPFS data...</span>
                </div>
              )}

              {decodedData && (
                <div className="space-y-4">
                  {decodedData.error ? (
                    <div className="alert alert-error">
                      <span>❌ Failed to decode: {decodedData.error}</span>
                    </div>
                  ) : (
                    <div>
                      <div className="bg-base-200 p-4 rounded-lg">
                        <h4 className="font-semibold mb-2">Edit Metadata</h4>
                        <p><strong>Name:</strong> {decodedData.name || "—"}</p>
                        <p><strong>Author:</strong> {decodedData.author || "—"}</p>
                        <p><strong>ID:</strong> {decodedData.id ? Array.from(decodedData.id as Uint8Array).map((b: number) => b.toString(16).padStart(2, '0')).join('') : "—"}</p>
                      </div>
                      
                      <div className="bg-base-200 p-4 rounded-lg">
                        <h4 className="font-semibold mb-2">Operations ({decodedData.ops?.length || 0})</h4>
                        <pre className="bg-base-300 p-3 rounded-lg text-xs font-mono overflow-x-auto max-h-64">
                          {JSON.stringify(decodedData.ops, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setSelectedNode(null)}></div>
        </div>
      )}

      {isLinking && linkSource && linkTarget && (
        <div className="modal modal-open">
          <div className="modal-box max-w-lg">
            <h3 className="font-bold text-lg mb-4">Create a new relationship</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-base-200 p-3 rounded-lg">
                <div className="text-center">
                  <p className="font-semibold">{linkSource.data.label}</p>
                  <p className="text-xs text-base-content/70">Source</p>
                </div>
                <div className="text-accent font-bold text-2xl">→</div>
                <div className="text-center">
                  <p className="font-semibold">{linkTarget.data.label}</p>
                  <p className="text-xs text-base-content/70">Target</p>
                </div>
              </div>
              <textarea
                className="textarea textarea-bordered w-full"
                placeholder={`Describe the relationship... \n(e.g. "is an example of", "is inspired by")`}
                value={relationshipDescription}
                onChange={e => setRelationshipDescription(e.target.value)}
              />
            </div>
            <div className="modal-action">
              <button
                className="btn"
                onClick={() => {
                  setIsLinking(false);
                  setRelationshipDescription("");
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateRelationship}
                disabled={!relationshipDescription || loading}
              >
                {loading ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
          <div
            className="modal-backdrop"
            onClick={() => {
              setIsLinking(false);
              setRelationshipDescription("");
            }}
          ></div>
        </div>
      )}
    </div>
  );
};

export default GraphPage; 