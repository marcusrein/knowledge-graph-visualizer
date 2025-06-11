"use client";

import { useMemo } from "react";
import type { NextPage } from "next";
import { useScaffoldEventHistory } from "~~/hooks/scaffold-eth";

interface LeaderboardRow {
  userAddress: string;
  points: bigint;
}

const LeaderboardPage: NextPage = () => {
  const {
    data: events,
    isLoading: isLoading,
    error: error,
  } = useScaffoldEventHistory({
    contractName: "ContributionTracker",
    eventName: "ContributionReported",
    fromBlock: 0n,
  });

  const leaderboardData = useMemo(() => {
    if (!events) return [];
    const points = new Map<string, bigint>();
    for (const event of events) {
      const { contributor, points: p } = event.args;
      if (contributor && p) {
        points.set(contributor, (points.get(contributor) || 0n) + p);
      }
    }
    return Array.from(points.entries())
      .map(([userAddress, points]) => ({ userAddress, points }))
      .sort((a, b) => Number(b.points - a.points));
  }, [events]);

  return (
    <div className="max-w-3xl mx-auto mt-8 p-4">
      <h1 className="text-3xl font-bold mb-6">On-Chain Leaderboard</h1>
      {isLoading && <p>Loading...</p>}
      {error && <p className="text-error">❌ {error.message}</p>}
      {!isLoading && !error && (
        <table className="table w-full">
          <thead>
            <tr>
              <th className="text-left">Rank</th>
              <th className="text-left">Address</th>
              <th className="text-right">Points</th>
            </tr>
          </thead>
          <tbody>
            {leaderboardData.map((row, idx) => (
              <tr key={row.userAddress} className="hover">
                <td>{idx + 1}</td>
                <td>{row.userAddress}</td>
                <td className="text-right">{row.points.toString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default LeaderboardPage;
