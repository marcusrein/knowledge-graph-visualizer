import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

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
    
    // In production/Vercel, just log to console since file system is read-only
    // In development, you could still write to files if needed
    const isProduction = process.env.NODE_ENV === 'production';
    
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
    
    if (isProduction) {
      // In production, log to console (Vercel captures these)
      console.error('CLIENT ERROR LOG:', logEntry);
    } else {
      // In development, try to write to file
      try {
        const logsDir = path.join(process.cwd(), 'logs');
        await fs.mkdir(logsDir, { recursive: true });
        
        const today = new Date().toISOString().split('T')[0];
        const logFile = path.join(logsDir, `errors_${today}.log`);
        
        await fs.appendFile(logFile, logEntry);
      } catch (fileError) {
        // Fallback to console if file writing fails
        console.error('Failed to write error log to file:', fileError);
        console.error('Logging to console instead:', logEntry);
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    // Fallback logging to console if anything fails
    console.error('Failed to write error log:', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
} 