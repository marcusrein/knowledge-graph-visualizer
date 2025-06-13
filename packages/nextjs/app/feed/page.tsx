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
}

const FeedPage: NextPage = () => {
  const [rows, setRows] = useState<EntityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
              <th className="text-left">Name</th>
              <th className="text-left">Description</th>
              <th className="text-left">CID</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="hover">
                <td>{new Date(row.timestamp).toLocaleString()}</td>
                <td>
                  <Address address={row.userAddress} size="sm" onlyEnsOrAddress />
                </td>
                <td>{row.name ?? "—"}</td>
                <td className="max-w-[200px] truncate">{row.description ?? "—"}</td>
                <td>
                  <a
                    href={`https://gateway.ipfs.io/ipfs/${row.cid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link"
                  >
                    {row.cid.slice(0, 8)}…
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default FeedPage; 