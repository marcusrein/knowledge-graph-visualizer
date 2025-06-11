import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import knex from "knex";
import { Graph, Ipfs } from "@graphprotocol/grc-20";
import path from "path";

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

// POST /api/upload
app.post("/api/upload", async (req, res) => {
  try {
    const { userAddress, edits } = req.body as {
      userAddress: string;
      edits: Array<unknown>; // expecting array of ops or instructions
    };

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