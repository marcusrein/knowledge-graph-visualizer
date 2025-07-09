import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { format } from 'date-fns';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get('date');
  const date = dateParam ?? format(new Date(), 'yyyy-MM-dd');

  const rows = db
    .prepare('SELECT * FROM entities WHERE date(created_at)=?')
    .all(date);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { nodeId, label, type, userAddress } = body;
  if (!nodeId || !label || !type) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const stmt = db.prepare(
    "INSERT INTO entities (nodeId, label, type, userAddress, created_at) VALUES (?,?,?,?,datetime('now'))"
  );
  const info = stmt.run(nodeId, label, type, userAddress ?? null);
  return NextResponse.json({ id: info.lastInsertRowid });
} 