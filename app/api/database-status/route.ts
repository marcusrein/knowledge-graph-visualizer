import { NextRequest, NextResponse } from 'next/server';
import { dbProtection } from '@/lib/databaseProtection';
import { cleanupScheduler } from '@/lib/databaseCleanup';
import { getDatabaseSize } from '@/lib/database';
import { errorLogger } from '@/lib/errorHandler';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const includeUsers = searchParams.get('users') === 'true';
    const userAddress = searchParams.get('userAddress');

    // Get database size and health metrics
    const dbSize = await getDatabaseSize();
    const sizeMB = dbSize.sizeKB / 1024;

    // Get protection status
    const protectionStatus = dbProtection.getProtectionStatus();

    // Get cleanup status
    const cleanupStatus = cleanupScheduler.getStatus();

    // Calculate health metrics
    const healthMetrics = {
      status: 'healthy' as 'healthy' | 'warning' | 'critical',
      issues: [] as string[],
      score: 100
    };

    // Check database size
    if (sizeMB > 400) {
      healthMetrics.status = 'critical';
      healthMetrics.issues.push(`Database size critical: ${sizeMB.toFixed(1)}MB`);
      healthMetrics.score -= 50;
    } else if (sizeMB > 100) {
      healthMetrics.status = 'warning';
      healthMetrics.issues.push(`Database size warning: ${sizeMB.toFixed(1)}MB`);
      healthMetrics.score -= 20;
    }

    // Check edit history bloat
    if (dbSize.tableStats.edit_history > 50000) {
      healthMetrics.status = 'critical';
      healthMetrics.issues.push(`Edit history bloated: ${dbSize.tableStats.edit_history} records`);
      healthMetrics.score -= 30;
    } else if (dbSize.tableStats.edit_history > 10000) {
      if (healthMetrics.status === 'healthy') healthMetrics.status = 'warning';
      healthMetrics.issues.push(`Edit history growing: ${dbSize.tableStats.edit_history} records`);
      healthMetrics.score -= 10;
    }

    // Check cleanup status
    if (!cleanupStatus.isRunning) {
      if (healthMetrics.status === 'healthy') healthMetrics.status = 'warning';
      healthMetrics.issues.push('Automatic cleanup not running');
      healthMetrics.score -= 15;
    }

    // Get user-specific quota if requested
    let userQuota = null;
    if (userAddress) {
      try {
        const { getUserQuota } = await import('@/lib/database');
        userQuota = await getUserQuota(userAddress);
      } catch (error) {
        console.warn('Failed to get user quota:', error);
      }
    }

    const response = {
      timestamp: new Date().toISOString(),
      database: {
        sizeKB: dbSize.sizeKB,
        sizeMB: Number(sizeMB.toFixed(2)),
        tables: dbSize.tableStats
      },
      protection: protectionStatus,
      cleanup: cleanupStatus,
      health: healthMetrics,
      ...(userQuota && { userQuota }),
      ...(includeUsers && {
        topUsers: await getTopUsers()
      })
    };

    return NextResponse.json(response);

  } catch (error) {
    errorLogger.logError(
      error instanceof Error ? error : new Error(String(error)),
      'Database status endpoint failed'
    );

    return NextResponse.json(
      { 
        error: 'Failed to get database status',
        timestamp: new Date().toISOString(),
        health: { status: 'critical', issues: ['Status check failed'], score: 0 }
      }, 
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, userAddress } = body;

    switch (action) {
      case 'cleanup':
        const cleanupResult = await cleanupScheduler.triggerCleanup();
        return NextResponse.json(cleanupResult);

      case 'reset-user-limits':
        if (!userAddress) {
          return NextResponse.json({ error: 'userAddress required' }, { status: 400 });
        }
        dbProtection.resetUserLimits(userAddress);
        return NextResponse.json({ success: true, message: 'User limits reset' });

      case 'start-cleanup-scheduler':
        cleanupScheduler.start();
        return NextResponse.json({ success: true, message: 'Cleanup scheduler started' });

      case 'stop-cleanup-scheduler':
        cleanupScheduler.stop();
        return NextResponse.json({ success: true, message: 'Cleanup scheduler stopped' });

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

  } catch (error) {
    errorLogger.logError(
      error instanceof Error ? error : new Error(String(error)),
      'Database status action failed'
    );

    return NextResponse.json(
      { error: 'Action failed', details: String(error) }, 
      { status: 500 }
    );
  }
}

// Helper function to get top users by activity
async function getTopUsers() {
  try {
    const { getDatabaseSize } = await import('@/lib/database');
    
    // This is a simplified version - in a real implementation, 
    // you'd query the database for user statistics
    return {
      message: 'Top users data not implemented yet',
      totalUsers: 0,
      activeUsers: 0
    };
  } catch (error) {
    return { error: 'Failed to get user statistics' };
  }
} 