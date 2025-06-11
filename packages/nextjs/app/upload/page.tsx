"use client";

import { useState } from "react";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata = getMetadata({
  title: "Upload Knowledge",
  description: "Create entities and publish to the Geo Genesis knowledge graph",
});

const UploadPage: NextPage = () => {
  const { address, isConnected } = useAccount();
  const [json, setJson] = useState<string>("[]");
  const [loading, setLoading] = useState(false);
  const [cid, setCid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setCid(null);
    try {
      setLoading(true);
      const edits = JSON.parse(json);
      const res = await fetch("http://localhost:4000/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress: address, edits }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setCid(data.cid);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-8 p-4">
      <h1 className="text-3xl font-bold mb-4">Upload Knowledge</h1>
      {!isConnected && <p className="text-red-500">Connect your wallet to continue.</p>}
      <textarea
        className="textarea textarea-bordered w-full h-64 mb-4"
        value={json}
        onChange={e => setJson(e.target.value)}
        placeholder="Paste array of GRC-20 ops JSON here"
      />
      <button className="btn btn-primary" disabled={!isConnected || loading} onClick={handleSubmit}>
        {loading ? "Uploading..." : "Publish"}
      </button>
      {cid && (
        <div className="mt-4 alert alert-success">
          ✅ Upload success! CID: <code>{cid}</code>
        </div>
      )}
      {error && <div className="mt-4 alert alert-error">❌ {error}</div>}
      <div className="mt-6 bg-base-200 p-4 rounded">
        <p className="text-sm">
          For now, provide the <code>ops</code> array generated with <code>@graphprotocol/grc-20</code> in JSON format.
          A friendlier UI will come soon!
        </p>
      </div>
    </div>
  );
};

export default UploadPage;
