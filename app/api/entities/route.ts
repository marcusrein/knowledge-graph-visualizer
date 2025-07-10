import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { format } from 'date-fns';
// Verbose logging helper
const log = (...args: unknown[]) => console.log('[Entities]', new Date().toISOString(), ...args);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get('date');
  const date = dateParam ?? format(new Date(), 'yyyy-MM-dd');

  const rows = db
    .prepare('SELECT * FROM entities WHERE date(created_at)=?')
    .all(date);

  log('GET', { date, rows: rows.length });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { nodeId, label, type, userAddress } = body;
  log('POST payload', body);
  const { x, y } = body;
  if (!nodeId || !label || !type) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  // Prevent duplicate nodeId entries – if a node with the same nodeId exists, return it instead of inserting a duplicate
  const existing = db.prepare('SELECT id FROM entities WHERE nodeId = ?').get(nodeId) as { id: number } | undefined;
  if (existing) {
    return NextResponse.json({ id: existing.id, duplicated: true });
  }

  const stmt = db.prepare(
    "INSERT INTO entities (nodeId, label, type, userAddress, x, y, created_at) VALUES (?,?,?,?,?,?,datetime('now'))"
  );
  const info = stmt.run(nodeId, label, type, userAddress ?? null, x ?? null, y ?? null);
  log('POST created', { id: info.lastInsertRowid, nodeId });
  return NextResponse.json({ id: info.lastInsertRowid });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { nodeId, x, y, label, properties } = body;
  log('PATCH payload', body);
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
  try {
    const body = await req.json();
    const { nodeId } = body;
    if (!nodeId) {
      return NextResponse.json({ error: 'Missing node ID' }, { status: 400 });
    }

    log('DELETE nodeId', nodeId);

    const deleteTransaction = db.transaction((id: string) => {
      const relationsToDelete = db
        .prepare('SELECT id FROM relations WHERE sourceId = ? OR targetId = ?')
        .all(id, id) as { id: number }[];

      if (relationsToDelete.length > 0) {
        const relationIds = relationsToDelete.map((r) => r.id);
        log('Relations to delete', relationIds);
        const placeholders = relationIds.map(() => '?').join(',');

        // First remove relation_links that reference these relations to satisfy FK constraints in older DBs
        db.prepare(`DELETE FROM relation_links WHERE relationId IN (${placeholders})`).run(...relationIds);

        // Now remove the relations themselves
        db.prepare(`DELETE FROM relations WHERE id IN (${placeholders})`).run(...relationIds);
      }

      const info = db.prepare('DELETE FROM entities WHERE nodeId = ?').run(id);
      log('Deleted entity', { changes: info.changes });
      return info;
    });

    const info = deleteTransaction(nodeId);

    if (info.changes === 0) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    log('Error deleting entity', err);
    return NextResponse.json({ error: 'Internal server error', details: String(err) }, { status: 500 });
  }
} 