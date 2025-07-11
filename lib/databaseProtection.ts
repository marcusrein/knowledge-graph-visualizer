import { errorLogger } from './errorHandler';

// Configuration constants
const RATE_LIMITS = {
  WRITES_PER_MINUTE: 30,
  WRITES_PER_HOUR: 200,
  WRITES_PER_DAY: 1000,
  PROPERTIES_SIZE_KB: 10, // 10KB max for properties
  LABEL_MAX_LENGTH: 200,
  RELATION_TYPE_MAX_LENGTH: 100,
  MAX_ENTITIES_PER_USER: 1000,
  MAX_RELATIONS_PER_USER: 2000,
  EDIT_HISTORY_RETENTION_DAYS: 30,
  DATABASE_SIZE_WARNING_MB: 100,
  DATABASE_SIZE_LIMIT_MB: 500
};

// In-memory rate limiting store (in production, use Redis)
const rateLimitStore = new Map<string, {
  minute: { count: number; resetTime: number };
  hour: { count: number; resetTime: number };
  day: { count: number; resetTime: number };
}>();

// User quota tracking
const userQuotas = new Map<string, {
  entities: number;
  relations: number;
  totalSizeKB: number;
  lastUpdated: number;
}>();

export interface DatabaseOperation {
  type: 'create' | 'update' | 'delete';
  table: 'entities' | 'relations' | 'edit_history';
  userAddress?: string;
  dataSize?: number;
  payload?: Record<string, unknown>;
}

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
  retryAfter?: number; // seconds
  warning?: string;
}

export class DatabaseProtection {
  private static instance: DatabaseProtection;
  
  public static getInstance(): DatabaseProtection {
    if (!DatabaseProtection.instance) {
      DatabaseProtection.instance = new DatabaseProtection();
    }
    return DatabaseProtection.instance;
  }

  /**
   * Main validation function - checks all protection rules
   */
  async validateOperation(operation: DatabaseOperation): Promise<ValidationResult> {
    const { userAddress } = operation;
    
    try {
      // 1. Rate limiting check
      const rateLimitResult = this.checkRateLimit(userAddress);
      if (!rateLimitResult.allowed) {
        return rateLimitResult;
      }

      // 2. Size validation
      const sizeResult = this.validateSize(operation);
      if (!sizeResult.allowed) {
        return sizeResult;
      }

      // 3. User quota check
      const quotaResult = await this.checkUserQuota(operation);
      if (!quotaResult.allowed) {
        return quotaResult;
      }

      // 4. Database bloat check
      const bloatResult = await this.checkDatabaseBloat();
      if (!bloatResult.allowed) {
        return bloatResult;
      }

      // Update rate limiting counters
      this.incrementRateLimit(userAddress);
      
      return { allowed: true };
    } catch (error) {
      errorLogger.logError(
        error instanceof Error ? error : new Error(String(error)),
        'Database protection validation failed',
        userAddress
      );
      return { allowed: false, reason: 'Protection system error' };
    }
  }

