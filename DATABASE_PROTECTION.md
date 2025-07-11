# Database Protection System

This document outlines the comprehensive database protection system implemented to prevent database bloat, limit rapid writes, and ensure security and performance.

## Overview

The protection system provides multiple layers of security:

1. **Rate Limiting** - Prevents users from making too many database writes
2. **Size Limits** - Restricts the size of data that can be stored
3. **User Quotas** - Limits the total number of entities/relations per user
4. **Automatic Cleanup** - Removes old data to prevent bloat
5. **Monitoring & Alerts** - Tracks database health and usage
6. **Input Sanitization** - Cleans and validates all input data

## Features

### 1. Rate Limiting

Prevents abuse by limiting database writes per user:

- **30 writes per minute** - Short-term burst protection
- **200 writes per hour** - Medium-term abuse prevention  
- **1000 writes per day** - Long-term quota management

When limits are exceeded, users receive a `429 Too Many Requests` response with a `retryAfter` time.

### 2. Size Limits

Protects against oversized data:

- **Labels**: Maximum 200 characters
- **Relation Types**: Maximum 100 characters
- **Properties**: Maximum 10KB per entity/relation
- **Database Size**: Warning at 100MB, hard limit at 500MB

### 3. User Quotas

Prevents individual users from consuming too many resources:

- **Entities**: Maximum 1,000 per user
- **Relations**: Maximum 2,000 per user
- **Total Size**: Tracked per user

### 4. Automatic Cleanup

Scheduled cleanup to prevent database bloat:

- **Edit History**: Automatically deletes records older than 30 days
- **Development**: Runs every hour for testing
- **Production**: Runs daily at scheduled times
- **Manual Trigger**: Admin can trigger cleanup via API

### 5. Database Monitoring

Real-time monitoring of database health:

- **Size Tracking**: Monitors total database size
- **Table Statistics**: Tracks record counts per table
- **Health Score**: 0-100 score based on various metrics
- **Alert Levels**: Healthy, Warning, Critical status

### 6. Input Sanitization

All user input is automatically cleaned:

- **String Trimming**: Removes excess whitespace
- **Length Limits**: Enforces maximum string lengths
- **JSON Validation**: Ensures valid JSON in properties
- **Number Validation**: Ensures finite numbers only

## Implementation

### Core Files

- `lib/databaseProtection.ts` - Main protection logic
- `lib/databaseCleanup.ts` - Cleanup scheduler
- `lib/database.ts` - Enhanced database functions with protection
- `app/api/database-status/route.ts` - Monitoring API endpoint

### Integration Points

The protection system is integrated at multiple levels:

1. **Database Layer**: `createEntity()` and `updateEntity()` functions
2. **API Layer**: Relations API routes (`/api/relations`)
3. **Validation Layer**: All operations validated before execution
4. **Monitoring Layer**: Continuous health monitoring

## Configuration

### Environment Variables

```bash
# Enable protection system (default: true in production)
ENABLE_DB_PROTECTION=true

# Cleanup schedule (default: daily in production, hourly in development)
CLEANUP_SCHEDULE=daily
```

### Rate Limits Configuration

Default limits are defined in `lib/databaseProtection.ts`:

```typescript
const RATE_LIMITS = {
  WRITES_PER_MINUTE: 30,
  WRITES_PER_HOUR: 200,
  WRITES_PER_DAY: 1000,
  PROPERTIES_SIZE_KB: 10,
  LABEL_MAX_LENGTH: 200,
  RELATION_TYPE_MAX_LENGTH: 100,
  MAX_ENTITIES_PER_USER: 1000,
  MAX_RELATIONS_PER_USER: 2000,
  EDIT_HISTORY_RETENTION_DAYS: 30,
  DATABASE_SIZE_WARNING_MB: 100,
  DATABASE_SIZE_LIMIT_MB: 500
};
```

## API Endpoints

### Database Status Monitoring

**GET** `/api/database-status`

Returns comprehensive database health information:

```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "database": {
    "sizeKB": 1024,
    "sizeMB": 1.0,
    "tables": {
      "entities": 150,
      "relations": 75,
      "edit_history": 500
    }
  },
  "protection": {
    "rateLimits": { "..." },
    "activeUsers": 5,
    "quotaTracking": 3
  },
  "cleanup": {
    "isRunning": true,
    "nextCleanup": "Scheduled",
    "lastCleanup": "See logs for details"
  },
  "health": {
    "status": "healthy",
    "issues": [],
    "score": 100
  }
}
```

**Query Parameters:**
- `users=true` - Include user statistics
- `userAddress=0x123...` - Get specific user quota

### Admin Actions

**POST** `/api/database-status`

Available actions:

```json
{
  "action": "cleanup"
}
```

```json
{
  "action": "reset-user-limits",
  "userAddress": "0x123..."
}
```

```json
{
  "action": "start-cleanup-scheduler"
}
```

```json
{
  "action": "stop-cleanup-scheduler"
}
```

