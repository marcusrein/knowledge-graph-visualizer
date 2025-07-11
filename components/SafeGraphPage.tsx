"use client";

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import ErrorBoundary from './ErrorBoundary';
import { errorLogger, safeSetState } from '@/lib/errorHandler';
import { logger } from '@/lib/logger';
import DebugDrawer from './DebugDrawer';

interface SafeGraphPageProps {
  children: React.ReactNode;
}

export default function SafeGraphPage({ children }: SafeGraphPageProps) {
  const { address } = useAccount();
  const [hasUnrecoverableError, setHasUnrecoverableError] = useState(false);

  // Initialize logging
  useEffect(() => {
    logger.appStart(address);
    return () => {
      logger.info('App', 'Application unmounting', undefined, address);
    };
  }, []);

  // Track wallet connection changes
  useEffect(() => {
    if (address) {
      logger.userConnected(address);
    } else {
      logger.userDisconnected();
    }
  }, [address]);

  // Global error handler for unhandled promise rejections
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      errorLogger.logError(
        new Error(`Unhandled Promise Rejection: ${event.reason}`),
        'Global Promise Rejection Handler',
        address
      );
      event.preventDefault(); // Prevent the default browser behavior
    };

    const handleError = (event: ErrorEvent) => {
      errorLogger.logError(
        new Error(`Global Error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`),
        'Global Error Handler',
        address
      );
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, [address]);

  // Emergency reset function
  const handleEmergencyReset = () => {
    try {
      // Clear all local storage
      localStorage.clear();
      
      // Reset state
      safeSetState(setHasUnrecoverableError, false, 'Emergency reset', address);
      
      // Reload the page after a brief delay
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      errorLogger.logError(error instanceof Error ? error : new Error(String(error)), 'Emergency reset failed', address);
      // Force reload if reset fails
      window.location.reload();
    }
  };

  if (hasUnrecoverableError) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-red-50 border border-red-200 rounded-lg p-6 text-center space-y-4">
          <div className="text-red-600">
            <h1 className="text-xl font-bold">Application Error</h1>
            <p className="text-sm mt-2">
              The application encountered an unrecoverable error. This has been logged for review.
            </p>
          </div>
          <div className="space-y-2">
            <button
              onClick={handleEmergencyReset}
              className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Reset Application
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
            >
              Reload Page
            </button>
          </div>
          <p className="text-xs text-gray-500">
            If this problem persists, please contact support.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary
      context="Main Application"
      fallback={
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center space-y-4">
            <div className="text-yellow-700">
              <h1 className="text-xl font-bold">Something went wrong</h1>
              <p className="text-sm mt-2">
                A component failed to render properly. This error has been logged.
              </p>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => window.location.reload()}
                className="w-full px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors"
              >
                Refresh Page
              </button>
              <button
                onClick={handleEmergencyReset}
                className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              >
                Reset Application
              </button>
            </div>
          </div>
        </div>
      }
    >
      <ErrorBoundary context="Graph Visualization">
        <ErrorBoundary context="Real-time Sync">
          {children}
        </ErrorBoundary>
      </ErrorBoundary>
      <DebugDrawer />
    </ErrorBoundary>
  );
} 