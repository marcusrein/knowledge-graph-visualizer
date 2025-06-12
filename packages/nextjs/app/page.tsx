// GRC-20 Knowledge Graph Quickstart
"use client";

import { useState, useEffect, useCallback } from "react";
import { Graph } from "@graphprotocol/grc-20";
import { useAccount, useWalletClient } from "wagmi";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import type { Op } from "@graphprotocol/grc-20";

const Home = () => {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [contributionTxHash, setContributionTxHash] = useState<string | null>(null);

  // Start with no space selected so the user is prompted to create a personal space on first visit.
  const [spaceId, setSpaceId] = useState<string>("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [cid, setCid] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastOps, setLastOps] = useState<Op[] | null>(null);
  const [entityId, setEntityId] = useState<string | null>(null);
  const [isCreatingSpace, setIsCreatingSpace] = useState(false);

  const { writeContractAsync: writeContributionTracker } = useScaffoldWriteContract("ContributionTracker");

  useEffect(() => {
    const savedSpaceId = localStorage.getItem("personalSpaceId");
    if (savedSpaceId) {
      setSpaceId(savedSpaceId);
    }
  }, []);

  const handleCreateSpace = useCallback(async () => {
    if (!address) return;
    setIsCreatingSpace(true);
    setError(null);

    try {
      console.time("create-space");
      /* 👇 show full request payload in console so we can reproduce it with curl  */
      const payload = {
        initialEditorAddress: address,
        spaceName: `Personal Space for ${address.slice(0, 6)}`,
        network: "TESTNET",
      };
      console.log("Graph.createSpace payload →", payload);

      /* cast to any because SDK types lag behind */
      const newSpaceId: string = await (Graph as any).createSpace(
        payload as any,
      );
      console.timeEnd("create-space");

      setSpaceId(newSpaceId);
      localStorage.setItem("personalSpaceId", newSpaceId);
    } catch (e: any) {
      /* 🔍 dump everything we can get hold of */
      console.error("createSpace failed", e);
      if (e?.response) {
        console.error("status", e.response.status);
        console.error("body", await e.response.text?.());
      }
      setError(
        e?.message ||
          e?.response?.statusText ||
          "Graph.createSpace returned 500 - see dev-console",
      );
    } finally {
      setIsCreatingSpace(false);
    }
  }, [address]);

  const handleSubmit = useCallback(async () => {
    if (!walletClient || !address || !spaceId) return;
    setError(null);
    setCid(null);
    setTxHash(null);
    setContributionTxHash(null);
    setLastOps(null);
    setEntityId(null);
    setLoading(true);
    try {
      // 1. Build ops with GRC SDK
      const { id: newEntityId, ops } = Graph.createEntity({ name, description });
      setLastOps(ops);
      setEntityId(newEntityId);

      // 2. Send ops to backend to publish to IPFS & store contribution record
      const uploadRes = await fetch("http://localhost:4000/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress: address, edits: ops }),
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadJson.error || "Upload failed");
      const cidWithPrefix: string = uploadJson.cid;
      setCid(cidWithPrefix.replace(/^ipfs:\/\//, ""));

      // Add a 2-second delay to allow IPFS to propagate
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 3. If user provided spaceId, publish on-chain
      if (spaceId) {
        const metaRes = await fetch(
          `https://api-testnet.grc-20.thegraph.com/space/${spaceId}/edit/calldata`,
          {
            method: "POST",
            body: JSON.stringify({ cid: cidWithPrefix, network: "TESTNET" }),
            headers: { "Content-Type": "application/json" },
          },
        );
        const { to, data } = await metaRes.json();
        const hash = await walletClient.sendTransaction({ to, data: data as `0x${string}` });
        setTxHash(hash as string);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [address, description, name, spaceId, walletClient]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        if (isConnected && !loading && name) {
          handleSubmit();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isConnected, loading, name, handleSubmit]);

  return (
    <div className="max-w-2xl mx-auto mt-10 p-4 space-y-6">
      <h1 className="text-4xl font-bold text-center mb-2">GRC-20 Knowledge Graph Quickstart</h1>
      <p className="text-center text-lg mb-4">
        This starter lets you <b>publish knowledge to the Geo Genesis testnet</b> using the GRC-20 SDK.
        <br />
        Try it live below, or explore the code in <code>packages/nextjs/app/page.tsx</code>.
      </p>

      {!spaceId && isConnected && (
        <div className="bg-base-200 p-4 rounded-xl text-center">
          <p className="mb-2">To begin, create your own personal knowledge space.</p>
          <button className="btn btn-primary" onClick={handleCreateSpace} disabled={isCreatingSpace}>
            {isCreatingSpace ? "Creating..." : "Create Your Personal Space"}
          </button>
        </div>
      )}

      {spaceId && (
        <div className="bg-base-200 p-4 rounded-xl space-y-4">
          <div className="text-center text-sm text-base-content/80">
            Publishing to your space: <code className="bg-neutral p-1 rounded-md text-accent">{spaceId}</code>
          </div>
          <div className="flex flex-col gap-2">
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
          {cid && !contributionTxHash && (
            <div className="alert alert-success shadow-lg rounded-lg flex flex-col space-y-6 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex-1 space-y-1">
                  <p className="font-bold text-lg">✅ Edit published to IPFS</p>
                  <a
                    href={`https://gateway.ipfs.io/ipfs/${cid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link link-primary break-all text-sm md:text-base"
                  >
                    {cid}
                  </a>
                </div>
                <div className="flex items-center flex-wrap gap-2">
                  {entityId && spaceId && (
                    <a
                      href={`https://www.geobrowser.io/space/${spaceId}/${entityId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary btn-sm md:btn-md"
                    >
                      View on Geo Browser
                    </a>
                  )}
                  <button
                    className="btn btn-primary btn-sm md:btn-md"
                    onClick={async () => {
                      try {
                        await writeContributionTracker({ functionName: "reportContribution", args: [address, 1n] });
                        setContributionTxHash("Success!");
                      } catch (e: any) {
                        setError(e.message);
                      }
                    }}
                  >
                    Add to On-Chain Leaderboard
                  </button>
                </div>
              </div>
              {lastOps && (
                <details className="bg-base-100 text-base-content rounded-lg p-4">
                  <summary className="font-semibold cursor-pointer">View Raw Ops JSON</summary>
                  <pre className="mt-2 bg-base-200 p-3 rounded-lg text-xs font-mono overflow-x-auto max-h-64">
                    {JSON.stringify(lastOps, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}
          {cid && contributionTxHash && (
            <div className="alert alert-info">✅ Contribution sent to leaderboard!</div>
          )}
          {txHash && (
            <div className="alert alert-info">📜 On-chain tx sent: {txHash.slice(0, 10)}... (check Geo Explorer)</div>
          )}
          {error && <div className="alert alert-error">❌ {error}</div>}
        </div>
      )}
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