## Error Handling

The protection system provides user-friendly error messages:

### Rate Limiting Errors

```json
{
  "error": "Rate limit exceeded: too many operations per minute",
  "retryAfter": 45
}
```

### Size Limit Errors

```json
{
  "error": "Label too long (max 200 characters)"
}
```

### Quota Errors

```json
{
  "error": "Entity limit reached (max 1000 entities per user)"
}
```

### Database Bloat Errors

```json
{
  "error": "Database size limit exceeded (520.1MB / 500MB). Please contact support."
}
```

## Monitoring & Alerts

### Health Status Levels

- **Healthy** (90-100 points): All systems normal
- **Warning** (70-89 points): Some issues detected, monitoring required
- **Critical** (0-69 points): Immediate attention required

### Common Warning Triggers

- Database size > 100MB
- Edit history > 10,000 records
- Cleanup scheduler not running
- High rate of failed operations

### Critical Alert Triggers

- Database size > 400MB
- Edit history > 50,000 records
- Protection system errors
- Database access failures

## Performance Impact

The protection system is designed to be lightweight:

- **Rate Limiting**: In-memory counters, ~1ms overhead
- **Size Validation**: String length checks, ~0.1ms overhead
- **Quota Checks**: Cached values, refreshed every 5 minutes
- **Cleanup**: Runs in background, minimal impact
- **Monitoring**: Passive collection, no performance impact

## Development vs Production

### Development Mode

- Hourly cleanup for faster testing
- More permissive limits for development work
- Detailed logging and debugging information
- Rate limit warnings instead of blocks

### Production Mode

- Daily cleanup for optimal performance
- Full protection enabled
- Automatic cleanup scheduler starts on boot
- Error logging to persistent storage

## Maintenance

### Regular Tasks

1. **Monitor database health** via `/api/database-status`
2. **Review cleanup logs** for any issues
3. **Check user quotas** for potential abuse
4. **Monitor error rates** in protection system

### Emergency Procedures

#### Database Size Critical

1. Trigger manual cleanup: `POST /api/database-status {"action": "cleanup"}`
2. Review largest users and their quotas
3. Consider increasing limits temporarily
4. Plan for database scaling

#### Rate Limiting Issues

1. Check if legitimate user is being blocked
2. Reset user limits: `{"action": "reset-user-limits", "userAddress": "..."}`
3. Review rate limit configuration
4. Investigate potential abuse patterns

#### Protection System Failure

1. Check error logs for specific failures
2. Restart cleanup scheduler if needed
3. Verify database connectivity
4. Consider disabling protection temporarily if critical

## Security Considerations

### Data Protection

- All input is sanitized before storage
- SQL injection protection via prepared statements
- No direct database access without validation
- Rate limiting prevents brute force attacks

### Privacy

- User addresses are tracked for quotas but not exposed
- No sensitive data is logged
- Cleanup removes old edit history automatically

### Access Control

- Admin endpoints require authentication (to be implemented)
- User-specific quotas prevent resource monopolization
- Monitoring data shows aggregates, not individual user data

## Future Enhancements

### Planned Features

1. **Redis Integration** - Replace in-memory rate limiting with Redis
2. **Advanced Analytics** - User behavior analysis and predictions
3. **Dynamic Limits** - Adjust limits based on system load
4. **Email Alerts** - Notify administrators of critical issues
5. **User Dashboard** - Allow users to see their own quotas and usage

### Scalability Improvements

1. **Database Sharding** - Distribute data across multiple databases
2. **Read Replicas** - Separate read/write operations
3. **Caching Layer** - Reduce database load with Redis/Memcached
4. **Queue System** - Handle high-volume writes asynchronously

## Troubleshooting

### Common Issues

**"Rate limit exceeded" errors for legitimate users**
- Check if user is actually making too many requests
- Consider increasing limits for specific users
- Review if bot/automation is causing issues

**Database size growing rapidly**
- Run manual cleanup
- Check for users creating excessive data
- Review edit history retention settings

**Protection system not working**
- Verify imports are correct in API routes
- Check error logs for validation failures
- Ensure database connection is working

**Cleanup not running**
- Check if scheduler is started
- Review cleanup logs for errors
- Manually trigger cleanup to test

### Debug Commands

```bash
# Check database status
curl http://localhost:3001/api/database-status

# Trigger manual cleanup
curl -X POST http://localhost:3001/api/database-status \
  -H "Content-Type: application/json" \
  -d '{"action": "cleanup"}'

# Reset user limits
curl -X POST http://localhost:3001/api/database-status \
  -H "Content-Type: application/json" \
  -d '{"action": "reset-user-limits", "userAddress": "0x123..."}'
```

## Conclusion

The database protection system provides comprehensive safeguards against data bloat, abuse, and performance issues while maintaining a good user experience. The multi-layered approach ensures that even if one protection mechanism fails, others will continue to protect the system.

Regular monitoring and maintenance are key to ensuring the system continues to operate effectively as usage grows. 