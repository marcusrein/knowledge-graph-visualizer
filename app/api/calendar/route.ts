import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  const rows = db
    .prepare('SELECT date(created_at) as date, COUNT(*) as count FROM entities GROUP BY date')
    .all();

  return NextResponse.json(rows);
} 