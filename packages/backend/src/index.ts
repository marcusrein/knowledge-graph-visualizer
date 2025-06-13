import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import knex from "knex";
import { Graph, Ipfs } from "@graphprotocol/grc-20";
import path from "path";
import { ethers } from "ethers";
import fs from "fs";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Ensure data directory exists (writeable even when compiled)
const dataDir = path.join(process.cwd(), "packages/backend/data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Simple SQLite connection using Knex
const db = knex({
  client: "sqlite3",
  connection: {
    filename: path.join(dataDir, "leaderboard.db"),
  },
  useNullAsDefault: true,
});

// Ensure leaderboard table exists
async function ensureDb() {
  const hasContrib = await db.schema.hasTable("contributions");
  if (!hasContrib) {
    await db.schema.createTable("contributions", table => {
      table.increments("id").primary();
      table.string("userAddress").notNullable();
      table.integer("triplesCount").notNullable();
      table.datetime("timestamp").notNullable();
    });
  }

  const hasEntities = await db.schema.hasTable("entities");
  if (!hasEntities) {
    await db.schema.createTable("entities", table => {
      table.increments("id").primary();
      table.string("entityId").notNullable();
      table.string("spaceId").notNullable();
      table.string("cid").notNullable();
      table.string("name");
      table.text("description");
      table.string("userAddress").notNullable();
      table.datetime("timestamp").notNullable();
    });
  }
}
ensureDb();

// Optional on-chain ContributionTracker integration
const trackerAddress = process.env.TRACKER_CONTRACT_ADDRESS;
const privateKey = process.env.PRIVATE_KEY; // backend signer private key (dev only)
const rpcUrl = process.env.SEPOLIA_RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/oKxs-03sij-U_N0iOlrSsZFr29-IqbuF";

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
  const { userAddress, edits, entityId, name, description, spaceId } = req.body;

  if (!userAddress || !edits) {
    return res.status(400).json({ error: "Missing userAddress or edits" });
  }

  try {
    const result = await Ipfs.publishEdit({
      name: `Upload from ${userAddress}`,
      ops: edits,
      author: userAddress,
    });

    const cidString = result.cid.toString();

    // Save contribution record
    await db("contributions").insert({
      userAddress: userAddress.toLowerCase(),
      triplesCount: edits.length,
      timestamp: new Date().toISOString(),
    });

    // Save entity record if provided
    if (entityId && spaceId) {
      await db("entities").insert({
        entityId,
        spaceId,
        cid: cidString,
        name,
        description,
        userAddress: userAddress.toLowerCase(),
        timestamp: new Date().toISOString(),
      });
    }

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

    res.json({ cid: cidString });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET recent entities
app.get("/api/entities", async (_req, res) => {
  try {
    const rows = await db("entities").orderBy("timestamp", "desc").limit(100);
    res.json(rows);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend API listening on http://localhost:${PORT}`);
}); 