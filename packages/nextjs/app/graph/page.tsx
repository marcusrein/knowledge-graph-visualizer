"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useCallback, useMemo } from "react";
import type { NextPage } from "next";
import { nanoid } from "nanoid";
import { applyNodeChanges, applyEdgeChanges, Node, Edge, MarkerType, addEdge } from "reactflow";
import type { Connection } from "reactflow";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { Address } from "~~/components/scaffold-eth";
import { Edit } from "@graphprotocol/grc-20/proto";
import { useAccount, useWalletClient } from "wagmi";
import toast from "react-hot-toast";
import { Graph } from "@graphprotocol/grc-20";

const ReactFlow = dynamic(() => import("reactflow").then(mod => mod.ReactFlow), {
  ssr: false,
});
const ReactFlowProvider = dynamic(() => import("reactflow").then(mod => mod.ReactFlowProvider), { ssr: false });
const Background = dynamic(() => import("reactflow").then(mod => mod.Background), { ssr: false });
const Controls = dynamic(() => import("reactflow").then(mod => mod.Controls), { ssr: false });
// We rely on default node handles; no custom Handle import needed

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

// Add these constants near the top after imports
const RELATION_TYPES = [
  { id: 'prerequisite', label: 'Is a prerequisite for', description: 'Knowledge that must be understood first' },
  { id: 'builds-upon', label: 'Builds upon', description: 'Extends or enhances the previous knowledge' },
  { id: 'contradicts', label: 'Contradicts', description: 'Presents conflicting information or perspective' },
  { id: 'supports', label: 'Provides evidence for', description: 'Offers data or reasoning that supports' },
  { id: 'example', label: 'Is an example of', description: 'Demonstrates or illustrates the concept' },
  { id: 'related', label: 'Is related to', description: 'Has a general connection to' },
  { id: 'defines', label: 'Defines', description: 'Provides a definition or explanation of' },
  { id: 'implements', label: 'Implements', description: 'Shows practical application of' },
] as const;

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

  // Add new state variables
  const [selectedRelationType, setSelectedRelationType] = useState<string>('');
  const [customRelationDetails, setCustomRelationDetails] = useState('');
  // Memoize nodeTypes and edgeTypes so they are stable across renders
  const nodeTypesMemo = useMemo(() => ({}), []);
  const edgeTypesMemo = useMemo(() => ({}), []);

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
    if (!linkSource || !linkTarget || !selectedRelationType || !userAddress || !walletClient || !spaceId) return;

    setLoading(true);
    setError(null);

    try {
      // 1. Create/ensure properties for storing relation metadata
      const { ops: relDetailsPropertyOps } = Graph.createProperty({
        name: 'Knowledge Relationship Details',
        dataType: 'TEXT',
      });

      const { ops: relTimestampPropertyOps } = Graph.createProperty({
        name: 'Knowledge Relationship Timestamp',
        dataType: 'TIME',
      });

      // 2. Create (or reuse) a Type entity representing the selected relationship kind
      const selectedType = RELATION_TYPES.find(t => t.id === selectedRelationType);
      if (!selectedType) throw new Error('Invalid relation type');

      const { id: relationTypeId, ops: relationTypeOps } = Graph.createType({
        name: selectedType.label,
      });

      // 3. Build the relation (rich relation with its own entity)
      const entityName = `${linkSource.data.label} → ${linkTarget.data.label}`;

      const { id: relationId, ops: relationOps } = Graph.createRelation({
        fromEntity: linkSource.id,
        toEntity: linkTarget.id,
        type: relationTypeId,
        position: new Date().toISOString(),
        entityName,
        entityDescription: customRelationDetails || relationshipDescription,
        // We omit entityValues because createEntity currently expects an array; setting values separately can be done in a follow-up update if desired.
        // entityValues removed to avoid TypeError during SDK internal iteration.
      });

      // Combine all ops (create property/type + relation)
      const allOps = [
        ...relDetailsPropertyOps,
        ...relTimestampPropertyOps,
        ...relationTypeOps,
        ...relationOps,
      ];

      // 4. Send ops to backend
      const uploadRes = await fetch("http://localhost:4000/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress,
          edits: allOps,
          entityId: relationId,
          name: entityName,
          description: customRelationDetails || relationshipDescription,
          spaceId,
          relationType: selectedType?.id,
          fromEntity: linkSource.id,
          toEntity: linkTarget.id,
          relatedTo: linkSource.id,
        }),
      });

      if (!uploadRes.ok) {
        const text = await uploadRes.text();
        throw new Error(`Upload API error: ${uploadRes.status} - ${text}`);
      }
      const uploadJson = await uploadRes.json();
      const cidWithPrefix: string = uploadJson.cid;

      await new Promise(resolve => setTimeout(resolve, 2000));

      // 5. Publish on-chain
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

      // 6. Update UI
      setEdges(eds => {
        const fromEdge = {
          id: `${relationId}-from`,
          source: linkSource.id,
          target: relationId,
          animated: false,
          style: { stroke: "#f59e0b", strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#f59e0b" },
          label: selectedType?.label,
        };
        const toEdge = {
          id: `${relationId}-to`,
          source: relationId,
          target: linkTarget.id,
          animated: false,
          style: { stroke: "#f59e0b", strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#f59e0b" },
        };
        return addEdge(toEdge, addEdge(fromEdge, eds));
      });

      // 7. Add a visual node for the relationship itself so it can be distinguished & positioned below the linked entities
      const midX = (linkSource.position.x + linkTarget.position.x) / 2;
      const belowY = Math.max(linkSource.position.y, linkTarget.position.y) + 120;
      setNodes(ns => [
        ...ns,
        {
          id: relationId,
          data: {
            label: entityName,
            description: customRelationDetails || relationshipDescription,
            isRelation: true,
          },
          position: { x: midX, y: belowY },
          draggable: true,
          style: { background: '#0f766e', color: '#ffffff', border: '1px solid #065f46' },
        },
      ]);
    } catch (e: any) {
      setError(e.message);
      console.error("Failed to create relationship", e);
    } finally {
      setIsLinking(false);
      setLinkSource(null);
      setLinkTarget(null);
      setSelectedRelationType('');
      setRelationshipDescription('');
      setCustomRelationDetails('');
      setLoading(false);
    }
  }, [linkSource, linkTarget, selectedRelationType, relationshipDescription, customRelationDetails, userAddress, walletClient, spaceId]);

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

        const tempNodes: Node[] = [];
        const tempEdges: Edge[] = [];
        const nodePosMap: Record<string, { x: number; y: number }> = {};

        // --- Partition entities and identify relation targets ---
        const relationEntityRows: EntityRow[] = [];
        const normalEntityRows: EntityRow[] = [];
        const relationOpsMap: Record<string, any> = {};
        const targetEntityIds = new Set<string>();

        json.forEach(r => {
          if (r.opsJson) {
            try {
              const ops = JSON.parse(r.opsJson);
              const relOp = ops.find((o: any) => o.type === "CREATE_RELATION" && o.relation?.id === r.entityId);
              if (relOp) {
                relationEntityRows.push(r);
                relationOpsMap[r.entityId] = relOp;
                if (relOp.relation.toEntity) {
                  targetEntityIds.add(relOp.relation.toEntity);
                }
                return;
              }
            } catch {}
          }
          normalEntityRows.push(r);
        });

        // --- Build children map ---
        const childrenMap: Record<string, EntityRow[]> = {};
        json.filter(r => r.relatedTo).forEach(r => {
          const parentId = r.relatedTo as string;
          if (!childrenMap[parentId]) childrenMap[parentId] = [];
          childrenMap[parentId].push(r);
        });

        // --- Layout Top-Level Roots ---
        const allRoots = normalEntityRows.filter(r => !r.relatedTo);
        const topLevelRoots = allRoots.filter(r => !targetEntityIds.has(r.entityId));
        const bottomLevelRoots = allRoots.filter(r => targetEntityIds.has(r.entityId));

        const xSpacing = 400;
        const yTop = 100;

        topLevelRoots.forEach((root, idx) => {
          const x = idx * xSpacing + 100;
          const rootPos = { x, y: yTop };
          const rootNode: Node = {
            id: root.entityId,
            data: {
              label: root.name || root.entityId.slice(0, 6),
              description: root.description,
              user: root.userAddress,
              cid: root.cid,
              timestamp: root.timestamp,
              ops: root.opsJson ? JSON.parse(root.opsJson) : undefined,
            },
            position: rootPos,
            draggable: true,
            style: { background: "#1e3a8a", color: "#ffffff", border: "1px solid #1e40af" },
          };
          tempNodes.push(rootNode);
          nodePosMap[root.entityId] = rootPos;

          const valueChildren = childrenMap[root.entityId] || [];
          if (root.description) {
            const descId = `${root.entityId}-desc`;
            if (!valueChildren.some(c => c.description === root.description)) {
              valueChildren.unshift({
                entityId: descId,
                name: root.description.slice(0, 24),
                description: root.description,
                relatedTo: root.entityId,
                userAddress: root.userAddress,
                cid: root.cid,
                timestamp: root.timestamp,
                opsJson: root.opsJson,
              } as EntityRow);
            }
          }

          valueChildren.forEach((child, childIdx) => {
            const childY = rootPos.y + 100 + childIdx * 80;
            const childLabel = child.name || child.description?.slice(0, 24) || child.entityId.slice(0, 6);
            const childNode: Node = {
              id: child.entityId,
              data: {
                label: childLabel,
                knowledgeCategoryName: root.name,
                description: child.description,
                user: child.userAddress,
                cid: child.cid,
                timestamp: child.timestamp,
                ops: child.opsJson ? JSON.parse(child.opsJson) : undefined,
              },
              position: { x: rootPos.x, y: childY },
              draggable: true,
            };
            tempNodes.push(childNode);
            nodePosMap[child.entityId] = childNode.position;
            tempEdges.push({
              id: nanoid(6),
              source: root.entityId,
              target: child.entityId,
            });
          });
        });

        // --- Layout Relation Nodes ---
        const relationsBySource = relationEntityRows.reduce((acc, r) => {
          const relOp = relationOpsMap[r.entityId];
          const from = relOp.relation.fromEntity;
          if (!acc[from]) acc[from] = [];
          acc[from].push(r);
          return acc;
        }, {} as Record<string, EntityRow[]>);

        const relationSpacing = 220;
        const yRelations = 450;

        Object.entries(relationsBySource).forEach(([sourceId, relations]) => {
          const sourcePos = nodePosMap[sourceId];
          if (!sourcePos) return;

          const total = relations.length;
          const xStart = sourcePos.x - ((total - 1) / 2) * relationSpacing;

          relations.forEach((relRow, relIdx) => {
            const xPos = xStart + relIdx * relationSpacing;
            let nodeLabel = relRow.name || relRow.entityId.slice(0, 6);
            if (nodeLabel.includes(": ")) {
              nodeLabel = nodeLabel.split(": ")[1];
            }

            const relNode: Node = {
              id: relRow.entityId,
              data: {
                label: nodeLabel,
                description: relRow.description,
                isRelation: true,
                ops: JSON.parse(relRow.opsJson as string),
              },
              position: { x: xPos, y: yRelations },
              draggable: true,
              style: { background: "#0f766e", color: "#ffffff", border: "1px solid #065f46" },
            };
            tempNodes.push(relNode);
            nodePosMap[relRow.entityId] = relNode.position;

            const relOp = relationOpsMap[relRow.entityId];
            const selectedType = RELATION_TYPES.find(t => t.id === (relRow as any).relationType);

            tempEdges.push({
              id: `${relRow.entityId}-from`,
              source: relOp.relation.fromEntity,
              target: relRow.entityId,
              label: selectedType?.label,
              style: { stroke: "#f59e0b", strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: "#f59e0b" },
            });
            tempEdges.push({
              id: `${relRow.entityId}-to`,
              source: relRow.entityId,
              target: relOp.relation.toEntity,
              style: { stroke: "#f59e0b", strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: "#f59e0b" },
            });

            const relChildren = childrenMap[relRow.entityId] || [];
            if (relRow.description) {
              const descId = `${relRow.entityId}-desc`;
              if (!relChildren.some(c => c.description === relRow.description)) {
                relChildren.unshift({
                  entityId: descId,
                  name: relRow.description.slice(0, 24),
                  description: relRow.description,
                  relatedTo: relRow.entityId,
                  userAddress: relRow.userAddress,
                  cid: relRow.cid,
                  timestamp: relRow.timestamp,
                  opsJson: relRow.opsJson,
                } as EntityRow);
              }
            }

            relChildren.forEach((child, childIdx) => {
              const childY = yRelations + 80 + childIdx * 80;
              const childLabel = child.name || child.description?.slice(0, 24) || child.entityId.slice(0, 6);
              const childNode: Node = {
                id: child.entityId,
                data: {
                  label: childLabel,
                  knowledgeCategoryName: relRow.name,
                  description: child.description,
                  user: child.userAddress,
                  cid: child.cid,
                  timestamp: child.timestamp,
                  ops: child.opsJson ? JSON.parse(child.opsJson) : undefined,
                },
                position: { x: xPos, y: childY },
                draggable: true,
              };
              tempNodes.push(childNode);
              nodePosMap[child.entityId] = childNode.position;
              tempEdges.push({
                id: nanoid(6),
                source: relRow.entityId,
                target: child.entityId,
              });
            });
          });
        });

        // --- Layout Bottom-Level Roots ---
        const yBottom = 800;
        const relationsByTarget = relationEntityRows.reduce((acc, r) => {
          const relOp = relationOpsMap[r.entityId];
          const to = relOp.relation.toEntity;
          if (!acc[to]) acc[to] = [];
          acc[to].push(r);
          return acc;
        }, {} as Record<string, EntityRow[]>);

        bottomLevelRoots.forEach((root, idx) => {
          const relationsTargetingRoot = relationsByTarget[root.entityId] || [];
          const relNodePositions = relationsTargetingRoot.map(relRow => nodePosMap[relRow.entityId]).filter(Boolean);

          let x;
          if (relNodePositions.length > 0) {
            x = relNodePositions.reduce((sum, pos) => sum + pos.x, 0) / relNodePositions.length;
          } else {
            x = idx * xSpacing + 100; // Fallback
          }

          const rootPos = { x, y: yBottom };
          const rootNode: Node = {
            id: root.entityId,
            data: {
              label: root.name || root.entityId.slice(0, 6),
              description: root.description,
              user: root.userAddress,
              cid: root.cid,
              timestamp: root.timestamp,
              ops: root.opsJson ? JSON.parse(root.opsJson) : undefined,
            },
            position: rootPos,
            draggable: true,
            style: { background: "#1e3a8a", color: "#ffffff", border: "1px solid #1e40af" },
          };
          tempNodes.push(rootNode);
          nodePosMap[root.entityId] = rootPos;

          const valueChildren = childrenMap[root.entityId] || [];
          if (root.description) {
            const descId = `${root.entityId}-desc`;
            if (!valueChildren.some(c => c.description === root.description)) {
              valueChildren.unshift({
                entityId: descId,
                name: root.description.slice(0, 24),
                description: root.description,
                relatedTo: root.entityId,
                userAddress: root.userAddress,
                cid: root.cid,
                timestamp: root.timestamp,
                opsJson: root.opsJson,
              } as EntityRow);
            }
          }

          valueChildren.forEach((child, childIdx) => {
            const childY = rootPos.y + 100 + childIdx * 80;
            const childLabel = child.name || child.description?.slice(0, 24) || child.entityId.slice(0, 6);
            const childNode: Node = {
              id: child.entityId,
              data: {
                label: childLabel,
                knowledgeCategoryName: root.name,
                description: child.description,
                user: child.userAddress,
                cid: child.cid,
                timestamp: child.timestamp,
                ops: child.opsJson ? JSON.parse(child.opsJson) : undefined,
              },
              position: { x: rootPos.x, y: childY },
              draggable: true,
            };
            tempNodes.push(childNode);
            nodePosMap[child.entityId] = childNode.position;
            tempEdges.push({
              id: nanoid(6),
              source: root.entityId,
              target: child.entityId,
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
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onConnect={onConnect}
          isValidConnection={useCallback((connection: Connection) => connection.source !== connection.target, [])}
          fitView
          nodeTypes={nodeTypesMemo}
          edgeTypes={edgeTypesMemo}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </ReactFlowProvider>

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
            <h3 className="font-bold text-lg mb-4">Create Knowledge Relationship</h3>
            <div className="space-y-4">
              <div className="flex flex-col gap-4 bg-base-200 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-900 rounded-full"></div>
                    <div>
                      <p className="font-semibold">{linkSource.data.label}</p>
                      <p className="text-xs text-base-content/70">Source Entity</p>
                    </div>
                  </div>
                  <div className="text-accent">→</div>
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="font-semibold">{linkTarget.data.label}</p>
                      <p className="text-xs text-base-content/70">Target Entity</p>
                    </div>
                    <div className="w-3 h-3 bg-blue-900 rounded-full"></div>
                  </div>
                </div>
              </div>
              
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-semibold">Relationship Type</span>
                </label>
                <select 
                  className="select select-bordered w-full"
                  value={selectedRelationType}
                  onChange={e => setSelectedRelationType(e.target.value)}
                >
                  <option value="">Select a relationship type...</option>
                  {RELATION_TYPES.map(type => (
                    <option key={type.id} value={type.id}>
                      {type.label}
                    </option>
                  ))}
                </select>
                {selectedRelationType && (
                  <label className="label">
                    <span className="label-text-alt">
                      {RELATION_TYPES.find(t => t.id === selectedRelationType)?.description}
                    </span>
                  </label>
                )}
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-semibold">Additional Details</span>
                </label>
                <textarea
                  className="textarea textarea-bordered w-full h-24"
                  placeholder="Add any additional context or details about this relationship..."
                  value={customRelationDetails}
                  onChange={e => setCustomRelationDetails(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-action">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setIsLinking(false);
                  setLinkSource(null);
                  setLinkTarget(null);
                  setSelectedRelationType('');
                  setCustomRelationDetails('');
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateRelationship}
                disabled={!selectedRelationType || loading}
              >
                {loading ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Creating...
                  </>
                ) : (
                  "Create Relationship"
                )}
              </button>
            </div>
          </div>
          <div
            className="modal-backdrop"
            onClick={() => {
              setIsLinking(false);
              setLinkSource(null);
              setLinkTarget(null);
              setSelectedRelationType('');
              setCustomRelationDetails('');
            }}
          ></div>
        </div>
      )}
    </div>
  );
};

export default GraphPage; 