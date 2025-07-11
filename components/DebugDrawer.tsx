'use client';

import { useState, useEffect, useRef } from 'react';
import { logger } from '../lib/logger';
import { useResizable } from '../lib/useResizable';

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

export default function DebugDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isVerbose, setIsVerbose] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Resize functionality - vertical for bottom drawer
  const { size: drawerHeight, isResizing, handleMouseDown, handleTouchStart } = useResizable({
    initialSize: typeof window !== 'undefined' ? window.innerHeight * 0.6 : 400, // 60vh or fallback
    minSize: 200,
    maxSize: typeof window !== 'undefined' ? window.innerHeight * 0.8 : 800, // 80vh max or fallback
    storageKey: 'debug-drawer-height',
    direction: 'vertical',
  });

  useEffect(() => {
    // Subscribe to log updates
    const unsubscribe = logger.subscribe((newLogs) => {
      setLogs(newLogs);
    });

    // Set initial logs
    setLogs(logger.getLogs());

    return unsubscribe;
  }, []);

  useEffect(() => {
    // Update logger verbosity
    logger.setLogLevel(isVerbose ? 'verbose' : 'minimal');
  }, [isVerbose]);

  useEffect(() => {
    // Auto scroll to bottom when new logs arrive
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Escape key to close debug drawer
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen]);

  // Click outside to close drawer
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(event.target as HTMLElement) && isOpen) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [isOpen]);

  const filteredLogs = logs.filter(log => {
    // Filter by level
    if (filter !== 'all' && log.level !== filter) return false;
    
    // Filter by search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        log.message.toLowerCase().includes(searchLower) ||
        log.category.toLowerCase().includes(searchLower) ||
        (log.data && JSON.stringify(log.data).toLowerCase().includes(searchLower))
      );
    }
    
    return true;
  });

  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  const getLevelColor = (level: string): string => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warn': return 'text-yellow-400';
      case 'info': return 'text-blue-400';
      case 'debug': return 'text-gray-400';
      case 'performance': return 'text-green-400';
      default: return 'text-gray-500';
    }
  };

  const getLevelBg = (level: string): string => {
    switch (level) {
      case 'error': return 'bg-red-900/30 border-red-700/50';
      case 'warn': return 'bg-yellow-900/30 border-yellow-700/50';
      case 'info': return 'bg-blue-900/30 border-blue-700/50';
      case 'debug': return 'bg-gray-800/50 border-gray-600/50';
      case 'performance': return 'bg-green-900/30 border-green-700/50';
      default: return 'bg-gray-800/30 border-gray-600/50';
    }
  };

  const exportLogs = () => {
    const dataStr = logger.exportLogs();
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `debug-logs-${new Date().toISOString().slice(0, 19)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearLogs = () => {
    logger.clearLogs();
  };

  const getLogCount = () => {
    const counts = logs.reduce((acc, log) => {
      acc[log.level] = (acc[log.level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return counts;
  };

  const logCounts = getLogCount();

  return (
    <>
      {/* Debug toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-4 right-4 z-50 bg-gray-800 text-white p-3 rounded-full shadow-lg hover:bg-gray-700 transition-all duration-200 ${
          isOpen ? 'bg-blue-600 hover:bg-blue-500' : ''
        }`}
        title="Toggle Debug Drawer"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </button>

      {/* Debug drawer */}
      <div
        ref={drawerRef}
        className={`fixed bottom-0 left-0 right-0 bg-gray-900 border-t-2 border-gray-600 shadow-2xl transition-all duration-300 z-40 ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ height: isOpen ? `${drawerHeight}px` : '0' }}
      >
        {/* Resize handle */}
        <div
          className={`absolute top-0 left-0 right-0 h-1 bg-gray-600/50 hover:bg-blue-500 transition-colors cursor-ns-resize group ${
            isResizing ? 'bg-blue-500' : ''
          }`}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          {/* Visual indicator */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-0.5 w-8 bg-white/30 group-hover:bg-white/60 transition-colors rounded-full" />
        </div>

        <div className="h-full flex flex-col pt-1">
          {/* Header */}
          <div className="bg-gray-800 border-b border-gray-600 p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <h3 className="text-lg font-semibold text-white">Debug Console</h3>
              
              {/* Log level toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isVerbose}
                  onChange={(e) => setIsVerbose(e.target.checked)}
                  className="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
                />
                <span className="text-sm font-medium text-gray-300">
                  {isVerbose ? 'Verbose' : 'Minimal'}
                </span>
              </label>

              {/* Auto scroll toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
                />
                <span className="text-sm text-gray-300">Auto-scroll</span>
              </label>
            </div>

            <div className="flex items-center gap-2 text-xs">
              {/* Log counts */}
              <div className="flex gap-2">
                <span className="px-2 py-1 bg-red-900/40 text-red-300 rounded border border-red-700/50">
                  E: {logCounts.error || 0}
                </span>
                <span className="px-2 py-1 bg-yellow-900/40 text-yellow-300 rounded border border-yellow-700/50">
                  W: {logCounts.warn || 0}
                </span>
                <span className="px-2 py-1 bg-blue-900/40 text-blue-300 rounded border border-blue-700/50">
                  I: {logCounts.info || 0}
                </span>
                <span className="px-2 py-1 bg-green-900/40 text-green-300 rounded border border-green-700/50">
                  P: {logCounts.performance || 0}
                </span>
                <span className="px-2 py-1 bg-gray-700/40 text-gray-300 rounded border border-gray-600/50">
                  D: {logCounts.debug || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="bg-gray-800 border-b border-gray-600 p-3 flex flex-wrap items-center gap-3">
            {/* Filter */}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-gray-700 border-gray-600 text-gray-100 rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Levels</option>
              <option value="error">Errors</option>
              <option value="warn">Warnings</option>
              <option value="info">Info</option>
              <option value="performance">Performance</option>
              <option value="debug">Debug</option>
            </select>

            {/* Search */}
            <input
              type="text"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 rounded px-3 py-1 text-sm flex-1 min-w-32 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={clearLogs}
                className="bg-gray-700 hover:bg-gray-600 text-gray-100 border border-gray-600 px-3 py-1 text-sm rounded transition-colors"
                title="Clear all logs"
              >
                Clear
              </button>
              <button
                onClick={exportLogs}
                className="bg-gray-700 hover:bg-gray-600 text-gray-100 border border-gray-600 px-3 py-1 text-sm rounded transition-colors"
                title="Export logs as JSON"
              >
                Export
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="bg-gray-700 hover:bg-gray-600 text-gray-100 px-3 py-1 text-sm rounded transition-colors"
                title="Close drawer"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Logs */}
          <div
            ref={logsContainerRef}
            className="flex-1 overflow-y-auto p-2 bg-gray-900"
          >
            {filteredLogs.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                {searchTerm || filter !== 'all' ? 'No logs match the current filter' : 'No logs yet'}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-2 rounded border text-xs font-mono ${getLevelBg(log.level)}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-gray-400 min-w-20 text-right">
                        {formatTimestamp(log.timestamp)}
                      </span>
                      <span className={`font-semibold min-w-12 uppercase ${getLevelColor(log.level)}`}>
                        {log.level}
                      </span>
                      <span className="font-medium text-gray-300 min-w-20">
                        {log.category}
                      </span>
                      <span className="text-gray-100 flex-1">
                        {log.message}
                        {log.duration && (
                          <span className="text-green-400 ml-2">
                            ({log.duration}ms)
                          </span>
                        )}
                      </span>
                      {log.userId && (
                        <span className="text-gray-500 text-xs">
                          {log.userId.slice(0, 8)}...
                        </span>
                      )}
                    </div>
                    {log.data && Object.keys(log.data).length > 0 && (
                      <div className="mt-1 ml-24 text-gray-400 bg-gray-800/50 p-1 rounded text-xs border border-gray-600/30">
                        {JSON.stringify(log.data, null, 2)}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
} 