import React, { Component, ReactNode } from 'react';
import { errorLogger } from '@/lib/errorHandler';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  context?: string;
  enableAutoRestart?: boolean;
  autoRestartDelay?: number;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
  retryCount: number;
  isAutoRestarting: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  private autoRestartTimer?: NodeJS.Timeout;
  private readonly maxRetries = 3;

  constructor(props: Props) {
    super(props);
    this.state = { 
      hasError: false, 
      retryCount: 0,
      isAutoRestarting: false
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    
    // Enhanced error logging with more context
    const errorContext = `React Error Boundary - ${this.props.context || 'Unknown Component'}`;
    const stackInfo = errorInfo.componentStack?.slice(0, 500) || 'No stack info';
    const errorDetails = {
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack?.slice(0, 1000),
      componentStack: stackInfo,
      retryCount: this.state.retryCount,
      props: this.props.context
    };

    errorLogger.logError(error, errorContext, undefined);
    
    // Console log for development
    if (process.env.NODE_ENV === 'development') {
      console.group('🚨 Error Boundary Caught Error');
      console.error('Error:', error);
      console.error('Error Info:', errorInfo);
      console.error('Error Details:', errorDetails);
      console.groupEnd();
    }

    // Auto-restart logic for certain error types
    if (this.props.enableAutoRestart && this.state.retryCount < this.maxRetries) {
      this.scheduleAutoRestart();
    }
  }

  scheduleAutoRestart = () => {
    const delay = this.props.autoRestartDelay || 3000;
    this.setState({ isAutoRestarting: true });
    
    this.autoRestartTimer = setTimeout(() => {
      this.handleRestart();
    }, delay);
  };

  componentWillUnmount() {
    if (this.autoRestartTimer) {
      clearTimeout(this.autoRestartTimer);
    }
  }

  handleRestart = () => {
    if (this.autoRestartTimer) {
      clearTimeout(this.autoRestartTimer);
    }
    
    this.setState(prevState => ({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      retryCount: prevState.retryCount + 1,
      isAutoRestarting: false
    }));
  };

  handleEmergencyReset = () => {
    try {
      // Clear component-specific localStorage items
      const keysToRemove = [
        'kg_completed_steps',
        'kg_hide_checklist',
        'rf-instance-viewport',
        'rf-instance-nodes',
        'rf-instance-edges'
      ];
      
      keysToRemove.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch {
          // Silent fail for localStorage access issues
        }
      });

      // Force a full page reload as last resort
      window.location.reload();
    } catch (error) {
      // If even emergency reset fails, try a simple page reload
      window.location.href = window.location.href;
    }
  };

  getCrashSeverity = (): 'minor' | 'moderate' | 'severe' => {
    const { error, retryCount } = this.state;
    
    if (!error) return 'minor';
    
    // Severe errors that usually require full reset
    const severePatterns = [
      /chunk/i,
      /module.*not.*found/i,
      /network.*error/i,
      /failed.*to.*fetch/i,
      /manifest/i
    ];
    
    // Moderate errors that might be recoverable
    const moderatePatterns = [
      /react.*flow/i,
      /render/i,
      /component/i,
      /hook/i
    ];

    const errorMessage = error.message || '';
    
    if (retryCount >= this.maxRetries) return 'severe';
    if (severePatterns.some(pattern => pattern.test(errorMessage))) return 'severe';
    if (moderatePatterns.some(pattern => pattern.test(errorMessage))) return 'moderate';
    
    return 'minor';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const severity = this.getCrashSeverity();
      const { isAutoRestarting, retryCount, error } = this.state;
      const context = this.props.context || 'Component';

      // Auto-restarting state
      if (isAutoRestarting) {
        return (
          <div className="flex flex-col items-center justify-center min-h-[200px] p-8 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="text-blue-600 text-center space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <h2 className="text-xl font-semibold">Restarting {context}...</h2>
              <p className="text-sm text-blue-500">
                Automatically recovering from error (attempt {retryCount + 1}/{this.maxRetries})
              </p>
            </div>
          </div>
        );
      }

      // Severe errors - recommend full reset
      if (severity === 'severe') {
        return (
          <div className="flex flex-col items-center justify-center min-h-[200px] p-8 bg-red-50 border border-red-200 rounded-lg">
            <div className="text-red-600 text-center space-y-4">
              <h2 className="text-xl font-semibold">Critical Error in {context}</h2>
              <p className="text-sm text-red-500">
                The application encountered a serious error that requires a reset.
              </p>
              {process.env.NODE_ENV === 'development' && error && (
                <details className="text-xs text-left bg-red-100 p-2 rounded">
                  <summary className="cursor-pointer font-medium">Error Details</summary>
                  <pre className="mt-2 whitespace-pre-wrap">{error.message}</pre>
                </details>
              )}
              <div className="space-y-2">
                <button
                  onClick={this.handleEmergencyReset}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                >
                  Reset Application
                </button>
                <p className="text-xs text-red-400">
                  This will reload the page and clear temporary data
                </p>
              </div>
            </div>
          </div>
        );
      }

      // Moderate/Minor errors - offer restart options
      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] p-8 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="text-yellow-700 text-center space-y-4">
            <h2 className="text-xl font-semibold">Error in {context}</h2>
            <p className="text-sm text-yellow-600">
              {severity === 'moderate' 
                ? 'A component failed to render properly. You can try restarting it or refresh the page.' 
                : 'A minor error occurred. Restarting should fix it.'}
            </p>
            {process.env.NODE_ENV === 'development' && error && (
              <details className="text-xs text-left bg-yellow-100 p-2 rounded">
                <summary className="cursor-pointer font-medium">Error Details</summary>
                <pre className="mt-2 whitespace-pre-wrap">{error.message}</pre>
              </details>
            )}
            <div className="space-y-2">
              <button
                onClick={this.handleRestart}
                className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors"
              >
                Try Again ({this.maxRetries - retryCount} attempts left)
              </button>
              <button
                onClick={() => window.location.reload()}
                className="block px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
              >
                Refresh Page
              </button>
              {severity === 'moderate' && (
                <button
                  onClick={this.handleEmergencyReset}
                  className="block px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-xs"
                >
                  Emergency Reset
                </button>
              )}
            </div>
            {retryCount > 0 && (
              <p className="text-xs text-yellow-500">
                Previous attempts: {retryCount}
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 