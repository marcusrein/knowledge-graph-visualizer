import { dbProtection } from './databaseProtection';
import { errorLogger } from './errorHandler';

// Cleanup scheduler class
export class DatabaseCleanupScheduler {
  private static instance: DatabaseCleanupScheduler;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  // Cleanup intervals in milliseconds
  private readonly INTERVALS = {
    DAILY: 24 * 60 * 60 * 1000,        // 24 hours
    WEEKLY: 7 * 24 * 60 * 60 * 1000,   // 7 days  
    HOURLY: 60 * 60 * 1000             // 1 hour (for development)
  };

  public static getInstance(): DatabaseCleanupScheduler {
    if (!DatabaseCleanupScheduler.instance) {
      DatabaseCleanupScheduler.instance = new DatabaseCleanupScheduler();
    }
    return DatabaseCleanupScheduler.instance;
  }

  /**
   * Start the cleanup scheduler
   */
  public start(): void {
    if (this.isRunning) {
      console.log('[DatabaseCleanup] Scheduler already running');
      return;
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const interval = isProduction ? this.INTERVALS.DAILY : this.INTERVALS.HOURLY;

    console.log(`[DatabaseCleanup] Starting scheduler (${isProduction ? 'daily' : 'hourly'} cleanup)`);

    // Run initial cleanup after a short delay
    setTimeout(() => {
      this.runCleanup();
    }, 30000); // 30 seconds

    // Schedule regular cleanups
    this.cleanupInterval = setInterval(() => {
      this.runCleanup();
    }, interval);

    this.isRunning = true;
  }

  /**
   * Stop the cleanup scheduler
   */
  public stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.isRunning = false;
    console.log('[DatabaseCleanup] Scheduler stopped');
  }

  /**
   * Run cleanup tasks
   */
  private async runCleanup(): Promise<void> {
    try {
      console.log('[DatabaseCleanup] Starting cleanup tasks...');
      const startTime = Date.now();

      // 1. Clean up old edit history
      const cleanupResult = await dbProtection.cleanupOldData();
      console.log(`[DatabaseCleanup] Cleaned up ${cleanupResult.deletedRecords} old records, freed ${cleanupResult.freedSpaceKB}KB`);

      // 2. Reset old rate limits (older than 24 hours)
      this.cleanupOldRateLimits();

      // 3. Check database size and log warnings
      await this.checkDatabaseHealth();

      const duration = Date.now() - startTime;
      console.log(`[DatabaseCleanup] Cleanup completed in ${duration}ms`);

    } catch (error) {
      errorLogger.logError(
        error instanceof Error ? error : new Error(String(error)),
        'Database cleanup failed'
      );
    }
  }

  /**
   * Clean up old rate limit entries
   */
  private cleanupOldRateLimits(): void {
    try {
      // This would access the rate limit store from dbProtection
      // For now, we'll just log that it would happen
      console.log('[DatabaseCleanup] Rate limit cleanup would run here');
    } catch (error) {
      errorLogger.logError(
        error instanceof Error ? error : new Error(String(error)),
        'Rate limit cleanup failed'
      );
    }
  }

  /**
   * Check database health and log warnings
   */
  private async checkDatabaseHealth(): Promise<void> {
    try {
      const { getDatabaseSize } = await import('./database');
      const dbSize = await getDatabaseSize();
      
      const sizeMB = dbSize.sizeKB / 1024;
      
      console.log(`[DatabaseCleanup] Database health check:`);
      console.log(`  - Size: ${sizeMB.toFixed(2)}MB`);
      console.log(`  - Tables: ${JSON.stringify(dbSize.tableStats)}`);

      // Log warnings for large databases
      if (sizeMB > 100) {
        console.warn(`[DatabaseCleanup] WARNING: Database size is ${sizeMB.toFixed(2)}MB (approaching limits)`);
      }

      // Log warnings for tables with too many records
      if (dbSize.tableStats.edit_history > 10000) {
        console.warn(`[DatabaseCleanup] WARNING: Edit history has ${dbSize.tableStats.edit_history} records`);
      }

    } catch (error) {
      errorLogger.logError(
        error instanceof Error ? error : new Error(String(error)),
        'Database health check failed'
      );
    }
  }

  /**
   * Manual cleanup trigger (for admin use)
   */
  public async triggerCleanup(): Promise<{ success: boolean; message: string; details?: Record<string, unknown> }> {
    try {
      console.log('[DatabaseCleanup] Manual cleanup triggered');
      
      const result = await dbProtection.cleanupOldData();
      
      return {
        success: true,
        message: `Cleanup completed successfully`,
        details: {
          deletedRecords: result.deletedRecords,
          freedSpaceKB: result.freedSpaceKB,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      errorLogger.logError(
        error instanceof Error ? error : new Error(String(error)),
        'Manual cleanup failed'
      );
      
      return {
        success: false,
        message: 'Cleanup failed: ' + (error instanceof Error ? error.message : String(error))
      };
    }
  }

  /**
   * Get cleanup status
   */
  public getStatus(): {
    isRunning: boolean;
    nextCleanup?: string;
    lastCleanup?: string;
  } {
    return {
      isRunning: this.isRunning,
      nextCleanup: this.isRunning ? 'Scheduled' : 'Not scheduled',
      lastCleanup: 'See logs for details'
    };
  }
}

// Export singleton instance
export const cleanupScheduler = DatabaseCleanupScheduler.getInstance();

// Auto-start in production
if (process.env.NODE_ENV === 'production') {
  // Start after a delay to ensure database is initialized
  setTimeout(() => {
    cleanupScheduler.start();
  }, 10000); // 10 seconds
} 