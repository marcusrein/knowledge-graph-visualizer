import { NextResponse } from "next/server";
import { entitiesLog } from "../upload/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  // Return newest first (by timestamp)
  const sorted = [...entitiesLog].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  return NextResponse.json(sorted);
} 