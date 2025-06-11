// GRC-20 Knowledge Graph Quickstart
"use client";

import { useState } from "react";
// @ts-ignore
import { Graph } from "@graphprotocol/grc-20";
import { useAccount, useWalletClient } from "wagmi";

// GRC-20 Knowledge Graph Quickstart

// GRC-20 Knowledge Graph Quickstart

// GRC-20 Knowledge Graph Quickstart

// GRC-20 Knowledge Graph Quickstart

// GRC-20 Knowledge Graph Quickstart

// GRC-20 Knowledge Graph Quickstart

// GRC-20 Knowledge Graph Quickstart

// GRC-20 Knowledge Graph Quickstart

// GRC-20 Knowledge Graph Quickstart

// GRC-20 Knowledge Graph Quickstart

const Home = () => {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [spaceId, setSpaceId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [cid, setCid] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!walletClient || !address) return;
    setError(null);
    setCid(null);
    setTxHash(null);
    setLoading(true);
    try {
      // 1. Build ops with GRC SDK
      const { ops } = Graph.createEntity({ name, description });

      // 2. Send ops to backend to publish to IPFS & store contribution record
      const uploadRes = await fetch("http://localhost:4000/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress: address, edits: ops }),
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadJson.error || "Upload failed");
      const cid = uploadJson.cid as string;
      setCid(cid);

      // 3. If user provided spaceId, publish on-chain
      if (spaceId) {
        const metaRes = await fetch(`https://api-testnet.grc-20.thegraph.com/space/${spaceId}/edit/calldata`, {
          method: "POST",
          body: JSON.stringify({ cid, network: "TESTNET" }),
          headers: { "Content-Type": "application/json" },
        });
        const { to, data } = await metaRes.json();
        const hash = await walletClient.sendTransaction({ to, data: data as `0x${string}` });
        setTxHash(hash as string);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-10 p-4 space-y-6">
      <h1 className="text-4xl font-bold text-center mb-2">GRC-20 Knowledge Graph Quickstart</h1>
      <p className="text-center text-lg mb-4">
        This starter lets you <b>publish knowledge to the Geo Genesis testnet</b> using the GRC-20 SDK.
        <br />
        Try it live below, or explore the code in <code>packages/nextjs/app/page.tsx</code>.
      </p>
      <div className="bg-base-200 p-4 rounded-xl space-y-4">
        <div className="flex flex-col gap-2">
          <input
            className="input input-bordered w-full"
            placeholder="Space ID (optional)"
            value={spaceId}
            onChange={e => setSpaceId(e.target.value)}
          />
          <input
            className="input input-bordered w-full"
            placeholder="Entity Name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <textarea
            className="textarea textarea-bordered w-full"
            placeholder="Entity Description"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>
        <button className="btn btn-primary w-full" disabled={!isConnected || loading || !name} onClick={handleSubmit}>
          {loading ? "Publishing..." : "Publish to GRC-20"}
        </button>
        {cid && <div className="alert alert-success whitespace-pre-wrap">✅ Edit published to IPFS: {cid}</div>}
        {txHash && (
          <div className="alert alert-info">📜 On-chain tx sent: {txHash.slice(0, 10)}... (check Geo Explorer)</div>
        )}
        {error && <div className="alert alert-error">❌ {error}</div>}
      </div>
      <div className="mt-8 text-center text-sm text-base-content/70">
        <b>How it works:</b> This UI uses the <code>@graphprotocol/grc-20</code> SDK to create an entity, sends it to
        the backend for IPFS publishing, and (optionally) posts the edit on-chain to a GRC-20 space.
        <br />
        <a href="https://www.npmjs.com/package/@graphprotocol/grc-20" target="_blank" className="link">
          SDK docs
        </a>{" "}
        <a
          href="https://github.com/yanivtal/graph-improvement-proposals/blob/new-ops/grcs/0020-knowledge-graph.md"
          target="_blank"
          className="link"
        >
          GRC-20 spec
        </a>
      </div>
    </div>
  );
};

export default Home;
