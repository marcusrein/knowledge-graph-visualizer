"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import type { NextPage } from "next";
import { applyNodeChanges, applyEdgeChanges, Node, Edge, MarkerType, Handle, Position } from "reactflow";
import type { Connection } from "reactflow";
import { Address, BlockieAvatar } from "~~/components/scaffold-eth";
import { Edit } from "@graphprotocol/grc-20/proto";
import { useAccount, useWalletClient } from "wagmi";
import toast from "react-hot-toast";
import { Graph } from "@graphprotocol/grc-20";
import CustomConnectionLine from "./_components/CustomConnectionLine";
import { waitForTransactionReceipt } from "wagmi/actions";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";
import { getLayoutedElements } from "~~/utils/grc20/layout";
import { addKnowledge } from "~~/utils/grc20/addKnowledge";
import AddEntityModal from "~~/components/AddEntityModal";

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
  relationType?: string;
  fromEntity?: string;
  toEntity?: string;
};

// Add these constants near the top after imports
const RELATION_TYPES = [
  { id: "prerequisite", label: "Is a prerequisite for", description: "Knowledge that must be understood first" },
  { id: "builds-upon", label: "Builds upon", description: "Extends or enhances the previous knowledge" },
  { id: "contradicts", label: "Contradicts", description: "Presents conflicting information or perspective" },
  { id: "supports", label: "Provides evidence for", description: "Offers data or reasoning that supports" },
  { id: "example", label: "Is an example of", description: "Demonstrates or illustrates the concept" },
  { id: "related", label: "Is related to", description: "Has a general connection to" },
  { id: "defines", label: "Defines", description: "Provides a definition or explanation of" },
  { id: "implements", label: "Implements", description: "Shows practical application of" },
] as const;

const truncate = (str: string, length: number) => {
  if (!str) return str;
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
};

