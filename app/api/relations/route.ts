import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { format } from 'date-fns';

// Database types
interface RelationRow {
  id: number;
  sourceId: string | null;
  targetId: string | null;
  relationType: string;
  properties: string | null;
  x: number;
  y: number;
  userAddress: string | null;
  created_at: string;
}

// Verbose logging helper
const log = (...args: unknown[]) => console.log('[Relations]', new Date().toISOString(), ...args);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get('date');
  const date = dateParam ?? format(new Date(), 'yyyy-MM-dd');

  const rows = db
    .prepare('SELECT * FROM relations WHERE date(created_at)=?')
    .all(date);

  log('GET', { date, rows: rows.length });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sourceId, targetId, relationType, userAddress, x, y } = body;
  log('POST payload', body);
  if (!sourceId || !targetId || !relationType || x === undefined || y === undefined) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const stmt = db.prepare(
    "INSERT INTO relations (sourceId, targetId, relationType, userAddress, x, y, created_at) VALUES (?,?,?,?,?,?,datetime('now'))"
  );
  const info = stmt.run(sourceId, targetId, relationType, userAddress ?? null, x, y);
  log('POST created', { id: info.lastInsertRowid, sourceId, targetId, relationType });

  // Record creation in edit history
  db.prepare(`
    INSERT INTO edit_history (nodeId, nodeType, action, field, oldValue, newValue, editorAddress) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(String(info.lastInsertRowid), 'relation', 'create', null, null, relationType, userAddress ?? null);

  // insert into relation_links table
  const linkStmt = db.prepare("INSERT INTO relation_links (relationId, entityId, role, created_at) VALUES (?,?,?,datetime('now'))");
  linkStmt.run(info.lastInsertRowid, sourceId, 'source');
  linkStmt.run(info.lastInsertRowid, targetId, 'target');

  return NextResponse.json({ id: info.lastInsertRowid });
} 
 
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: 'Missing relation ID' }, { status: 400 });
    }

    const relationId = parseInt(id, 10);
    if (isNaN(relationId)) {
      return NextResponse.json({ error: 'Invalid relation ID' }, { status: 400 });
    }
    log('DELETE relationId', relationId);

    // Remove any relation_links rows pointing to this relation first (to satisfy FK if cascade missing)
    db.prepare('DELETE FROM relation_links WHERE relationId = ?').run(relationId);

    const stmt = db.prepare('DELETE FROM relations WHERE id = ?');
    const info = stmt.run(relationId);

    if (info.changes === 0) {
      return NextResponse.json({ error: 'Relation not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    log('Error deleting relation', err);
    return NextResponse.json({ error: 'Internal server error', details: String(err) }, { status: 500 });
  }
} 

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, x, y, relationType, properties, sourceId, targetId, editorAddress } = body;
  log('PATCH payload', body);
  if (!id) {
    return NextResponse.json({ error: 'Missing relation ID' }, { status: 400 });
  }

  const relationId = parseInt(id, 10);
  if (isNaN(relationId)) {
    return NextResponse.json({ error: 'Invalid relation ID' }, { status: 400 });
  }

  // Get current values for history tracking
  const current = db.prepare('SELECT * FROM relations WHERE id = ?').get(relationId) as RelationRow | undefined;
  if (!current) {
    return NextResponse.json({ error: 'Relation not found' }, { status: 404 });
  }

  // Helper function to record edit history
  const recordEdit = (field: string, oldValue: string | number | null, newValue: string | number | null) => {
    if (oldValue !== newValue) {
      db.prepare(`
        INSERT INTO edit_history (nodeId, nodeType, action, field, oldValue, newValue, editorAddress) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(String(relationId), 'relation', 'update', field, String(oldValue || ''), String(newValue || ''), editorAddress || null);
    }
  };

  // Position updates (don't track in history for noise reduction)
  if (x !== undefined && y !== undefined) {
    db.prepare('UPDATE relations SET x=?, y=? WHERE id=?').run(x, y, relationId);
  }

  // Relation type updates (track in history)
  if (relationType && relationType !== current.relationType) {
    recordEdit('relationType', current.relationType, relationType);
    db.prepare('UPDATE relations SET relationType=? WHERE id=?').run(relationType, relationId);
  }

  // Properties updates (track in history)
  if (properties) {
    const oldProps = current.properties || '{}';
    const newProps = JSON.stringify(properties);
    if (oldProps !== newProps) {
      recordEdit('properties', oldProps, newProps);
      db.prepare('UPDATE relations SET properties=? WHERE id=?').run(newProps, relationId);
    }
  }

  // Source/target updates (track in history)
  if (sourceId && sourceId !== current.sourceId) {
    recordEdit('sourceId', current.sourceId, sourceId);
    db.prepare('UPDATE relations SET sourceId=? WHERE id=?').run(sourceId, relationId);
  }

  if (targetId && targetId !== current.targetId) {
    recordEdit('targetId', current.targetId, targetId);
    db.prepare('UPDATE relations SET targetId=? WHERE id=?').run(targetId, relationId);
  }

  return NextResponse.json({ success: true });
} 