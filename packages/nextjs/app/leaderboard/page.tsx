"use client";

import { useEffect, useState } from "react";
import type { NextPage } from "next";

interface LeaderboardRow {
  userAddress: string;
  points: string | number;
}

const LeaderboardPage: NextPage = () => {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        const res = await fetch("http://localhost:4000/api/leaderboard");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to fetch");
        setRows(data);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }

    fetchLeaderboard();
  }, []);

  return (
    <div className="max-w-3xl mx-auto mt-8 p-4">
      <h1 className="text-3xl font-bold mb-6">Leaderboard</h1>
      {loading && <p>Loading...</p>}
      {error && <p className="text-error">❌ {error}</p>}
      {!loading && !error && (
        <table className="table w-full">
          <thead>
            <tr>
              <th className="text-left">Rank</th>
              <th className="text-left">Address</th>
              <th className="text-right">Points</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.userAddress} className="hover">
                <td>{idx + 1}</td>
                <td>{row.userAddress}</td>
                <td className="text-right">{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default LeaderboardPage;
