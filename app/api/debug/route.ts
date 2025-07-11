import { NextResponse } from 'next/server';
import { getEntitiesForDate } from '@/lib/database';

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Use the existing getEntitiesForDate function
    const todayEntities = await getEntitiesForDate(today);
    const allEntities = await getEntitiesForDate(''); // Empty string should get all
    
    return NextResponse.json({
      debug: 'Database inspection via getEntitiesForDate',
      todayDate: today,
      todayEntities: todayEntities.length,
      allEntitiesLength: allEntities.length,
      todayEntitiesData: todayEntities,
      allEntitiesData: allEntities.slice(0, 5), // First 5 for inspection
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    return NextResponse.json({ 
      error: 'Debug failed', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
} 