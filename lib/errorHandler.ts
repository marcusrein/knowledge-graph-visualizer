interface ErrorLog {
  timestamp: string;
  error: string;
  stack?: string;
  context?: string;
  userAgent?: string;
  url?: string;
  userId?: string;
}

class ErrorLogger {
  private static instance: ErrorLogger;
  private errorQueue: ErrorLog[] = [];
  private isProduction = process.env.NODE_ENV === 'production';

  static getInstance(): ErrorLogger {
    if (!ErrorLogger.instance) {
      ErrorLogger.instance = new ErrorLogger();
    }
    return ErrorLogger.instance;
  }

  logError(error: Error | string, context?: string, userId?: string): void {
    const errorLog: ErrorLog = {
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      context,
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userId
    };

    this.errorQueue.push(errorLog);
    
    // In production, send to server
    if (this.isProduction) {
      this.sendToServer(errorLog);
    } else {
      // In development, just console.error
      console.error(`[ERROR] ${context || 'Unknown'}:`, error);
    }
  }

  private async sendToServer(errorLog: ErrorLog): Promise<void> {
    try {
      await fetch('/api/error-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorLog)
      });
    } catch {
      // Fallback: store in localStorage if server is down
      try {
        const stored = localStorage.getItem('error_logs') || '[]';
        const logs = JSON.parse(stored);
        logs.push(errorLog);
        // Keep only last 50 errors in localStorage
        const recent = logs.slice(-50);
        localStorage.setItem('error_logs', JSON.stringify(recent));
      } catch {
        // Silent fail - can't do much more
      }
    }
  }

  // Get stored errors for debugging
  getStoredErrors(): ErrorLog[] {
    try {
      const stored = localStorage.getItem('error_logs') || '[]';
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }

  // Clear stored errors
  clearStoredErrors(): void {
    try {
      localStorage.removeItem('error_logs');
    } catch {
      // Silent fail
    }
  }
}

export const errorLogger = ErrorLogger.getInstance();

// Safe async wrapper
export async function safeAsync<T>(
  operation: () => Promise<T>,
  fallback: T,
  context: string,
  userId?: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    errorLogger.logError(error instanceof Error ? error : new Error(String(error)), context, userId);
    return fallback;
  }
}

// Safe sync wrapper
export function safeSync<T>(
  operation: () => T,
  fallback: T,
  context: string,
  userId?: string
): T {
  try {
    return operation();
  } catch (error) {
    errorLogger.logError(error instanceof Error ? error : new Error(String(error)), context, userId);
    return fallback;
  }
}

// Retry wrapper with exponential backoff
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  context = 'Unknown operation',
  userId?: string
): Promise<T | null> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      const isLastTry = i === maxRetries - 1;
      const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s delays
      
      if (isLastTry) {
        errorLogger.logError(
          error instanceof Error ? error : new Error(String(error)), 
          `${context} - Final retry failed after ${maxRetries} attempts`,
          userId
        );
        return null;
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return null;
}

// Safe React state updater
export function safeSetState<T>(
  setter: (value: T | ((prev: T) => T)) => void,
  value: T | ((prev: T) => T),
  context: string,
  userId?: string
): void {
  try {
    setter(value);
  } catch (error) {
    errorLogger.logError(
      error instanceof Error ? error : new Error(String(error)),
      `State update failed: ${context}`,
      userId
    );
  }
} 