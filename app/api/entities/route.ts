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
  const { x, y } = body;
  if (!nodeId || !label || !type) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const stmt = db.prepare(
    "INSERT INTO entities (nodeId, label, type, userAddress, x, y, created_at) VALUES (?,?,?,?,?,?,datetime('now'))"
  );
  const info = stmt.run(nodeId, label, type, userAddress ?? null, x ?? null, y ?? null);
  return NextResponse.json({ id: info.lastInsertRowid });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { nodeId, x, y, label, properties } = body;
  if (!nodeId) {
    return NextResponse.json({ error: 'Missing nodeId' }, { status: 400 });
  }

  if (x !== undefined && y !== undefined) {
    db.prepare('UPDATE entities SET x=?, y=? WHERE nodeId=?').run(x, y, nodeId);
  }

  if (label) {
    db.prepare('UPDATE entities SET label=? WHERE nodeId=?').run(label, nodeId);
  }

  if (properties) {
    db.prepare('UPDATE entities SET properties=? WHERE nodeId=?').run(JSON.stringify(properties), nodeId);
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const { nodeId } = body;
  if (!nodeId) {
    return NextResponse.json({ error: 'Missing node ID' }, { status: 400 });
  }

  const deleteTransaction = db.transaction((id: string) => {
    const info = db.prepare('DELETE FROM entities WHERE nodeId = ?').run(id);
    if (info.changes > 0) {
      db.prepare('DELETE FROM relations WHERE sourceId = ? OR targetId = ?').run(id, id);
    }
    return info;
  });

  const info = deleteTransaction(nodeId);

  if (info.changes === 0) {
    return NextResponse.json({ error: 'Node not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
} 