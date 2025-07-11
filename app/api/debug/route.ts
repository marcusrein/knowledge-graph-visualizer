import { NextResponse } from 'next/server';
import { getEntitiesForDate } from '@/lib/database';

// Helper function to safely convert dates to ISO strings
function safeJsonSerialize(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (obj instanceof Date) {
    return isNaN(obj.getTime()) ? null : obj.toISOString();
  }
  
  if (typeof obj === 'string') {
    // Check if it's a date string and try to parse it
    const date = new Date(obj);
    if (!isNaN(date.getTime()) && obj.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
      return date.toISOString();
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => safeJsonSerialize(item));
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = safeJsonSerialize(value);
    }
    return result;
  }
  
  return obj;
}

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Use the existing getEntitiesForDate function
    const todayEntities = await getEntitiesForDate(today);
    const allEntities = await getEntitiesForDate(''); // Empty string should get all
    
    // Safely serialize the data to prevent Date serialization errors
    const safeResponse = {
      debug: 'Database inspection via getEntitiesForDate',
      todayDate: today,
      todayEntities: todayEntities.length,
      allEntitiesLength: allEntities.length,
      todayEntitiesData: safeJsonSerialize(todayEntities),
      allEntitiesData: safeJsonSerialize(allEntities.slice(0, 5)), // First 5 for inspection
      timestamp: new Date().toISOString()
    };
    
    return NextResponse.json(safeResponse);
  } catch (error) {
    console.error('Debug endpoint error:', error);
    return NextResponse.json({ 
      error: 'Debug failed', 
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 