# Debug System Documentation

## Overview

The application now includes a comprehensive debugging and logging system designed to track app performance, user interactions, and system behavior in both development and production environments.

## Components

### 1. Logger System (`lib/logger.ts`)
A centralized logging system that provides:
- **Structured logging** with categories, levels, and metadata
- **Performance tracking** with timing capabilities  
- **Verbose/Minimal modes** for different debugging needs
- **Real-time log streaming** to UI components
- **Export functionality** for debugging and support

#### Log Levels
- `error` - Critical errors and failures
- `warn` - Warning conditions and potential issues  
- `info` - General application events and user actions
- `debug` - Detailed debugging information
- `performance` - Timing and performance metrics

#### Log Categories
- `App` - Application lifecycle events
- `Auth` - Wallet connection/disconnection
- `Graph` - Node creation, updates, deletion
- `Connection` - WebSocket connectivity
- `Database` - Database operations (verbose mode)
- `API` - API request/response timing
- `Component` - React component lifecycle
- `Navigation` - Route/date changes

### 2. Debug Drawer (`components/DebugDrawer.tsx`)
An interactive debugging interface that provides:
- **Bottom drawer interface** accessible via floating button
- **Real-time log display** with auto-scroll functionality
- **Filtering and search** capabilities
- **Log level counts** and statistics
- **Export logs** as JSON for sharing/analysis
- **Verbose/Minimal toggle** for different detail levels

#### Features
- **Log Filtering**: Filter by level (error, warn, info, debug, performance)
- **Search**: Full-text search across messages, categories, and data
- **Auto-scroll**: Automatically scroll to newest logs
- **Export**: Download logs as JSON file for analysis
- **Clear**: Remove all current logs
- **Real-time Updates**: Logs appear immediately as they're generated

### 3. Logging Modes

#### Minimal Mode (Default)
- Logs only essential events: errors, warnings, auth, connections
- Suitable for production monitoring
- Reduced noise and performance impact

#### Verbose Mode  
- Logs everything including debug info and performance metrics
- Database query details and component lifecycle events
- Ideal for development and troubleshooting

## Usage

### Accessing the Debug Drawer
1. Look for the floating **chart icon** in the bottom-right corner
2. Click to open/close the debug drawer
3. Use the **Verbose/Minimal toggle** to change detail level
4. **Filter** and **search** logs as needed
5. **Export** logs when sharing issues with support

### Reading the Logs
Each log entry shows:
- **Timestamp** - Precise time with milliseconds
- **Level** - Color-coded severity (Error=Red, Warn=Yellow, Info=Blue, etc.)
- **Category** - Source system (App, Graph, API, etc.)
- **Message** - Human-readable description
- **Duration** - For performance logs, shows execution time
- **User ID** - Wallet address (truncated) when available
- **Data** - Additional context in JSON format

### Performance Tracking
The system automatically tracks:
- **API Response Times** - All database operations
- **Component Mount/Unmount** - React lifecycle timing
- **WebSocket Operations** - Connection, reconnection timing  
- **Graph Operations** - Node creation, update, deletion
- **Navigation Events** - Date changes, route switches

### Error Context
When errors occur, logs include:
- **Stack traces** and error details
- **User context** (wallet address, current view)
- **Operation context** (what was being attempted)
- **Timing information** (when the error occurred)
- **State information** (relevant app state)

## Integration Points

### Automatic Logging
The following events are automatically logged:
- Application startup/shutdown
- Wallet connect/disconnect
- All API requests/responses
- Graph node operations (create/update/delete)
- WebSocket connection events
- Component mounting/unmounting
- Navigation and date changes
- Error boundary activations

### Manual Logging
Developers can add custom logs using:
```typescript
import { logger } from '@/lib/logger';

// Basic logging
logger.info('Category', 'Message', { data: 'optional' }, userId);
logger.error('Category', 'Error message', { error: details });

// Performance tracking
const timerId = logger.startTimer('Category', 'Operation Name');
// ... do work ...
logger.endTimer(timerId, 'Category', 'Operation Name');

// Convenience functions
logNodeOperation('create', 'topic', nodeId, data, userId);
logApiCall('/api/entities', 'GET', apiOperation, userId);
```

## Production Considerations

### Performance Impact
- **Minimal Mode**: Very low overhead, only essential events
- **Verbose Mode**: Higher overhead, recommended only for debugging
- **Log Rotation**: Automatically keeps only 1000 most recent logs
- **Memory Management**: Logs are cleared on page refresh

### Privacy
- **Private space content** is not logged in detail
- **Wallet addresses** are truncated in display (full address in data)
- **Sensitive operations** log only metadata, not content
- **Personal data** is not included in log exports

### Error Handling
- **Graceful degradation** if logging fails
- **No interference** with main application functionality
- **Fallback mechanisms** for logging system failures
- **Safe JSON serialization** for complex objects

## Development Workflow

### Debugging Issues
1. **Enable Verbose Mode** for detailed information
2. **Reproduce the issue** while monitoring logs
3. **Filter by relevant category** (e.g., "API", "Graph")
4. **Search for error messages** or specific operations
5. **Export logs** for sharing or further analysis

### Performance Analysis
1. **Monitor Performance logs** (green entries)
2. **Look for slow operations** (high duration values)
3. **Track API response times** for database bottlenecks
4. **Monitor component render times** for UI performance

### User Support
1. **Ask users to enable Verbose mode** if needed
2. **Have them reproduce the issue** 
3. **Export and share logs** for analysis
4. **Clear logs** before starting new debug sessions

## Future Enhancements

### Planned Features
- **Remote logging** to server for production monitoring
- **Log aggregation** across multiple users/sessions
- **Performance alerting** for slow operations
- **Historical log storage** beyond current session
- **Log analysis dashboard** for administrators

### Extensibility
- **Plugin system** for custom log processors
- **Webhook integration** for external monitoring
- **Custom categories** for specific features
- **Conditional logging** based on user roles or features 