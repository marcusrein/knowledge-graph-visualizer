import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import knex from "knex";
import { Graph, Ipfs } from "@graphprotocol/grc-20";
import path from "path";
import { ethers } from "ethers";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Simple SQLite connection using Knex
const db = knex({
  client: "sqlite3",
  connection: {
    filename: path.join(__dirname, "../data/leaderboard.db"),
  },
  useNullAsDefault: true,
});

// Ensure leaderboard table exists
async function ensureDb() {
  const exists = await db.schema.hasTable("contributions");
  if (!exists) {
    await db.schema.createTable("contributions", (table) => {
      table.increments("id").primary();
      table.string("userAddress").notNullable();
      table.integer("triplesCount").notNullable();
      table.datetime("timestamp").notNullable();
    });
  }
}
ensureDb();

// Optional on-chain ContributionTracker integration
const trackerAddress = process.env.TRACKER_CONTRACT_ADDRESS;
const privateKey = process.env.PRIVATE_KEY; // backend signer private key (dev only)
const rpcUrl = process.env.NEXT_PUBLIC_GEOGENESIS_RPC_URL;

let trackerContract: any = null;
if (trackerAddress && privateKey && rpcUrl) {
  const abi = [
    "function reportContribution(address contributor,uint256 points) external",
  ];
  // Using any to accommodate ethers v5/v6 difference
  const provider = new (ethers as any).JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  trackerContract = new ethers.Contract(trackerAddress as string, abi, wallet);
}

// POST /api/upload
app.post("/api/upload", async (req, res) => {
  try {
    const { userAddress, edits } = req.body as any;

    if (!userAddress || !Array.isArray(edits)) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    // For now, assume edits is already an array of ops in GRC-20 format
    const { cid } = await Ipfs.publishEdit({
      name: `Upload from ${userAddress}`,
      ops: edits as any,
      author: userAddress,
    });

    // TODO: push on-chain transaction here using Graph SDK if desired

    // Save contribution record
    await db("contributions").insert({
      userAddress: userAddress.toLowerCase(),
      triplesCount: edits.length,
      timestamp: new Date().toISOString(),
    });

    // Optionally report on-chain
    if (trackerContract) {
      try {
        // @ts-ignore – Address type widen for generic tx
        const tx = await (trackerContract as any).reportContribution(userAddress, edits.length);
        console.log("ContributionTracker tx", tx.hash);
      } catch (err) {
        console.warn("Tracker contract call failed", err);
      }
    }

    return res.json({ cid });
  } catch (error: any) {
    console.error("Upload error", error);
    return res.status(500).json({ error: error.message || "Internal error" });
  }
});

// GET /api/leaderboard
app.get("/api/leaderboard", async (_req, res) => {
  try {
    const rows = await db("contributions")
      .select("userAddress")
      .sum({ points: "triplesCount" })
      .groupBy("userAddress")
      .orderBy("points", "desc")
      .limit(100);

    return res.json(rows);
  } catch (error: any) {
    console.error("Leaderboard error", error);
    return res.status(500).json({ error: error.message || "Internal error" });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend API listening on http://localhost:${PORT}`);
}); 