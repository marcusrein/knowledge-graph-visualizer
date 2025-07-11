interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug' | 'performance';
  category: string;
  message: string;
  data?: Record<string, unknown>;
  duration?: number;
  userId?: string;
}

type LogLevel = 'minimal' | 'verbose';

class AppLogger {
  private static instance: AppLogger;
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private isProduction = process.env.NODE_ENV === 'production';
  private logLevel: LogLevel = 'minimal';
  private subscribers: ((logs: LogEntry[]) => void)[] = [];

  static getInstance(): AppLogger {
    if (!AppLogger.instance) {
      AppLogger.instance = new AppLogger();
    }
    return AppLogger.instance;
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
    this.log('debug', 'Logger', `Log level changed to ${level}`);
  }

  getLogLevel(): LogLevel {
    return this.logLevel;
  }

  subscribe(callback: (logs: LogEntry[]) => void): () => void {
    this.subscribers.push(callback);
    // Return unsubscribe function
    return () => {
      const index = this.subscribers.indexOf(callback);
      if (index > -1) {
        this.subscribers.splice(index, 1);
      }
    };
  }

  private notifySubscribers(): void {
    this.subscribers.forEach(callback => callback([...this.logs]));
  }

  private addLog(entry: LogEntry): void {
    this.logs.unshift(entry); // Add to beginning for newest first
    
    // Keep only recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    this.notifySubscribers();

    // Console output in development
    if (!this.isProduction) {
      const style = this.getConsoleStyle(entry.level);
      const prefix = `[${entry.level.toUpperCase()}] ${entry.category}:`;
      
      if (entry.data || entry.duration) {
        console.log(`%c${prefix}`, style, entry.message, entry.data || '', entry.duration ? `(${entry.duration}ms)` : '');
      } else {
        console.log(`%c${prefix}`, style, entry.message);
      }
    }
  }

  private getConsoleStyle(level: string): string {
    switch (level) {
      case 'error': return 'color: #dc2626; font-weight: bold;';
      case 'warn': return 'color: #d97706; font-weight: bold;';
      case 'info': return 'color: #2563eb;';
      case 'debug': return 'color: #6b7280;';
      case 'performance': return 'color: #059669; font-weight: bold;';
      default: return 'color: #374151;';
    }
  }

  private shouldLog(level: string, category: string): boolean {
    if (this.logLevel === 'minimal') {
      // Only log essential events in minimal mode
      const essentialCategories = ['Error', 'Connection', 'Auth', 'Database'];
      const essentialLevels = ['error', 'warn'];
      
      return essentialCategories.includes(category) || essentialLevels.includes(level);
    }
    
    return true; // Log everything in verbose mode
  }

  log(level: LogEntry['level'], category: string, message: string, data?: Record<string, unknown>, userId?: string): void {
    if (!this.shouldLog(level, category)) return;

    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data,
      userId
    };

