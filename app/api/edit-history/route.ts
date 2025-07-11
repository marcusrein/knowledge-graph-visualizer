import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

// Verbose logging helper
const log = (...args: unknown[]) => console.log('[EditHistory]', new Date().toISOString(), ...args);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const nodeId = searchParams.get('nodeId');

  if (!nodeId) {
    return NextResponse.json({ error: 'Missing nodeId parameter' }, { status: 400 });
  }

  try {
    const rows = db
      .prepare(`
        SELECT 
          id,
          nodeId,
          nodeType,
          action,
          field,
          oldValue,
          newValue,
          editorAddress,
          timestamp
        FROM edit_history 
        WHERE nodeId = ? 
        ORDER BY timestamp DESC 
        LIMIT 50
      `)
      .all(nodeId);

    log('GET', { nodeId, rows: rows.length });
    return NextResponse.json(rows);
  } catch (err) {
    log('Error fetching edit history', err);
    return NextResponse.json({ error: 'Internal server error', details: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nodeId, nodeType, action, field, oldValue, newValue, editorAddress } = body;

    if (!nodeId || !nodeType || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const stmt = db.prepare(`
      INSERT INTO edit_history (nodeId, nodeType, action, field, oldValue, newValue, editorAddress) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const info = stmt.run(nodeId, nodeType, action, field || null, oldValue || null, newValue || null, editorAddress || null);
    
    log('POST created', { id: info.lastInsertRowid, nodeId, action, field });
    return NextResponse.json({ id: info.lastInsertRowid });
  } catch (err) {
    log('Error creating edit history entry', err);
    return NextResponse.json({ error: 'Internal server error', details: String(err) }, { status: 500 });
  }
} 