  /**
   * Rate limiting based on time windows
   */
  private checkRateLimit(userAddress?: string): ValidationResult {
    if (!userAddress) {
      return { allowed: true }; // Allow anonymous operations with caution
    }

    const now = Date.now();
    const userLimits = rateLimitStore.get(userAddress) || {
      minute: { count: 0, resetTime: now + 60000 },
      hour: { count: 0, resetTime: now + 3600000 },
      day: { count: 0, resetTime: now + 86400000 }
    };

    // Reset counters if time windows have passed
    if (now > userLimits.minute.resetTime) {
      userLimits.minute = { count: 0, resetTime: now + 60000 };
    }
    if (now > userLimits.hour.resetTime) {
      userLimits.hour = { count: 0, resetTime: now + 3600000 };
    }
    if (now > userLimits.day.resetTime) {
      userLimits.day = { count: 0, resetTime: now + 86400000 };
    }

    // Check limits
    if (userLimits.minute.count >= RATE_LIMITS.WRITES_PER_MINUTE) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded: too many operations per minute',
        retryAfter: Math.ceil((userLimits.minute.resetTime - now) / 1000)
      };
    }

    if (userLimits.hour.count >= RATE_LIMITS.WRITES_PER_HOUR) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded: too many operations per hour',
        retryAfter: Math.ceil((userLimits.hour.resetTime - now) / 1000)
      };
    }

    if (userLimits.day.count >= RATE_LIMITS.WRITES_PER_DAY) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded: daily limit reached',
        retryAfter: Math.ceil((userLimits.day.resetTime - now) / 1000)
      };
    }

    return { allowed: true };
  }

  /**
   * Increment rate limit counters
   */
  private incrementRateLimit(userAddress?: string): void {
    if (!userAddress) return;

    const now = Date.now();
    const userLimits = rateLimitStore.get(userAddress) || {
      minute: { count: 0, resetTime: now + 60000 },
      hour: { count: 0, resetTime: now + 3600000 },
      day: { count: 0, resetTime: now + 86400000 }
    };

    userLimits.minute.count++;
    userLimits.hour.count++;
    userLimits.day.count++;

    rateLimitStore.set(userAddress, userLimits);
  }

  /**
   * Validate data sizes
   */
  private validateSize(operation: DatabaseOperation): ValidationResult {
    const { payload } = operation;
    if (!payload) return { allowed: true };

    // Check label length
    if (payload.label && typeof payload.label === 'string') {
      if (payload.label.length > RATE_LIMITS.LABEL_MAX_LENGTH) {
        return {
          allowed: false,
          reason: `Label too long (max ${RATE_LIMITS.LABEL_MAX_LENGTH} characters)`
        };
      }
    }

    // Check relation type length
    if (payload.relationType && typeof payload.relationType === 'string') {
      if (payload.relationType.length > RATE_LIMITS.RELATION_TYPE_MAX_LENGTH) {
        return {
          allowed: false,
          reason: `Relation type too long (max ${RATE_LIMITS.RELATION_TYPE_MAX_LENGTH} characters)`
        };
      }
    }

    // Check properties size
    if (payload.properties) {
      const propertiesSize = JSON.stringify(payload.properties).length;
      const sizeKB = propertiesSize / 1024;
      
      if (sizeKB > RATE_LIMITS.PROPERTIES_SIZE_KB) {
        return {
          allowed: false,
          reason: `Properties too large (max ${RATE_LIMITS.PROPERTIES_SIZE_KB}KB)`
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Check user quotas
   */
  private async checkUserQuota(operation: DatabaseOperation): Promise<ValidationResult> {
    const { userAddress, type, table } = operation;
    if (!userAddress || type !== 'create') {
      return { allowed: true }; // Only check quotas for new creations
    }

    let userQuota = userQuotas.get(userAddress);
    const now = Date.now();

    // Refresh quota data every 5 minutes
    if (!userQuota || now - userQuota.lastUpdated > 300000) {
      userQuota = await this.refreshUserQuota(userAddress);
    }

    if (table === 'entities' && userQuota.entities >= RATE_LIMITS.MAX_ENTITIES_PER_USER) {
      return {
        allowed: false,
        reason: `Entity limit reached (max ${RATE_LIMITS.MAX_ENTITIES_PER_USER} entities per user)`
      };
    }

    if (table === 'relations' && userQuota.relations >= RATE_LIMITS.MAX_RELATIONS_PER_USER) {
      return {
        allowed: false,
        reason: `Relation limit reached (max ${RATE_LIMITS.MAX_RELATIONS_PER_USER} relations per user)`
      };
    }

    return { allowed: true };
  }

  /**
   * Refresh user quota from database
   */
  private async refreshUserQuota(userAddress: string): Promise<{ entities: number; relations: number; totalSizeKB: number; lastUpdated: number }> {
    try {
      // Import getUserQuota function dynamically to avoid circular dependency
      const { getUserQuota } = await import('./database');
      const dbQuota = await getUserQuota(userAddress);
      
      const quota = {
        ...dbQuota,
        lastUpdated: Date.now()
      };

      userQuotas.set(userAddress, quota);
      return quota;
    } catch (error) {
      errorLogger.logError(
        error instanceof Error ? error : new Error(String(error)),
        'Failed to refresh user quota',
        userAddress
      );
      // Return safe defaults on error
      return { entities: 0, relations: 0, totalSizeKB: 0, lastUpdated: Date.now() };
    }
  }

  /**
   * Check for database bloat
   */
  private async checkDatabaseBloat(): Promise<ValidationResult> {
    try {
      // Import getDatabaseSize function dynamically to avoid circular dependency
      const { getDatabaseSize } = await import('./database');
      const dbSize = await getDatabaseSize();
      
      const sizeMB = dbSize.sizeKB / 1024;
      
      if (sizeMB > RATE_LIMITS.DATABASE_SIZE_LIMIT_MB) {
        return {
          allowed: false,
          reason: `Database size limit exceeded (${sizeMB.toFixed(1)}MB / ${RATE_LIMITS.DATABASE_SIZE_LIMIT_MB}MB). Please contact support.`
        };
      }
      
      if (sizeMB > RATE_LIMITS.DATABASE_SIZE_WARNING_MB) {
        return {
          allowed: true,
          warning: `Database size is approaching limit (${sizeMB.toFixed(1)}MB / ${RATE_LIMITS.DATABASE_SIZE_LIMIT_MB}MB)`
        };
      }

      return { allowed: true };
    } catch (error) {
      errorLogger.logError(
        error instanceof Error ? error : new Error(String(error)),
        'Database bloat check failed'
      );
      return { allowed: true }; // Allow operation on check failure
    }
  }

  /**
   * Clean up old data to prevent bloat
   */
  async cleanupOldData(): Promise<{ deletedRecords: number; freedSpaceKB: number }> {
    try {
      // Import cleanup function dynamically to avoid circular dependency
      const { cleanupOldEditHistory } = await import('./database');
      
      const result = await cleanupOldEditHistory(RATE_LIMITS.EDIT_HISTORY_RETENTION_DAYS);
      
      // Estimate freed space (rough approximation)
      const estimatedFreedSpaceKB = result.deletedRecords * 0.5; // Assume ~0.5KB per record
      
      console.log(`[DatabaseProtection] Cleaned up ${result.deletedRecords} records, freed ~${estimatedFreedSpaceKB.toFixed(1)}KB`);
      
      return { 
        deletedRecords: result.deletedRecords, 
        freedSpaceKB: Math.ceil(estimatedFreedSpaceKB)
      };
    } catch (error) {
      errorLogger.logError(
        error instanceof Error ? error : new Error(String(error)),
        'Database cleanup failed'
      );
      throw error;
    }
  }

  /**
   * Get current protection status
   */
  getProtectionStatus() {
    return {
      rateLimits: RATE_LIMITS,
      activeUsers: rateLimitStore.size,
      quotaTracking: userQuotas.size,
      lastCleanup: new Date().toISOString()
    };
  }

  /**
   * Reset user rate limits (admin function)
   */
  resetUserLimits(userAddress: string): void {
    rateLimitStore.delete(userAddress);
    userQuotas.delete(userAddress);
  }

  /**
   * Validate and sanitize input data
   */
  sanitizeInput(data: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        // Trim whitespace and limit length
        sanitized[key] = value.trim().substring(0, 1000);
      } else if (typeof value === 'number') {
        // Ensure numbers are finite
        sanitized[key] = Number.isFinite(value) ? value : 0;
      } else if (typeof value === 'object' && value !== null) {
        // For objects, convert to JSON and limit size
        const jsonStr = JSON.stringify(value);
        if (jsonStr.length <= RATE_LIMITS.PROPERTIES_SIZE_KB * 1024) {
          sanitized[key] = value;
        } else {
          sanitized[key] = {}; // Replace oversized objects with empty object
        }
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

// Export singleton instance
export const dbProtection = DatabaseProtection.getInstance(); 