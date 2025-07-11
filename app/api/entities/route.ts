import { NextRequest, NextResponse } from 'next/server';
import { format } from 'date-fns';
import { logger } from '@/lib/logger';
import { 
  initializeDatabase, 
  getEntitiesForDate, 
  createEntity, 
  updateEntity, 
  deleteEntity 
} from '@/lib/postgres';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Verbose logging helper
const log = (...args: unknown[]) => console.log('[Entities]', new Date().toISOString(), ...args);

// Initialize database on first load
let initialized = false;
async function ensureDatabase() {
  if (!initialized) {
    await initializeDatabase();
    initialized = true;
  }
}

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const addressParam = req.nextUrl.searchParams.get('address');
  
  try {
    await ensureDatabase();
    
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');
    const date = dateParam ?? format(new Date(), 'yyyy-MM-dd');

    logger.info('API', 'GET /api/entities started', { date, userAddress: addressParam }, addressParam || undefined);
    
    try {
      const sanitized = await getEntitiesForDate(date, addressParam || undefined);
      
      log('GET', { date, rows: sanitized.length });
      
      const duration = Date.now() - startTime;
      logger.info('API', 'GET /api/entities completed', { 
        date, 
        rowCount: sanitized.length, 
        duration 
      }, addressParam || undefined);
      
      return NextResponse.json(sanitized);
    } catch (dbError) {
      console.error('Database error in entities GET:', dbError);
      return NextResponse.json([], { status: 200 }); // Return empty array instead of failing
    }
  } catch (error) {
    console.error('Entities GET route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDatabase();
    
    const body = await req.json();
    const { nodeId, label, type, userAddress, parentId, visibility, x, y, width, height, properties } = body;
    
    log('POST payload', body);
    
    if (!nodeId || !label || !type) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const result = await createEntity({
      nodeId,
      label,
      type,
      userAddress,
      parentId,
      visibility,
      x,
      y,
      width,
      height,
      properties
    });
    
    log('POST created', { id: result.id, nodeId, duplicated: result.duplicated });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error creating entity:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await ensureDatabase();
    
    const body = await req.json();
    const { nodeId, editorAddress, ...updates } = body;
    
    log('PATCH payload', body);
    
    if (!nodeId) {
      return NextResponse.json({ error: 'Missing nodeId' }, { status: 400 });
    }

    await updateEntity(nodeId, updates, editorAddress);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating entity:', error);
    
    if (error.message === 'Entity not found') {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensureDatabase();
    
    const body = await req.json();
    const { nodeId } = body;
    
    if (!nodeId) {
      return NextResponse.json({ error: 'Missing node ID' }, { status: 400 });
    }

    log('DELETE nodeId', nodeId);

    await deleteEntity(nodeId);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting entity:', error);
    
    if (error.message === 'Entity not found') {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }
    
    return NextResponse.json({ error: 'Internal server error', details: String(error) }, { status: 500 });
  }
} 