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
const rpcUrl = process.env.NEXT_PUBLIC_GEOGENESIS_RPC_URL || "https://rpc-geo-genesis-h0q2s21xx8.t.conduit.xyz";

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
  const { userAddress, edits } = req.body;

  if (!userAddress || !edits) {
    return res.status(400).json({ error: "Missing userAddress or edits" });
  }

  try {
    const cid = await Ipfs.publishEdit({
      name: `Upload from ${userAddress}`,
      ops: edits,
      author: userAddress,
    });

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

    res.json({ cid });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend API listening on http://localhost:${PORT}`);
}); 