import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  const rows = db.prepare('SELECT * FROM relation_links').all();
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { relationId, entityId, role } = body;
  if (!relationId || !entityId || !role) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }
  if (role !== 'source' && role !== 'target') {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }
  // Check if link already exists
  const existing = db.prepare('SELECT id FROM relation_links WHERE relationId=? AND entityId=? AND role=?').get(relationId, entityId, role) as { id?: number };
  if (existing && existing.id) {
    return NextResponse.json({ id: existing.id, duplicated: true });
  }
  const stmt = db.prepare("INSERT INTO relation_links (relationId, entityId, role, created_at) VALUES (?,?,?,datetime('now'))");
  const info = stmt.run(relationId, entityId, role);
  return NextResponse.json({ id: info.lastInsertRowid });
} 