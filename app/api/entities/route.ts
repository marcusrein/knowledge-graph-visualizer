import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { format } from 'date-fns';
/* eslint-disable @typescript-eslint/no-explicit-any */
// Verbose logging helper
const log = (...args: unknown[]) => console.log('[Entities]', new Date().toISOString(), ...args);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get('date');
  const date = dateParam ?? format(new Date(), 'yyyy-MM-dd');

  const addressParam = searchParams.get('address');
  const rows = db
    .prepare(`SELECT * FROM entities WHERE date(created_at)=? AND (type='group' OR visibility='public' OR userAddress IS NULL OR userAddress=? )`)
    .all(date, addressParam ?? '');

  // Redact private Space labels for non-owners
  const sanitized = (rows as unknown[]).map((row) => {
    const r = row as { [key: string]: any };
    if (
      r.type === 'group' &&
      r.visibility === 'private' &&
      r.userAddress &&
      r.userAddress.toLowerCase() !== (addressParam ?? '').toLowerCase()
    ) {
      return { ...r, label: '', properties: '{}' };
    }
    return r;
  });
  log('GET', { date, rows: sanitized.length });
  return NextResponse.json(sanitized);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { nodeId, label, type, userAddress, parentId, visibility } = body;
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

  const { width, height } = body;
  const stmt = db.prepare(
    "INSERT INTO entities (nodeId, label, type, userAddress, parentId, x, y, width, height, properties, visibility, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))"
  );
  const info = stmt.run(nodeId, label, type, userAddress ?? null, parentId ?? null, x ?? null, y ?? null, width ?? null, height ?? null, JSON.stringify(body.properties ?? {}), visibility ?? 'public');
  log('POST created', { id: info.lastInsertRowid, nodeId });
  return NextResponse.json({ id: info.lastInsertRowid });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { nodeId, x, y, label, properties, parentId, visibility: vis, width, height } = body;
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

  if (vis) {
    db.prepare('UPDATE entities SET visibility=? WHERE nodeId=?').run(vis, nodeId);
  }

  // parentId can be a string or null
  if (parentId !== undefined) {
    db.prepare('UPDATE entities SET parentId=? WHERE nodeId=?').run(parentId, nodeId);
  }

  if (width !== undefined && height !== undefined) {
    db.prepare('UPDATE entities SET width=?, height=? WHERE nodeId=?').run(width, height, nodeId);
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
      // Remove relation_links rows that reference this entity
      db.prepare('DELETE FROM relation_links WHERE entityId = ?').run(id);

      // Nullify sourceId/targetId in relations that referenced this entity, keeping the relation node intact
      const infoSrc = db.prepare('UPDATE relations SET sourceId = NULL WHERE sourceId = ?').run(id);
      const infoTgt = db.prepare('UPDATE relations SET targetId = NULL WHERE targetId = ?').run(id);
      if (infoSrc.changes || infoTgt.changes) {
        log('Nullified source/target in relations', { sourceCleared: infoSrc.changes, targetCleared: infoTgt.changes });
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