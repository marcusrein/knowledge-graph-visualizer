// Comprehensive crash recovery service
import { errorLogger } from './errorHandler';

interface CrashReport {
  type: 'build_error' | 'network_error' | 'websocket_error' | 'react_error' | 'unknown';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  stack?: string;
  userAgent?: string;
  timestamp: string;
  recoveryAction?: string;
}

class CrashRecoveryService {
  private static instance: CrashRecoveryService;
  private recoveryAttempts = new Map<string, number>();
  private maxRecoveryAttempts = 3;
  private isRecovering = false;

  static getInstance(): CrashRecoveryService {
    if (!CrashRecoveryService.instance) {
      CrashRecoveryService.instance = new CrashRecoveryService();
    }
    return CrashRecoveryService.instance;
  }

  initialize(): void {
    this.setupGlobalErrorHandlers();
    this.setupNetworkMonitoring();
    this.setupPerformanceMonitoring();
    console.log('🛡️ Crash Recovery Service initialized');
  }

  private setupGlobalErrorHandlers(): void {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason;
      const crashReport = this.analyzeCrash(error);
      
      if (this.shouldRecover(crashReport)) {
        event.preventDefault(); // Prevent default browser behavior
        this.attemptRecovery(crashReport);
      } else {
        errorLogger.logError(
          new Error(`Unhandled Promise Rejection: ${error}`),
          'Global Promise Rejection Handler'
        );
      }
    });

    // Handle global JavaScript errors
    window.addEventListener('error', (event) => {
      const crashReport: CrashReport = {
        type: this.categorizeError(event.message),
        severity: this.assessSeverity(event.message),
        message: event.message,
        stack: event.error?.stack,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
      };

      if (this.shouldRecover(crashReport)) {
        this.attemptRecovery(crashReport);
      } else {
        errorLogger.logError(
          new Error(`Global Error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`),
          'Global Error Handler'
        );
      }
    });

    // Handle resource loading errors (like manifest files)
    window.addEventListener('error', (event) => {
      if (event.target && event.target !== window) {
        const target = event.target as HTMLElement;
        if (target.tagName === 'SCRIPT' || target.tagName === 'LINK') {
          const crashReport: CrashReport = {
            type: 'build_error',
            severity: 'high',
            message: `Failed to load resource: ${target.tagName === 'SCRIPT' ? (target as HTMLScriptElement).src : (target as HTMLLinkElement).href}`,
            timestamp: new Date().toISOString(),
            recoveryAction: 'reload_page'
          };
          
          this.handleBuildError(crashReport);
        }
      }
    }, true);
  }

  private setupNetworkMonitoring(): void {
    // Monitor online/offline status
    window.addEventListener('online', () => {
      console.log('📶 Network connection restored');
      if (this.isRecovering) {
        this.retryFailedOperations();
      }
    });

    window.addEventListener('offline', () => {
      console.log('📵 Network connection lost');
      this.showOfflineMessage();
    });
  }

  private setupPerformanceMonitoring(): void {
    // Monitor memory usage and performance
    if ('memory' in performance) {
      setInterval(() => {
        const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
        if (memory && memory.usedJSHeapSize > memory.jsHeapSizeLimit * 0.9) {
          console.warn('⚠️ High memory usage detected');
          this.handleMemoryPressure();
        }
      }, 30000); // Check every 30 seconds
    }
  }

  private analyzeCrash(error: Error | Event | unknown): CrashReport {
    const errorMessage = (error as Error)?.message || error?.toString() || 'Unknown error';
    
    return {
      type: this.categorizeError(errorMessage),
      severity: this.assessSeverity(errorMessage),
      message: errorMessage,
      stack: (error as Error)?.stack,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString()
    };
  }

  private categorizeError(message: string): CrashReport['type'] {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('chunk') || 
        lowerMessage.includes('manifest') || 
        lowerMessage.includes('module not found') ||
        lowerMessage.includes('turbopack')) {
      return 'build_error';
    }
    
    if (lowerMessage.includes('network') || 
        lowerMessage.includes('fetch') ||
        lowerMessage.includes('connection')) {
      return 'network_error';
    }
    
    if (lowerMessage.includes('websocket') || 
        lowerMessage.includes('socket')) {
      return 'websocket_error';
    }
    
    if (lowerMessage.includes('react') || 
        lowerMessage.includes('component') ||
        lowerMessage.includes('render')) {
      return 'react_error';
    }
    
    return 'unknown';
  }

  private assessSeverity(message: string): CrashReport['severity'] {
    const lowerMessage = message.toLowerCase();
    
    // Critical errors that require immediate action
    if (lowerMessage.includes('chunk') ||
        lowerMessage.includes('manifest') ||
        lowerMessage.includes('module not found')) {
      return 'critical';
    }
    
    // High severity errors
    if (lowerMessage.includes('network error') ||
        lowerMessage.includes('failed to fetch') ||
        lowerMessage.includes('websocket')) {
      return 'high';
    }
    
    // Medium severity errors
    if (lowerMessage.includes('component') ||
        lowerMessage.includes('render') ||
        lowerMessage.includes('hook')) {
      return 'medium';
    }
    
    return 'low';
  }

  private shouldRecover(crashReport: CrashReport): boolean {
    const key = `${crashReport.type}-${crashReport.severity}`;
    const attempts = this.recoveryAttempts.get(key) || 0;
    
    // Always attempt recovery for critical build errors
    if (crashReport.type === 'build_error' && crashReport.severity === 'critical') {
      return attempts < this.maxRecoveryAttempts;
    }
    
    // Recover from network errors if not too many attempts
    if (crashReport.type === 'network_error' && attempts < 2) {
      return true;
    }
    
    // Recover from WebSocket errors
    if (crashReport.type === 'websocket_error' && attempts < this.maxRecoveryAttempts) {
      return true;
    }
    
    // Don't auto-recover from React errors - let ErrorBoundary handle them
    if (crashReport.type === 'react_error') {
      return false;
    }
    
    return attempts < 1; // Only try once for unknown errors
  }

  private async attemptRecovery(crashReport: CrashReport): Promise<void> {
    if (this.isRecovering) return;
    
    const key = `${crashReport.type}-${crashReport.severity}`;
    const attempts = this.recoveryAttempts.get(key) || 0;
    this.recoveryAttempts.set(key, attempts + 1);
    this.isRecovering = true;

    console.log(`🔧 Attempting recovery for ${crashReport.type} (attempt ${attempts + 1})`);

    try {
      switch (crashReport.type) {
        case 'build_error':
          await this.handleBuildError(crashReport);
          break;
        case 'network_error':
          await this.handleNetworkError(crashReport);
          break;
        case 'websocket_error':
          await this.handleWebSocketError(crashReport);
          break;
        default:
          await this.handleGenericError(crashReport);
      }
    } catch (error) {
      console.error('Recovery attempt failed:', error);
    } finally {
      this.isRecovering = false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async handleBuildError(_crashReport: CrashReport): Promise<void> {
    console.log('🏗️ Handling build error...');
    
    // Show user-friendly message
    this.showRecoveryMessage('Build Error Detected', 'Restarting application...', 'info');
    
    // Clear caches that might be corrupted
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.log('✅ Cleared service worker caches');
      } catch (error) {
        console.warn('Failed to clear caches:', error);
      }
    }
    
    // Clear relevant localStorage items
    const buildRelatedKeys = [
      'nextjs',
      'webpack',
      'turbopack',
      '__next'
    ].filter(key => localStorage.getItem(key));
    
    buildRelatedKeys.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.warn(`Failed to clear localStorage key ${key}:`, error);
      }
    });
    
    // Force reload after a delay
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  }

  private async handleNetworkError(crashReport: CrashReport): Promise<void> {
    console.log('🌐 Handling network error...');
    
    if (!navigator.onLine) {
      this.showOfflineMessage();
      return;
    }
    
    // Try to restore network operations
    this.showRecoveryMessage('Network Error', 'Retrying connection...', 'warning');
    
    // Wait a bit and try again
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test connectivity
    try {
      await fetch(window.location.origin, { method: 'HEAD', cache: 'no-cache' });
      this.hideRecoveryMessage();
      console.log('✅ Network connectivity restored');
    } catch {
      console.warn('Network still unavailable');
      setTimeout(() => this.handleNetworkError(crashReport), 5000);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async handleWebSocketError(_crashReport: CrashReport): Promise<void> {
    console.log('🔌 Handling WebSocket error...');
    
    this.showRecoveryMessage('Connection Lost', 'Reconnecting...', 'warning');
    
    // Emit custom event for WebSocket reconnection
    window.dispatchEvent(new CustomEvent('websocket-recovery-needed'));
    
    // Auto-hide message after a delay
    setTimeout(() => {
      this.hideRecoveryMessage();
    }, 3000);
  }

  private async handleGenericError(crashReport: CrashReport): Promise<void> {
    console.log('⚙️ Handling generic error...');
    
    // For unknown errors, just log and continue
    errorLogger.logError(
      new Error(crashReport.message),
      'Crash Recovery - Generic Error'
    );
  }

  private handleMemoryPressure(): void {
    console.log('🧠 Handling memory pressure...');
    
    // Clear non-essential caches
    try {
      // Clear React Query cache of old data
      window.dispatchEvent(new CustomEvent('clear-non-essential-cache'));
      
      // Force garbage collection if available
      if ('gc' in window) {
        (window as Window & { gc?: () => void }).gc?.();
      }
      
    } catch (error) {
      console.warn('Failed to handle memory pressure:', error);
    }
  }

  private retryFailedOperations(): void {
    // Emit event for components to retry failed operations
    window.dispatchEvent(new CustomEvent('retry-failed-operations'));
  }

  private showOfflineMessage(): void {
    this.showRecoveryMessage(
      'You\'re Offline', 
      'Check your internet connection. The app will continue working with cached data.',
      'error'
    );
  }

  private showRecoveryMessage(title: string, message: string, type: 'info' | 'warning' | 'error'): void {
    // Remove existing recovery message
    this.hideRecoveryMessage();
    
    const colors = {
      info: 'bg-blue-500',
      warning: 'bg-yellow-500', 
      error: 'bg-red-500'
    };
    
    const messageEl = document.createElement('div');
    messageEl.id = 'crash-recovery-message';
    messageEl.className = `fixed top-4 right-4 ${colors[type]} text-white px-4 py-3 rounded-lg shadow-lg z-[9999] max-w-sm`;
    messageEl.innerHTML = `
      <div class="flex items-center space-x-2">
        <div class="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
        <div>
          <div class="font-medium">${title}</div>
          <div class="text-sm opacity-90">${message}</div>
        </div>
      </div>
    `;
    
    document.body.appendChild(messageEl);
  }

  private hideRecoveryMessage(): void {
    const existing = document.getElementById('crash-recovery-message');
    if (existing) {
      existing.remove();
    }
  }

  // Public method to manually trigger recovery
  public triggerEmergencyRecovery(): void {
    console.log('🚨 Emergency recovery triggered');
    
    const crashReport: CrashReport = {
      type: 'unknown',
      severity: 'critical',
      message: 'Manual emergency recovery',
      timestamp: new Date().toISOString(),
      recoveryAction: 'full_reset'
    };
    
    this.handleBuildError(crashReport);
  }

  // Reset recovery attempt counters
  public resetRecoveryCounters(): void {
    this.recoveryAttempts.clear();
    console.log('🔄 Recovery counters reset');
  }
}

// Global singleton instance
export const crashRecovery = CrashRecoveryService.getInstance();

// Initialize on import in browser environment
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => crashRecovery.initialize());
  } else {
    crashRecovery.initialize();
  }
} 