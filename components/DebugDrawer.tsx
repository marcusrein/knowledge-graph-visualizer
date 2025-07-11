'use client';

import { useState, useEffect, useRef } from 'react';
import { logger } from '../lib/logger';

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
      case 'error': return 'text-red-500';
      case 'warn': return 'text-yellow-500';
      case 'info': return 'text-blue-500';
      case 'debug': return 'text-gray-500';
      case 'performance': return 'text-green-500';
      default: return 'text-gray-400';
    }
  };

  const getLevelBg = (level: string): string => {
    switch (level) {
      case 'error': return 'bg-red-100 border-red-200';
      case 'warn': return 'bg-yellow-100 border-yellow-200';
      case 'info': return 'bg-blue-100 border-blue-200';
      case 'debug': return 'bg-gray-100 border-gray-200';
      case 'performance': return 'bg-green-100 border-green-200';
      default: return 'bg-gray-50 border-gray-200';
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
        className={`fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 shadow-2xl transition-all duration-300 z-40 ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ height: isOpen ? '60vh' : '0' }}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="bg-gray-50 border-b border-gray-200 p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <h3 className="text-lg font-semibold text-gray-800">Debug Console</h3>
              
              {/* Log level toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isVerbose}
                  onChange={(e) => setIsVerbose(e.target.checked)}
                  className="toggle toggle-sm"
                />
                <span className="text-sm font-medium">
                  {isVerbose ? 'Verbose' : 'Minimal'}
                </span>
              </label>

              {/* Auto scroll toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="toggle toggle-sm"
                />
                <span className="text-sm">Auto-scroll</span>
              </label>
            </div>

            <div className="flex items-center gap-2 text-xs">
              {/* Log counts */}
              <div className="flex gap-2">
                <span className="px-2 py-1 bg-red-100 text-red-700 rounded">
                  E: {logCounts.error || 0}
                </span>
                <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded">
                  W: {logCounts.warn || 0}
                </span>
                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                  I: {logCounts.info || 0}
                </span>
                <span className="px-2 py-1 bg-green-100 text-green-700 rounded">
                  P: {logCounts.performance || 0}
                </span>
                <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded">
                  D: {logCounts.debug || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="bg-gray-50 border-b border-gray-200 p-3 flex flex-wrap items-center gap-3">
            {/* Filter */}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="select select-sm select-bordered"
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
              className="input input-sm input-bordered flex-1 min-w-32"
            />

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={clearLogs}
                className="btn btn-sm btn-outline"
                title="Clear all logs"
              >
                Clear
              </button>
              <button
                onClick={exportLogs}
                className="btn btn-sm btn-outline"
                title="Export logs as JSON"
              >
                Export
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="btn btn-sm btn-ghost"
                title="Close drawer"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Logs */}
          <div
            ref={logsContainerRef}
            className="flex-1 overflow-y-auto p-2 bg-gray-50"
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
                      <span className="text-gray-600 min-w-20 text-right">
                        {formatTimestamp(log.timestamp)}
                      </span>
                      <span className={`font-semibold min-w-12 uppercase ${getLevelColor(log.level)}`}>
                        {log.level}
                      </span>
                      <span className="font-medium text-gray-700 min-w-20">
                        {log.category}
                      </span>
                      <span className="text-gray-800 flex-1">
                        {log.message}
                        {log.duration && (
                          <span className="text-green-600 ml-2">
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
                      <div className="mt-1 ml-24 text-gray-600 bg-gray-100 p-1 rounded text-xs">
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