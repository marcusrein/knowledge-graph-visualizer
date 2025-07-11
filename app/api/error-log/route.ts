import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

interface ErrorLog {
  timestamp: string;
  error: string;
  stack?: string;
  context?: string;
  userAgent?: string;
  url?: string;
  userId?: string;
}

export async function POST(req: NextRequest) {
  try {
    const errorLog: ErrorLog = await req.json();
    
    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs');
    try {
      await fs.mkdir(logsDir, { recursive: true });
    } catch {
      // Directory already exists
    }
    
    // Create log entry
    const logEntry = `
=====================================
TIMESTAMP: ${errorLog.timestamp}
CONTEXT: ${errorLog.context || 'Unknown'}
ERROR: ${errorLog.error}
URL: ${errorLog.url || 'Unknown'}
USER_AGENT: ${errorLog.userAgent || 'Unknown'}
USER_ID: ${errorLog.userId || 'Anonymous'}
${errorLog.stack ? `STACK:\n${errorLog.stack}` : ''}
=====================================
`;
    
    // Write to daily log file
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(logsDir, `errors_${today}.log`);
    
    await fs.appendFile(logFile, logEntry);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    // Fallback logging to console if file writing fails
    console.error('Failed to write error log:', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
} 