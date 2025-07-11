# Production Error Handling System

This document outlines the comprehensive error handling system implemented for production deployment.

## Overview

The application now includes multiple layers of error handling to ensure graceful degradation and automatic recovery:

1. **Global Error Boundaries** - React-level error catching
2. **API Error Handling** - Resilient API calls with retry logic  
3. **Database Error Handling** - Safe database operations
4. **WebSocket Error Handling** - Graceful real-time sync failures
5. **Automatic Logging** - All errors logged to files for debugging
6. **Auto-Recovery** - Automatic restart mechanisms

## Error Handling Components

### 1. Error Logger (`lib/errorHandler.ts`)

**Features:**
- Automatic error logging to daily log files (`logs/errors_YYYY-MM-DD.log`)
- Fallback to localStorage if server logging fails
- Context-aware error reporting
- Production vs development logging modes

**Key Functions:**
- `errorLogger.logError()` - Log any error with context
- `safeAsync()` - Wrap async operations with error handling
- `retryOperation()` - Retry failed operations with exponential backoff
- `safeSetState()` - Safe React state updates

### 2. Error Boundaries (`components/ErrorBoundary.tsx`)

**Features:**
- Catches all React component errors
- Provides graceful fallback UI
- Automatic restart functionality
- Context-specific error messages

**Usage:**
```tsx
<ErrorBoundary context="Graph Visualization">
  <YourComponent />
</ErrorBoundary>
```

### 3. Safe Mutations (`lib/safeMutations.ts`)

**Features:**
- Automatic retry logic for failed API calls
- User-friendly error messages
- Fallback data for failed queries
- WebSocket send validation

**Available Hooks:**
- `useSafeEntityMutation()` - Safe entity updates
- `useSafeEntityDelete()` - Safe entity deletion
- `useSafeRelationMutation()` - Safe relation updates
- `useSafeWebSocketSend()` - Safe WebSocket messaging

### 4. Safe Graph Page (`components/SafeGraphPage.tsx`)

**Features:**
- Global error handlers for unhandled promises
- Emergency reset functionality
- Nested error boundaries for different app sections
- Automatic state recovery

## Error Logging

### File Structure
```
logs/
  errors_2024-07-11.log
  errors_2024-07-12.log
  ...
```

### Log Format
```
=====================================
TIMESTAMP: 2024-07-11T15:30:45.123Z
CONTEXT: Graph Node Building
ERROR: Parent node 65374320-c1dd-4a20-8821-e98a6b279c4c not found
URL: http://localhost:3001/
USER_AGENT: Mozilla/5.0...
USER_ID: 0xFeb1...9502
STACK:
  at buildNodes (page.tsx:1445:19)
  at useEffect (page.tsx:1234:13)
  ...
=====================================
```

## Recovery Mechanisms

### 1. Automatic Restart
- Components automatically restart after errors
- Invalid state is cleared and reset
- Failed operations are retried

### 2. Emergency Reset
- Clears all localStorage data
- Resets application state
- Forces page reload if needed

### 3. Graceful Degradation
- API failures return fallback data
- WebSocket failures fallback to polling
- Missing data shows placeholder content

## API Error Handling

### Database Resilience
- All database operations wrapped in try-catch
- Invalid data returns empty arrays instead of errors
- Orphaned references are automatically cleaned up

### Network Resilience
- Automatic retry with exponential backoff
- Request timeout handling
- Offline state detection

## Development vs Production

### Development Mode
- Detailed console logging
- Full error messages in UI
- Debug information included

### Production Mode
- Minimal user-facing error messages
- All errors logged to files
- Silent fallbacks for non-critical failures

## Monitoring

### Error Log Analysis
Monitor the `logs/` directory for:
- High error frequency patterns
- Specific error types
- User-specific issues
- Performance degradation

### Key Metrics to Track
- Error frequency per day
- Most common error contexts
- User impact (anonymous IDs)
- Recovery success rates

## Troubleshooting

### Common Issues

**"Parent node not found" errors:**
- Caused by orphaned node references
- Automatically cleaned up in production
- Check database integrity if persistent

**WebSocket connection failures:**
- Fallback to HTTP polling
- Automatic reconnection attempts
- Check network connectivity

**Database errors:**
- Return empty data sets
- Check disk space and permissions
- Monitor SQLite file integrity

### Emergency Procedures

**If app becomes unresponsive:**
1. Users can click "Emergency Reset" button
2. Clears all cached data
3. Forces fresh reload
4. All actions are logged

**If errors persist:**
1. Check daily error logs
2. Identify patterns in failures
3. Deploy fixes or rollback
4. Monitor recovery metrics

## Configuration

### Environment Variables
```bash
NODE_ENV=production  # Enables production error handling
NEXT_PUBLIC_LOG_ERRORS=true  # Enable error logging
```

### File Permissions
Ensure the application can write to the `logs/` directory:
```bash
mkdir -p logs
chmod 755 logs
```

## Best Practices

1. **Always use error boundaries** around major components
2. **Wrap API calls** with retry logic using safeMutations
3. **Provide fallback data** for all critical queries
4. **Test error scenarios** regularly in development
5. **Monitor error logs** daily in production
6. **Keep recovery mechanisms simple** and reliable

## Testing Error Handling

### Manual Testing
1. Disconnect network during operations
2. Corrupt localStorage data
3. Send invalid API requests
4. Trigger React errors in components

### Automated Testing
- Test error boundary rendering
- Verify retry logic functionality
- Validate fallback data behavior
- Check logging output format

This comprehensive error handling system ensures your application remains stable and user-friendly even when unexpected errors occur. 