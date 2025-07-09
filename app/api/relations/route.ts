import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { format } from 'date-fns';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get('date');
  const date = dateParam ?? format(new Date(), 'yyyy-MM-dd');

  const rows = db
    .prepare('SELECT * FROM relations WHERE date(created_at)=?')
    .all(date);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sourceId, targetId, relationType, userAddress } = body;
  if (!sourceId || !targetId || !relationType) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const stmt = db.prepare(
    "INSERT INTO relations (sourceId, targetId, relationType, userAddress, created_at) VALUES (?,?,?,?,datetime('now'))"
  );
  const info = stmt.run(sourceId, targetId, relationType, userAddress ?? null);
  return NextResponse.json({ id: info.lastInsertRowid });
} 