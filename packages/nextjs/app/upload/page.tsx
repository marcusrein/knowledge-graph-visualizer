// Quick Knowledge Upload Page
"use client";

import { useState } from "react";
// @ts-ignore
import { Graph } from "@graphprotocol/grc-20";
import type { NextPage } from "next";
import { useAccount, useWalletClient } from "wagmi";

// Quick Knowledge Upload Page

// Quick Knowledge Upload Page

// Quick Knowledge Upload Page

// Quick Knowledge Upload Page

// Quick Knowledge Upload Page

// Quick Knowledge Upload Page

// Quick Knowledge Upload Page

// Quick Knowledge Upload Page

// Quick Knowledge Upload Page

// Quick Knowledge Upload Page

const UploadPage: NextPage = () => {
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
        body: JSON.stringify({
          userAddress: address,
          edits: ops,
          name,
          description,
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
      const cid = uploadJson.cid as string;
      setCid(cid);

      // 3. If user provided spaceId, publish on-chain
      if (spaceId) {
        const metaRes = await fetch(`https://api-testnet.grc-20.thegraph.com/space/${spaceId}/edit/calldata`, {
          method: "POST",
          body: JSON.stringify({ cid, network: "TESTNET" }),
          headers: { "Content-Type": "application/json" },
        });
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
      console.error(e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-8 p-4 space-y-4">
      <h1 className="text-3xl font-bold">Quick Knowledge Upload</h1>
      {!isConnected && <p className="text-error">Connect your wallet to continue.</p>}

      <input
        className="input input-bordered w-full"
        placeholder="Space ID (optional)"
        value={spaceId}
        onChange={e => setSpaceId(e.target.value)}
      />
      <input
        className="input input-bordered w-full"
        placeholder="New Knowledge Category"
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <textarea
        className="textarea textarea-bordered w-full"
        placeholder="Share your knowledge!"
        value={description}
        onChange={e => setDescription(e.target.value)}
      />

      <button className="btn btn-primary" disabled={!isConnected || loading || !name} onClick={handleSubmit}>
        {loading ? "Publishing..." : "Publish to GRC-20"}
      </button>

      {cid && <div className="alert alert-success whitespace-pre-wrap">✅ Edit published to IPFS: {cid}</div>}
      {txHash && (
        <div className="alert alert-info">📜 On-chain tx sent: {txHash.slice(0, 10)}... (check Geo Explorer)</div>
      )}
      {error && <div className="alert alert-error">❌ {error}</div>}
    </div>
  );
};

export default UploadPage;
