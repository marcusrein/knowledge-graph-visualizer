"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { NextPage } from "next";
import { nanoid } from "nanoid";

const ReactFlow = dynamic(() => import("reactflow").then(mod => mod.ReactFlow), {
  ssr: false,
});
const Background = dynamic(() => import("reactflow").then(mod => mod.Background), { ssr: false });
const Controls = dynamic(() => import("reactflow").then(mod => mod.Controls), { ssr: false });

import "reactflow/dist/style.css";

type EntityRow = {
  entityId: string;
  name?: string;
  description?: string;
  relatedTo?: string | null;
};

const GraphPage: NextPage = () => {
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("http://localhost:4000/api/entities");
        if (!res.ok) return;
        const json = (await res.json()) as EntityRow[];
        const n = json.map(row => ({
          id: row.entityId,
          data: { label: row.name || row.entityId.slice(0, 6) },
          position: { x: Math.random() * 400, y: Math.random() * 400 },
        }));
        const e = json
          .filter(r => r.relatedTo)
          .map(r => ({ id: nanoid(6), source: r.relatedTo as string, target: r.entityId }));
        setNodes(n);
        setEdges(e);
      } catch {
        /* noop */
      }
    })();
  }, []);

  return (
    <div style={{ height: "90vh", width: "100%" }}>
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
};

export default GraphPage; 