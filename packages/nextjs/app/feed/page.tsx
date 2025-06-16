"use client";

import { useEffect, useState } from "react";
import type { NextPage } from "next";
import { Address } from "~~/components/scaffold-eth";

interface EntityRow {
  id: number;
  entityId: string;
  spaceId: string;
  cid: string;
  name?: string;
  description?: string;
  userAddress: string;
  timestamp: string;
  opsJson?: string;
  relatedTo?: string;
  parentName?: string;
}

const FeedPage: NextPage = () => {
  const [rows, setRows] = useState<EntityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decodedData, setDecodedData] = useState<any>(null);
  const [isDecoding, setIsDecoding] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("http://localhost:4000/api/entities");
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const json = (await res.json()) as EntityRow[];
        setRows(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleViewCID = async (cid: string) => {
    setIsDecoding(true);
    setModalOpen(true);
    setDecodedData(null);
    
    try {
      // Strip ipfs:// prefix if present
      const cleanCid = cid.replace(/^ipfs:\/\//, "");
      
      // Fetch the binary data from IPFS
      const response = await fetch(`https://ipfs.io/ipfs/${cleanCid}`);
      if (!response.ok) throw new Error(`Failed to fetch IPFS data: ${response.status}`);
      
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Import the SDK Edit decoder
      const { Edit } = await import("@graphprotocol/grc-20/proto");
      
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

  return (
    <div className="max-w-4xl mx-auto mt-8 p-4">
      <h1 className="text-3xl font-bold mb-2 text-center">The Knowledge Feed</h1>
      <p className="text-center text-lg mb-6">
        Every entry below is a piece of knowledge added to a shared, decentralized graph.
      </p>
      <div className="text-center bg-base-200 p-4 rounded-xl mb-6">
        <h2 className="text-xl font-bold mb-2">The Start of a Knowledge Graph</h2>
        <p className="text-base-content/80">
          Think of this feed as a public whiteboard where anyone can add information. Each entry is a small, structured
          piece of data (an entity). The <b>GRC-20 standard</b> provides a simple recipe, or primitive, for creating
          and linking these entities together.
          <br />
          This demo shows how quickly we can build a collaborative knowledge graph—one entry at a time.
        </p>
      </div>
      {loading && <p>Loading…</p>}
      {error && <p className="text-error">❌ {error}</p>}
      {!loading && !error && (
        <table className="table w-full">
          <thead>
            <tr>
              <th className="text-left">When</th>
              <th className="text-left">Author</th>
              <th className="text-left">Knowledge Category</th>
              <th className="text-left">Description</th>
              <th className="text-left">CID</th>
              <th className="text-left">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="hover">
                <td>{new Date(row.timestamp).toLocaleString()}</td>
                <td>
                  <Address address={row.userAddress} size="sm" onlyEnsOrAddress disableAddressLink />
                </td>
                <td>{row.relatedTo ? row.parentName || "—" : row.name}</td>
                <td className="max-w-[200px] truncate">{row.description ?? "—"}</td>
                <td>
                  <button
                    className="link link-primary"
                    onClick={() => handleViewCID(row.cid)}
                  >
                    {row.cid.replace(/^ipfs:\/\//, "").slice(0, 8)}…
                  </button>
                </td>
                <td>
                  {row.opsJson && (
                    <details className="cursor-pointer">
                      <summary className="link link-primary">view</summary>
                      <pre className="bg-base-200 p-2 rounded text-xs whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                        {JSON.stringify(JSON.parse(row.opsJson), null, 2)}
                      </pre>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Modal for decoded IPFS data */}
      {modalOpen && (
        <div className="modal modal-open">
          <div className="modal-box max-w-4xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">Decoded Edit Data</h3>
              <button
                className="btn btn-sm btn-circle"
                onClick={() => setModalOpen(false)}
              >
                ✕
              </button>
            </div>
            
            {isDecoding ? (
              <div className="flex items-center justify-center py-8">
                <span className="loading loading-spinner loading-md"></span>
                <span className="ml-2">Decoding IPFS data...</span>
              </div>
            ) : decodedData ? (
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
                      <pre className="bg-base-300 p-3 rounded text-xs font-mono overflow-x-auto max-h-64">
                        {JSON.stringify(decodedData.ops, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="alert alert-info">
                <span>No data to display</span>
              </div>
            )}
          </div>
          <div className="modal-backdrop" onClick={() => setModalOpen(false)}></div>
        </div>
      )}
    </div>
  );
};

export default FeedPage; 