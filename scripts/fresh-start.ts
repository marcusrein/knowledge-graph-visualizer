// scripts/fresh-start.ts
// @ts-nocheck  // Rapid utility script – we don't need full type-safety here
import { Graph } from "@graphprotocol/grc-20";
import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";

// Load existing env (in case user already has RPC URLs, etc.)
dotenv.config();

function wipeLocalDatabase() {
  const dbPath = path.join(__dirname, "..", "packages", "backend", "data", "leaderboard.db");
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log(`🧹  Removed local database at ${dbPath}`);
  } else {
    console.log("ℹ️  No existing local database found – skipping delete.");
  }
}

async function createNewSpace(spaceName: string, editorAddress: string, network: "TESTNET" | "MAINNET") {
  console.log(`🚀 Creating PERSONAL space '${spaceName}' for ${editorAddress} on ${network}…`);
  const res: { id: string } = await (Graph as any).createSpace({
    name: spaceName,
    editorAddress,
    network,
  });
  console.log("✅  New space id:", res.id);
  return res.id;
}

function writeEnvVariable(spaceId: string) {
  const envPath = path.join(__dirname, "..", ".env.local");

  let lines: string[] = [];
  if (fs.existsSync(envPath)) {
    lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    // Remove any previous definition
    lines = lines.filter(line => !line.startsWith("PERSONAL_SPACE_ID="));
  }
  lines.push(`PERSONAL_SPACE_ID=${spaceId}`);
  fs.writeFileSync(envPath, lines.filter(Boolean).join("\n") + "\n");
  console.log(`✍️  Wrote PERSONAL_SPACE_ID to ${envPath}`);
}

async function main() {
  const [editorAddress, ...rest] = process.argv.slice(2);
  if (!editorAddress) {
    console.log("Usage: yarn fresh-start <editorAddress> [spaceName] [TESTNET|MAINNET]");
    process.exit(1);
  }

  const spaceName = rest[0] ?? `Personal Space ${Date.now()}`;
  const network = (rest[1] ?? "TESTNET") as "TESTNET" | "MAINNET";

  try {
    wipeLocalDatabase();
    const spaceId = await createNewSpace(spaceName, editorAddress, network);
    writeEnvVariable(spaceId);
    console.log("🎉 Fresh start complete! Restart your backend & frontend and you're good to go.");
  } catch (err) {
    console.error("❌  Fresh start failed:", err);
    process.exit(1);
  }
}

main(); 