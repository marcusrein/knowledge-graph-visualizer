// Lightweight replacement for the standalone Express backend.
// This route accepts knowledge edits, publishes them to IPFS using the GRC-20 SDK,
// and stores a minimal in-memory log so `/api/entities` can show recent items.

import { NextRequest, NextResponse } from "next/server";
import { Ipfs } from "@graphprotocol/grc-20";

// Simple in-memory store.  In dev mode the Node process is long-lived so this
// is good enough for tinkering.  (If the server restarts the history is lost.)
interface EntityRecord {
  entityId: string;
  spaceId: string;
  cid: string;
  name?: string;
  description?: string;
  relatedTo?: string | null;
  opsJson: string;
  userAddress: string;
  timestamp: string;
  relationType?: string;
}

// We export it so the /api/entities route can share the same reference.
export const entitiesLog: EntityRecord[] = [];

export const dynamic = "force-dynamic"; // Always run on server, not edge.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const {
      userAddress,
      edits,
      entityId,
      name,
      description,
      spaceId,
      relatedTo,
      opsJson,
      relationType,
    } = await req.json();

    if (!userAddress || !edits) {
      return NextResponse.json({ error: "Missing userAddress or edits" }, { status: 400 });
    }

    // Publish to IPFS via GRC-20 helper.
    const result = await Ipfs.publishEdit({
      name: `Upload from ${userAddress}`,
      ops: edits,
      author: userAddress,
    });

    const cidString = result.cid.toString();

    // Store in log for quick queries.
    entitiesLog.push({
      entityId,
      spaceId,
      cid: cidString,
      name,
      description,
      relatedTo: relatedTo ?? null,
      opsJson: JSON.stringify(edits ?? opsJson ?? {}),
      userAddress: userAddress.toLowerCase(),
      timestamp: new Date().toISOString(),
      relationType,
    });

    return NextResponse.json({ cid: cidString });
  } catch (err: any) {
    console.error("/api/upload error", err);
    return NextResponse.json({ error: err.message ?? "Unexpected error" }, { status: 500 });
  }
} 