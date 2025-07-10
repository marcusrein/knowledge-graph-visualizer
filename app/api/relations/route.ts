import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { format } from 'date-fns';
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
  const { id, x, y, relationType, properties, sourceId, targetId } = body;
  log('PATCH payload', body);
  if (!id) {
    return NextResponse.json({ error: 'Missing relation ID' }, { status: 400 });
  }

  const relationId = parseInt(id, 10);
  if (isNaN(relationId)) {
    return NextResponse.json({ error: 'Invalid relation ID' }, { status: 400 });
  }

  if (x !== undefined && y !== undefined) {
    db.prepare('UPDATE relations SET x=?, y=? WHERE id=?').run(x, y, relationId);
  }

  if (relationType) {
    db.prepare('UPDATE relations SET relationType=? WHERE id=?').run(relationType, relationId);
  }

  if (properties) {
    db.prepare('UPDATE relations SET properties=? WHERE id=?').run(JSON.stringify(properties), relationId);
  }

  if (sourceId) {
    db.prepare('UPDATE relations SET sourceId=? WHERE id=?').run(sourceId, relationId);
  }

  if (targetId) {
    db.prepare('UPDATE relations SET targetId=? WHERE id=?').run(targetId, relationId);
  }

  // Check if any update was successful to prevent false negatives
  const checkStmt = db.prepare('SELECT id FROM relations WHERE id = ?');
  const info = checkStmt.get(relationId) as { id: number } | undefined;

  if (!info) {
    return NextResponse.json({ error: 'Relation not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
} 