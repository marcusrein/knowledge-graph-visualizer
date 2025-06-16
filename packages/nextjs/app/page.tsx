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
  const [relatedTo, setRelatedTo] = useState<string | "">("");
  const [entitiesList, setEntitiesList] = useState<Array<{entityId:string; name:string}>>([]);
  const [stats, setStats] = useState<{totalValues:number; edits:number} | null>(null);

  const { writeContractAsync: writeContributionTracker } = useScaffoldWriteContract({
    contractName: "ContributionTracker",
  });

  useEffect(() => {
    const savedSpaceId = localStorage.getItem("personalSpaceId");
    if (savedSpaceId) {
      setSpaceId(savedSpaceId);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("http://localhost:4000/api/entities");
        if (res.ok) {
          const json = await res.json();
          setEntitiesList(json.map((r:any)=>({entityId:r.entityId,name:r.name||r.entityId.slice(0,6)})));
        }
      } catch {}
    })();
  }, []);

  const handleCreateSpace = useCallback(async () => {
    if (!address) return;
    setIsCreatingSpace(true);
    setError(null);

    // If we already resolved a space for this wallet in localStorage, just use it.
    const cached = localStorage.getItem("personalSpaceId");
    if (cached) {
      setSpaceId(cached);
      setIsCreatingSpace(false);
      return;
    }

    try {
      console.time("create-space");
      const { deploySpace } = await import("../utils/grc20/deploySpace");

      const newSpaceId = await deploySpace({
        spaceName: `Personal Space for ${address.slice(0, 6)}`,
        initialEditorAddress: address,
      });
      console.timeEnd("create-space");

      setSpaceId(newSpaceId);
      localStorage.setItem("personalSpaceId", newSpaceId);
    } catch (e: any) {
      /* 🔍 If the space already exists, the API typically returns a 409 or a message that contains the existing id.
         Attempt to detect and recover so users don't accidentally create multiple spaces. */
      try {
        const bodyText = await e?.response?.text?.();
        const idMatch = bodyText?.match(/([a-zA-Z0-9]{32,})/); // crude id pattern matcher
        if (idMatch) {
          const existingId = idMatch[1];
          setSpaceId(existingId);
          localStorage.setItem("personalSpaceId", existingId);
          setError(null);
          return;
        }
      } catch {}

      console.error("createSpace failed", e);
      setError(
        e?.message ||
          e?.response?.statusText ||
          "Graph.createSpace returned an error – see dev-console",
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
      const entityName = name || (relatedTo ? `Contribution to ${relatedTo.slice(0, 6)}` : "Untitled");
      const { id: newEntityId, ops } = Graph.createEntity({ name: entityName, description });
      setLastOps(ops);
      setEntityId(newEntityId);

      // 2. Send ops to backend to publish to IPFS & store contribution record
      const uploadRes = await fetch("http://localhost:4000/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: address,
          edits: ops,
          entityId: newEntityId,
          name,
          description,
          spaceId,
          relatedTo: relatedTo || undefined,
        }),
      });
      let uploadJson: any = null;
      if (!uploadRes.ok) {
        const text = await uploadRes.text();
        console.error("Upload API error:", uploadRes.status, text);
        setError(`Upload API error: ${uploadRes.status} - ${text}`);
        setLoading(false);
        return;
      }
      try {
        uploadJson = await uploadRes.json();
      } catch (err) {
        console.error("Upload API returned non-JSON:", err);
        setError("Upload API returned non-JSON response");
        setLoading(false);
        return;
      }
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
        if (!metaRes.ok) {
          const text = await metaRes.text();
          console.error("GRC-20 API error:", metaRes.status, text);
          setError(`GRC-20 API error: ${metaRes.status} - ${text}`);
          setLoading(false);
          return;
        }
        let json: any = null;
        try {
          json = await metaRes.json();
        } catch (err) {
          console.error("GRC-20 API returned non-JSON:", err);
          setError("GRC-20 API returned non-JSON response");
          setLoading(false);
          return;
        }
        const { to, data } = json;
        const hash = await walletClient.sendTransaction({ to, data: data as `0x${string}` });
        setTxHash(hash as string);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [address, description, name, spaceId, walletClient, relatedTo]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        if (isConnected && !loading && (name || relatedTo !== "")) {
          handleSubmit();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isConnected, loading, name, relatedTo, handleSubmit]);

  useEffect(() => {
    if (!address) {
      setStats(null);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`http://localhost:4000/api/contributions?user=${address}`);
        if (res.ok) {
          const json = await res.json();
          setStats({edits: json.edits, totalValues: json.totalValues});
        }
      } catch {}
    })();
  }, [address, contributionTxHash, cid]);

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
          {entitiesList.length > 0 && (
            <select
              className="select select-bordered w-full"
              value={relatedTo}
              onChange={e => {
                setRelatedTo(e.target.value);
                // If contributing to existing entity, clear the name field to signal a contribution flow.
                if (e.target.value) {
                  setName("");
                }
              }}
            >
              <option value="">(Optional) Contribute to an existing knowledge category</option>
              {entitiesList.map(ent => (
                <option key={ent.entityId} value={ent.entityId}>
                  {ent.name}
                </option>
              ))}
            </select>
          )}
          {relatedTo === "" && (
            <input
              className="input input-bordered w-full"
              placeholder="Knowledge Category"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          )}
          <textarea
            className="textarea textarea-bordered w-full"
            placeholder={relatedTo ? "Add your knowledge to the selected category…" : "Share your knowledge!"}
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
          <button
            className="btn btn-primary w-full"
            disabled={!isConnected || loading || (!name && relatedTo === "")}
            onClick={handleSubmit}
          >
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
                  {/* Geo Browser link disabled until service stabilizes */}
                  
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
                {entityId && (
                  <span className="badge badge-outline text-xs">ID: {entityId.slice(0, 8)}…</span>
                )}
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
          {stats && (
            <div className="alert alert-info shadow-md">
              📊 You have published <b>{stats.edits}</b> edits totaling <b>{stats.totalValues}</b> values.
            </div>
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