    this.addLog(entry);
  }

  info(category: string, message: string, data?: Record<string, unknown>, userId?: string): void {
    this.log('info', category, message, data, userId);
  }

  warn(category: string, message: string, data?: Record<string, unknown>, userId?: string): void {
    this.log('warn', category, message, data, userId);
  }

  error(category: string, message: string, data?: Record<string, unknown>, userId?: string): void {
    this.log('error', category, message, data, userId);
  }

  debug(category: string, message: string, data?: Record<string, unknown>, userId?: string): void {
    this.log('debug', category, message, data, userId);
  }

  // Performance logging with timing
  startTimer(category: string, operation: string, userId?: string): string {
    const timerId = `${category}-${operation}-${Date.now()}`;
    this.debug(category, `Started: ${operation}`, { timerId }, userId);
    return timerId;
  }

  endTimer(timerId: string, category: string, operation: string, userId?: string): void {
    const startTime = parseInt(timerId.split('-').pop() || '0');
    const duration = Date.now() - startTime;

    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      level: 'performance',
      category,
      message: `Completed: ${operation}`,
      duration,
      userId
    };

    this.addLog(entry);
  }

  // App lifecycle events
  appStart(userId?: string): void {
    this.info('App', 'Application started', { url: typeof window !== 'undefined' ? window.location.href : undefined }, userId);
  }

  appReady(userId?: string): void {
    this.info('App', 'Application ready', undefined, userId);
  }

  userConnected(walletAddress: string): void {
    this.info('Auth', 'Wallet connected', { address: walletAddress }, walletAddress);
  }

  userDisconnected(walletAddress?: string): void {
    this.info('Auth', 'Wallet disconnected', undefined, walletAddress);
  }

  // Graph operations
  nodeCreated(nodeType: string, nodeId: string, userId?: string): void {
    this.info('Graph', `${nodeType} created`, { nodeId }, userId);
  }

  nodeUpdated(nodeType: string, nodeId: string, changes: Record<string, unknown>, userId?: string): void {
    this.info('Graph', `${nodeType} updated`, { nodeId, changes }, userId);
  }

  nodeDeleted(nodeType: string, nodeId: string, userId?: string): void {
    this.info('Graph', `${nodeType} deleted`, { nodeId }, userId);
  }

  // Connection events
  websocketConnected(userId?: string): void {
    this.info('Connection', 'WebSocket connected', undefined, userId);
  }

  websocketDisconnected(reason?: string, userId?: string): void {
    this.warn('Connection', 'WebSocket disconnected', { reason }, userId);
  }

  websocketReconnecting(attempt: number, userId?: string): void {
    this.info('Connection', `WebSocket reconnecting (attempt ${attempt})`, undefined, userId);
  }

  // Database operations
  databaseQuery(query: string, duration: number, userId?: string): void {
    if (this.logLevel === 'verbose') {
      this.log('performance', 'Database', `Query executed: ${query.slice(0, 50)}...`, undefined, userId);
    }
  }

  databaseError(query: string, error: string, userId?: string): void {
    this.error('Database', `Query failed: ${query.slice(0, 50)}...`, { error }, userId);
  }

  // API operations
  apiRequest(endpoint: string, method: string, userId?: string): string {
    const timerId = this.startTimer('API', `${method} ${endpoint}`, userId);
    return timerId;
  }

  apiResponse(timerId: string, endpoint: string, method: string, status: number, userId?: string): void {
    this.endTimer(timerId, 'API', `${method} ${endpoint} (${status})`, userId);
  }

  apiError(endpoint: string, method: string, error: string, userId?: string): void {
    this.error('API', `${method} ${endpoint} failed`, { error }, userId);
  }

  // Utility functions
  getLogs(limit?: number): LogEntry[] {
    return limit ? this.logs.slice(0, limit) : [...this.logs];
  }

  getLogsByLevel(level: LogEntry['level'], limit?: number): LogEntry[] {
    const filtered = this.logs.filter(log => log.level === level);
    return limit ? filtered.slice(0, limit) : filtered;
  }

  getLogsByCategory(category: string, limit?: number): LogEntry[] {
    const filtered = this.logs.filter(log => log.category === category);
    return limit ? filtered.slice(0, limit) : filtered;
  }

  clearLogs(): void {
    this.logs = [];
    this.notifySubscribers();
    this.info('Logger', 'Logs cleared');
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

export const logger = AppLogger.getInstance();

// Convenience functions for common operations
export const logNodeOperation = (operation: 'create' | 'update' | 'delete', nodeType: string, nodeId: string, data?: Record<string, unknown>, userId?: string) => {
  switch (operation) {
    case 'create':
      logger.nodeCreated(nodeType, nodeId, userId);
      break;
    case 'update':
      logger.nodeUpdated(nodeType, nodeId, data || {}, userId);
      break;
    case 'delete':
      logger.nodeDeleted(nodeType, nodeId, userId);
      break;
  }
};

export const logApiCall = async <T>(
  endpoint: string,
  method: string,
  operation: () => Promise<T>,
  userId?: string
): Promise<T> => {
  const timerId = logger.apiRequest(endpoint, method, userId);
  try {
    const result = await operation();
    logger.apiResponse(timerId, endpoint, method, 200, userId);
    return result;
  } catch (error) {
    logger.apiError(endpoint, method, error instanceof Error ? error.message : String(error), userId);
    throw error;
  }
}; 