const AvatarNode = ({ id, data }: { id: string; data: any }) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const hideTooltipTimer = useRef<NodeJS.Timeout | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showTooltip = () => {
    if (hideTooltipTimer.current) {
      clearTimeout(hideTooltipTimer.current);
    }
    setIsTooltipVisible(true);
  };

  const hideTooltip = () => {
    hideTooltipTimer.current = setTimeout(() => {
      // Don't hide if the user is actively typing or about to submit
      if (!isAdding) {
        setIsTooltipVisible(false);
      }
    }, 200);
  };

  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAdding(true);
    // Keep tooltip open
    if (hideTooltipTimer.current) {
      clearTimeout(hideTooltipTimer.current);
    }
  };

  const handleCancelClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAdding(false);
    setInputValue("");
    setIsTooltipVisible(false); // Optionally close tooltip on cancel
  };

  const handleSubmit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!inputValue.trim() || !data.handleAddNewKnowledge) return;

    setIsSubmitting(true);
    try {
      await data.handleAddNewKnowledge(id, inputValue);
      // Success, form will disappear on reload
    } catch (error) {
      // Error is handled in the main component, just reset state here
      console.error("Submission failed from node", error);
    } finally {
      setIsSubmitting(false);
      setIsAdding(false);
      setInputValue("");
      setIsTooltipVisible(false);
    }
  };

  const baseStyle = {
    padding: "10px 15px",
    borderRadius: 8,
    border: "1px solid #ddd",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minWidth: 180,
    maxWidth: 250,
    justifyContent: "center",
  };

  const mergedStyle = { ...baseStyle, ...data.style };

  // If not connectable, hide handles. But they must exist for edges to attach.
  const handleStyle: React.CSSProperties = data.isConnectable ? {} : { visibility: "hidden" };

  const nodeContent = (
    <div style={mergedStyle}>
      <Handle type="target" position={Position.Top} style={handleStyle} />
      {data.user && <BlockieAvatar address={data.user} size={24} />}
      <span
        style={{ color: data.style?.color || "inherit", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
      >
        {data.label}
      </span>
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
    </div>
  );

  // Show tooltip for all non-relationship nodes, and for relationship nodes that have details.
  const shouldShowTooltipContainer = !data.isRelationship || (data.descriptionObjects && data.descriptionObjects.length > 0);

  if (shouldShowTooltipContainer) {
    return (
      <div className="custom-tooltip-container" onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
        {nodeContent}
        {isTooltipVisible && (
          <div className="custom-tooltip-content" onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
            {data.descriptionObjects &&
              data.descriptionObjects.map((descObj: { userAddress: string; description: string }, index: number) => (
                <div key={index} className="flex items-center gap-2 mb-2 last:mb-0">
                  <BlockieAvatar address={descObj.userAddress} size={24} />
                  <span>{descObj.description}</span>
                </div>
              ))}

            {!isAdding && (
              <button onClick={handleAddClick} className="btn btn-primary btn-xs mt-2 w-full">
                Add Knowledge
              </button>
            )}

            {isAdding && (
              <div className="mt-2 space-y-2">
                <textarea
                  className="textarea textarea-bordered w-full"
                  placeholder="Share what you know..."
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onClick={e => e.stopPropagation()}
                />
                <div className="flex justify-end gap-2">
                  <button onClick={handleCancelClick} className="btn btn-ghost btn-xs">
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    className="btn btn-primary btn-xs flex items-center gap-1"
                    disabled={!inputValue.trim() || isSubmitting}
                  >
                    {isSubmitting && <span className="loading loading-spinner loading-xs"></span>}
                    {isSubmitting ? "Submitting…" : "Submit"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return nodeContent;
};

const nodeTypes = {
  avatar: AvatarNode,
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

  // Add new state variables
  const [selectedRelationType, setSelectedRelationType] = useState("");
  const [customRelationDetails, setCustomRelationDetails] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Toggle for hiding/displaying past nodes
  const [showOnlyLatest, setShowOnlyLatest] = useState(false);
  // Memoize nodeTypes and edgeTypes so they are stable across renders
  const edgeTypesMemo = useMemo(() => ({}), []);

  const handleAddNewKnowledge = useCallback(
    async (nodeId: string, knowledgeValue: string) => {
      if (!userAddress || !walletClient || !spaceId) {
        toast.error("Please connect your wallet and select a space.");
        return;
      }
      try {
        setLoading(true);
        setError(null);
        await addKnowledge({ nodeId, knowledgeValue, userAddress, walletClient, spaceId });
      } catch (e: any) {
        setError(e.message);
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    },
    [userAddress, walletClient, spaceId],
  );

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  // Retrieve personalSpaceId from localStorage on client
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("personalSpaceId");
      setSpaceId(saved);
    }
  }, []);

  const onNodesChange = useCallback((changes: any) => {
    setNodes(nds => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes: any) => {
    setEdges(eds => applyEdgeChanges(changes, eds));
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
      console.log("[LINK] Creating relationship", {
        from: linkSource?.id,
        to: linkTarget?.id,
        selectedRelationType,
        description: customRelationDetails || relationshipDescription,
      });

      // 1. Create/ensure properties for storing relation metadata
      const { ops: relDetailsPropertyOps } = Graph.createProperty({
        name: "Knowledge Relationship Details",
        dataType: "TEXT",
      });

      const { ops: relTimestampPropertyOps } = Graph.createProperty({
        name: "Knowledge Relationship Timestamp",
        dataType: "TIME",
      });

      // 2. Create (or reuse) a Type entity representing the selected relationship kind
      const selectedType = RELATION_TYPES.find(t => t.id === selectedRelationType);
      if (!selectedType) throw new Error("Invalid relation type");

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
      const allOps = [...relDetailsPropertyOps, ...relTimestampPropertyOps, ...relationTypeOps, ...relationOps];

      console.log("[LINK] Ops generated", allOps);

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
        }),
      });

      if (!uploadRes.ok) {
        const text = await uploadRes.text();
        throw new Error(`Upload API error: ${uploadRes.status} - ${text}`);
      }
      const uploadJson = await uploadRes.json();
      const cidWithPrefix: string = uploadJson.cid;

      console.log("[LINK] Upload API response", uploadJson);

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

      console.log("[LINK] GRC-20 calldata response", json);

      const txPromise = async () => {
        const hash = await walletClient.sendTransaction({ to, data: data as `0x${string}` });
        const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });
        if (receipt.status === "reverted") {
          throw new Error("Transaction reverted");
        }
        console.log("[LINK] Transaction hash", hash);
        console.log("[LINK] Transaction receipt", receipt);
      };

      await toast.promise(txPromise(), {
        loading: "Submitting transaction...",
        success: "Transaction successful! Refreshing...",
        error: (err: Error) => `Error: ${err.message}`,
      });

      // Give a moment for the user to see the toast.
      await new Promise(resolve => setTimeout(resolve, 1000));
      window.location.reload();
    } catch (e: any) {
      setError(e.message);
      console.error("Failed to create relationship", e);
    } finally {
      setIsLinking(false);
      setLinkSource(null);
      setLinkTarget(null);
      setSelectedRelationType("");
      setRelationshipDescription("");
      setCustomRelationDetails("");
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
        let json = (await res.json()) as EntityRow[];

        // If toggle is on, only show the latest node and its relationships
        if (showOnlyLatest && json.length > 0) {
          // Find the latest timestamp
          const latestTimestamp = Math.max(...json.map(r => new Date(r.timestamp).getTime()));
          // Find the latest node(s)
          const latestNodes = json.filter(r => new Date(r.timestamp).getTime() === latestTimestamp);
          // Find relationships where fromEntity or toEntity is in latestNodes
          const latestNodeIds = new Set(latestNodes.map(n => n.entityId));
          json = json.filter(r =>
            latestNodeIds.has(r.entityId) ||
            latestNodeIds.has((r as any).fromEntity) ||
            latestNodeIds.has((r as any).toEntity)
          );
        }

        const childrenMap: Record<string, EntityRow[]> = json
          .filter(r => r.relatedTo)
          .reduce((acc, r) => {
            const parentId = r.relatedTo as string;
            if (!acc[parentId]) acc[parentId] = [];
            acc[parentId].push(r);
            return acc;
          }, {} as Record<string, EntityRow[]>);

        const mainEntities = json.filter(r => !r.relatedTo);

        const tempNodes: Node[] = mainEntities.map(r => {
          const childValues = childrenMap[r.entityId] || [];
          const descriptionObjects: { description: string; userAddress: string }[] = [];
          if (r.description) {
            descriptionObjects.push({ description: r.description, userAddress: r.userAddress });
          }
          childValues.forEach(c => {
            if (c.description) {
              descriptionObjects.push({ description: c.description, userAddress: c.userAddress });
            }
          });
          const aggregatedDescription = descriptionObjects.map(d => d.description).join("\n\n");

          const isRelationship = r.relationType || (r as any).fromEntity;
          const relationTypeInfo = isRelationship ? RELATION_TYPES.find(t => t.id === r.relationType) : undefined;

          return {
            id: r.entityId,
            type: "avatar",
            data: {
              label: relationTypeInfo?.label ?? truncate(r.name || r.entityId.slice(0, 8), 30),
              description: aggregatedDescription,
              descriptionObjects,
              user: r.userAddress,
              cid: r.cid,
              timestamp: r.timestamp,
              ops: r.opsJson ? JSON.parse(r.opsJson) : undefined,
              isConnectable: !isRelationship,
              isRelationship: isRelationship,
              handleAddNewKnowledge: handleAddNewKnowledge,
              style:
                isRelationship
                  ? { background: "#0f766e", color: "#ffffff", border: "1px solid #065f46" } // Green
                  : { background: "#1e3a8a", color: "#ffffff", border: "1px solid #1e40af" }, // Blue
            },
            position: { x: 0, y: 0 },
            draggable: true,
          };
        });

        const tempEdges: Edge[] = [];
        mainEntities.forEach(r => {
          // If it's a relationship, create the from/to edges
          if (r.opsJson) {
            try {
              const ops = JSON.parse(r.opsJson);
              const relOp = ops.find(
                (o: any) =>
                  o.type === "CREATE_RELATION" && (o.relation?.id === r.entityId || o.relation?.entity === r.entityId),
              );
              if (relOp) {
                tempEdges.push({
                  id: `${relOp.relation.fromEntity}->${r.entityId}`,
                  source: relOp.relation.fromEntity,
                  target: r.entityId,
                  style: { stroke: "#f59e0b", strokeWidth: 2 },
                  markerEnd: { type: MarkerType.ArrowClosed, color: "#f59e0b" },
                });
                tempEdges.push({
                  id: `${r.entityId}->${relOp.relation.toEntity}`,
                  source: r.entityId,
                  target: relOp.relation.toEntity,
                  style: { stroke: "#f59e0b", strokeWidth: 2 },
                  markerEnd: { type: MarkerType.ArrowClosed, color: "#f59e0b" },
                });
              }
            } catch {}
          } else if (r.relationType || (r as any).fromEntity) {
            tempEdges.push({
              id: `${(r as any).fromEntity}->${r.entityId}`,
              source: (r as any).fromEntity,
              target: r.entityId,
              style: { stroke: "#f59e0b", strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: "#f59e0b" },
            });
            tempEdges.push({
              id: `${r.entityId}->${(r as any).toEntity}`,
              source: r.entityId,
              target: (r as any).toEntity,
              style: { stroke: "#f59e0b", strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: "#f59e0b" },
            });
          }
        });

        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(tempNodes, tempEdges);

        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
      } catch {
        /* noop */
      }
    })();
  }, [handleAddNewKnowledge, showOnlyLatest]);

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
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypesMemo}
          connectionLineComponent={CustomConnectionLine}
          defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed, color: "#f59e0b" } }}
        >
          <Background />
          <Controls />
          <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10 }}>
            <button 
              className="btn btn-accent btn-md px-6 py-3 text-lg font-semibold" 
              onClick={() => setIsModalOpen(true)}
            >
              Add New Knowledge Category
            </button>
            <button
              className={`btn btn-outline btn-md ml-2 ${showOnlyLatest ? 'btn-primary' : ''}`}
              onClick={() => setShowOnlyLatest(v => !v)}
            >
              {showOnlyLatest ? 'Show All Nodes' : 'Show Only Latest Node'}
            </button>
          </div>
        </ReactFlow>
      </ReactFlowProvider>

      {selectedNode &&
        (() => {
          const isRelationship = selectedNode.data.isRelationship;
          const incomingEdge = isRelationship ? edges.find(edge => edge.target === selectedNode.id) : null;
          const outgoingEdge = isRelationship ? edges.find(edge => edge.source === selectedNode.id) : null;
          const sourceNode = incomingEdge ? nodes.find(node => node.id === incomingEdge.source) : null;
          const targetNode = outgoingEdge ? nodes.find(node => node.id === outgoingEdge.target) : null;

          return (
            <div className="modal modal-open">
              <div className="modal-box max-w-3xl">
                <div className="flex justify-end items-center mb-4">
                  <button className="btn btn-sm btn-circle" onClick={() => setSelectedNode(null)}>
                    ✕
                  </button>
                </div>
                <div className="space-y-4">
                  {isRelationship ? (
                    <>
                      <h3 className="font-bold text-xl">Relationship Details</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="font-semibold">Type</p>
                          <p>{selectedNode.data.label}</p>
                        </div>
                        <div>
                          <p className="font-semibold">Created</p>
                          <p>
                            {selectedNode.data.timestamp ? new Date(selectedNode.data.timestamp).toLocaleString() : "—"}
                          </p>
                        </div>
                        {sourceNode && (
                          <div>
                            <p className="font-semibold">From</p>
                            <p className="flex items-center gap-2">
                              <BlockieAvatar address={sourceNode.data.user} size={16} />
                              {sourceNode.data.label}
                            </p>
                          </div>
                        )}
                        {targetNode && (
                          <div>
                            <p className="font-semibold">To</p>
                            <p className="flex items-center gap-2">
                              <BlockieAvatar address={targetNode.data.user} size={16} />
                              {targetNode.data.label}
                            </p>
                          </div>
                        )}
                        <div>
                          <p className="font-semibold">Author</p>
                          {selectedNode.data.user && (
                            <div className="flex items-center gap-2">
                              <Address address={selectedNode.data.user} size="sm" />
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
                      {selectedNode.data.descriptionObjects && selectedNode.data.descriptionObjects.length > 0 && (
                        <div>
                          <p className="font-semibold">Additional Details</p>
                          <div className="bg-base-200 p-3 rounded-lg space-y-2">
                            {selectedNode.data.descriptionObjects.map(
                              (descObj: { userAddress: string; description: string }, index: number) => (
                                <div key={index} className="flex items-center gap-2">
                                  <BlockieAvatar address={descObj.userAddress} size={24} />
                                  <span>{descObj.description}</span>
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="font-semibold">Knowledge Category</p>
                          <p>{selectedNode.data.knowledgeCategoryName || selectedNode.data.label}</p>
                        </div>
                        <div>
                          <p className="font-semibold">Created</p>
                          <p>
                            {selectedNode.data.timestamp ? new Date(selectedNode.data.timestamp).toLocaleString() : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold">Author</p>
                          {selectedNode.data.user && (
                            <div className="flex items-center gap-2">
                              <Address address={selectedNode.data.user} size="sm" />
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
                      {selectedNode.data.descriptionObjects && selectedNode.data.descriptionObjects.length > 0 && (
                        <div>
                          <p className="font-semibold">Knowledge</p>
                          <div className="bg-base-200 p-3 rounded-lg space-y-2">
                            {selectedNode.data.descriptionObjects.map(
                              (descObj: { userAddress: string; description: string }, index: number) => (
                                <div key={index} className="flex items-center gap-2">
                                  <BlockieAvatar address={descObj.userAddress} size={24} />
                                  <span>{descObj.description}</span>
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      )}
                    </>
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
                            <p>
                              <strong>Name:</strong> {decodedData.name || "—"}
                            </p>
                            <p>
                              <strong>Author:</strong> {decodedData.author || "—"}
                            </p>
                            <p>
                              <strong>ID:</strong>{" "}
                              {decodedData.id
                                ? Array.from(decodedData.id as Uint8Array)
                                    .map((b: number) => b.toString(16).padStart(2, "0"))
                                    .join("")
                                : "—"}
                            </p>
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
          );
        })()}

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
                  setSelectedRelationType("");
                  setCustomRelationDetails("");
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
              setSelectedRelationType("");
              setCustomRelationDetails("");
            }}
          ></div>
        </div>
      )}

      <AddEntityModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        spaceId={spaceId}
        userAddress={userAddress}
        walletClient={walletClient}
      />
    </div>
  );
};

export default GraphPage; 