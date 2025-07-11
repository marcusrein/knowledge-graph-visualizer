import { sql as vercelSql } from '@vercel/postgres';
// Switch driver when using Supabase (non-Neon Postgres)
import postgres from 'postgres';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { dbProtection, DatabaseOperation } from './databaseProtection';
import { errorLogger } from './errorHandler';

// Determine which SQL client to use
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const isSupabase = process.env.SUPABASE_URL || (databaseUrl?.includes('supabase.co'));

// Create SQL client based on database type
let sql: any;
let isPostgresDriver = false;

if (isSupabase) {
  sql = postgres(databaseUrl!, { ssl: 'require' });
  isPostgresDriver = true;
} else if (process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
  // If we have POSTGRES_URL but not DATABASE_URL, use postgres driver
  sql = postgres(process.env.POSTGRES_URL, { ssl: 'require' });
  isPostgresDriver = true;
} else {
  // Use Vercel's built-in PostgreSQL client
  sql = vercelSql;
  isPostgresDriver = false;
}

// Environment detection
const isProduction = process.env.NODE_ENV === 'production';
const hasVercelDB = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
let usePostgres = isProduction && hasVercelDB;

console.log(`[Database] Environment detection:`);
console.log(`  - NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`  - DATABASE_URL exists: ${Boolean(process.env.DATABASE_URL)}`);
console.log(`  - POSTGRES_URL exists: ${Boolean(process.env.POSTGRES_URL)}`);
console.log(`  - SUPABASE_URL exists: ${Boolean(process.env.SUPABASE_URL)}`);
console.log(`  - databaseUrl: ${databaseUrl ? `${databaseUrl.substring(0, 20)}...` : 'undefined'}`);
console.log(`  - isSupabase: ${isSupabase}`);
console.log(`  - isProduction: ${isProduction}`);
console.log(`  - hasVercelDB: ${hasVercelDB}`);
console.log(`  - usePostgres: ${usePostgres}`);
console.log(`[Database] Using ${usePostgres ? 'PostgreSQL' : 'SQLite'} (production: ${isProduction}, vercelDB: ${hasVercelDB})`);

// SQLite setup for development
let sqliteDb: Database.Database | null = null;

if (!usePostgres) {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'graph.sqlite');
  sqliteDb = new Database(dbPath);
  sqliteDb.pragma('journal_mode = WAL');
}

// Database initialization
export async function initializeDatabase() {
  if (usePostgres) {
    try {
      return await initializePostgres();
    } catch (error) {
      console.error('[Database] PostgreSQL initialization failed, falling back to SQLite:', error);
      console.log('[Database] Setting up SQLite fallback...');
      
      // Switch to SQLite mode
      usePostgres = false;
      
      // Initialize SQLite as fallback
      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      const dbPath = path.join(dataDir, 'graph.sqlite');
      if (!sqliteDb) {
        sqliteDb = new Database(dbPath);
        sqliteDb.pragma('journal_mode = WAL');
      }
      
      return initializeSQLite();
    }
  } else {
    return initializeSQLite();
  }
}

async function initializePostgres() {
  try {
    console.log('[Database] Initializing PostgreSQL...');
    console.log('[Database] Testing connection...');
    
    // Test the connection first
    await sql`SELECT 1`;
    console.log('[Database] Connection successful');
    
    // Create entities table
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS entities (
          id SERIAL PRIMARY KEY,
          nodeId TEXT UNIQUE NOT NULL,
          label TEXT NOT NULL,
          type TEXT NOT NULL,
          userAddress TEXT,
          x REAL,
          y REAL,
          properties JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW(),
          parentId TEXT,
          visibility TEXT DEFAULT 'public',
          width REAL,
          height REAL
        )
      `;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        console.log('[Database] Entities table/sequence already exists, continuing...');
      } else {
        throw error;
      }
    }

    // Create relations table
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS relations (
          id SERIAL PRIMARY KEY,
          sourceId TEXT,
          targetId TEXT,
          relationType TEXT NOT NULL,
          userAddress TEXT,
          x REAL,
          y REAL,
          properties JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW()
        )
      `;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        console.log('[Database] Relations table/sequence already exists, continuing...');
      } else {
        throw error;
      }
    }

    // Create relation_links table
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS relation_links (
          id SERIAL PRIMARY KEY,
          relationId INTEGER REFERENCES relations(id) ON DELETE CASCADE,
          entityId TEXT,
          role TEXT CHECK(role IN ('source','target')),
          created_at TIMESTAMP DEFAULT NOW()
        )
      `;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        console.log('[Database] Relation_links table/sequence already exists, continuing...');
      } else {
        throw error;
      }
    }

    // Create edit_history table
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS edit_history (
          id SERIAL PRIMARY KEY,
          nodeId TEXT NOT NULL,
          nodeType TEXT NOT NULL CHECK(nodeType IN ('entity','relation')),
          action TEXT NOT NULL CHECK(action IN ('create','update','delete')),
          field TEXT,
          oldValue TEXT,
          newValue TEXT,
          editorAddress TEXT,
          timestamp TIMESTAMP DEFAULT NOW(),
          created_at TIMESTAMP DEFAULT NOW()
        )
      `;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        console.log('[Database] Edit_history table/sequence already exists, continuing...');
      } else {
        throw error;
      }
    }

    // Create indexes for better performance
    await sql`CREATE INDEX IF NOT EXISTS idx_entities_nodeId ON entities(nodeId)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_entities_date ON entities(DATE(created_at))`;
    await sql`CREATE INDEX IF NOT EXISTS idx_entities_userAddress ON entities(userAddress)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_relations_date ON relations(DATE(created_at))`;
    await sql`CREATE INDEX IF NOT EXISTS idx_relation_links_relationId ON relation_links(relationId)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_relation_links_entityId ON relation_links(entityId)`;

    console.log('[Database] PostgreSQL initialized successfully');
  } catch (error) {
    console.error('[Database] Error initializing PostgreSQL:', error);
    throw error;
  }
}

function initializeSQLite() {
  if (!sqliteDb) throw new Error('SQLite not initialized');
  
  console.log('[Database] Initializing SQLite...');
  
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nodeId TEXT,
      label TEXT,
      type TEXT,
      userAddress TEXT,
      x REAL,
      y REAL,
      properties TEXT,
      created_at TEXT,
      parentId TEXT,
      visibility TEXT DEFAULT 'public',
      width REAL,
      height REAL
    );

    CREATE TABLE IF NOT EXISTS relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sourceId TEXT,
      targetId TEXT,
      relationType TEXT,
      userAddress TEXT,
      x REAL,
      y REAL,
      properties TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS relation_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      relationId INTEGER,
      entityId TEXT,
      role TEXT CHECK(role IN ('source','target')),
      created_at TEXT,
      FOREIGN KEY(relationId) REFERENCES relations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS edit_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nodeId TEXT NOT NULL,
      nodeType TEXT NOT NULL CHECK(nodeType IN ('entity','relation')),
      action TEXT NOT NULL CHECK(action IN ('create','update','delete')),
      field TEXT,
      oldValue TEXT,
      newValue TEXT,
      editorAddress TEXT,
      timestamp TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Add missing columns for existing databases
  const alterColumns = [
    'ALTER TABLE entities ADD COLUMN x REAL',
    'ALTER TABLE entities ADD COLUMN y REAL', 
    'ALTER TABLE entities ADD COLUMN properties TEXT',
    'ALTER TABLE entities ADD COLUMN parentId TEXT',
    "ALTER TABLE entities ADD COLUMN visibility TEXT DEFAULT 'public'",
    'ALTER TABLE entities ADD COLUMN width REAL',
    'ALTER TABLE entities ADD COLUMN height REAL',
    'ALTER TABLE relations ADD COLUMN x REAL',
    'ALTER TABLE relations ADD COLUMN y REAL',
    'ALTER TABLE relations ADD COLUMN properties TEXT'
  ];

  alterColumns.forEach(query => {
    try {
      sqliteDb!.prepare(query).run();
    } catch {
      // Column already exists, ignore
    }
  });

  console.log('[Database] SQLite initialized successfully');
}

// Helper function to get entities for a date
export async function getEntitiesForDate(date: string, userAddress?: string) {
  if (usePostgres) {
    return getEntitiesForDatePostgres(date, userAddress);
  } else {
    return getEntitiesForDateSQLite(date, userAddress);
  }
}

async function getEntitiesForDatePostgres(date: string, userAddress?: string) {
  try {
    console.log(`[Database] QUERY START: Getting entities for date: ${date}, userAddress: ${userAddress}`);
    
    // First, let's see what's actually in the database
    const allEntities = isPostgresDriver 
      ? await sql`SELECT * FROM entities ORDER BY created_at DESC LIMIT 10`
      : await sql`SELECT * FROM entities ORDER BY created_at DESC LIMIT 10`;
    
    const allRows = isPostgresDriver ? allEntities : allEntities?.rows;
    console.log(`[Database] ALL ENTITIES COUNT: ${allRows?.length || 0}`);
    
    if (allRows && allRows.length > 0) {
      console.log(`[Database] SAMPLE ENTITY:`, JSON.stringify(allRows[0]));
    }
    
    // Handle empty date parameter (get all entities) vs specific date
    let result;
    if (date === '') {
      console.log('[Database] Fetching ALL entities (no date filter)');
      result = await sql`
        SELECT * FROM entities 
        ORDER BY created_at ASC
      `;
    } else {
      console.log(`[Database] Fetching entities for specific date: ${date}`);
      // Use timezone-aware date comparison
      result = await sql`
        SELECT * FROM entities 
        WHERE created_at::date = ${date}::date
        ORDER BY created_at ASC
      `;
      
      // If no results, also try with timezone considerations
      const rows = isPostgresDriver ? result : result?.rows;
      if (!rows || rows.length === 0) {
        console.log('[Database] No results with ::date comparison, trying with AT TIME ZONE');
        result = await sql`
          SELECT * FROM entities 
          WHERE (created_at AT TIME ZONE 'UTC')::date = ${date}::date
          ORDER BY created_at ASC
        `;
      }
    }
    
    const resultRows = isPostgresDriver ? result : result?.rows;
    console.log(`[Database] FILTERED QUERY RESULT: ${resultRows?.length || 0} rows (date: ${date})`);
    
    if (!resultRows) {
      console.log('[Database] RETURNING EMPTY ARRAY - no result or rows');
      return [];
    }
    
    return resultRows.map((row: Record<string, unknown>) => {
      // Handle both useraddress and userAddress column names (case sensitivity)
      const rowUserAddress = row.useraddress || row.userAddress;
      
      // PostgreSQL returns column names in lowercase, so we need to map them
      const normalizedRow = {
        id: row.id,
        nodeId: row.nodeid || row.nodeId,  // Handle case sensitivity
        label: row.label,
        type: row.type,
        userAddress: rowUserAddress,
        parentId: row.parentid || row.parentId,
        x: row.x,
        y: row.y,
        width: row.width,
        height: row.height,
        visibility: row.visibility,
        properties: row.properties,
        created_at: row.created_at
      };
      
      if (
        normalizedRow.type === 'group' &&
        normalizedRow.visibility === 'private' &&
        normalizedRow.userAddress &&
        String(normalizedRow.userAddress).toLowerCase() !== (userAddress || '').toLowerCase()
      ) {
        return { ...normalizedRow, label: '', properties: {} };
      }
      return {
        ...normalizedRow,
        properties: typeof normalizedRow.properties === 'string' ? JSON.parse(normalizedRow.properties) : normalizedRow.properties
      };
    });
  } catch (error) {
    console.error('[Database] Error getting entities (PostgreSQL):', error);
    throw error;
  }
}

function getEntitiesForDateSQLite(date: string, userAddress?: string) {
  if (!sqliteDb) throw new Error('SQLite not initialized');
  
  try {
    // If date is empty, get all entities; otherwise filter by date
    const query = date === '' ? 
      `SELECT * FROM entities 
       WHERE (
         type = 'group' 
         OR visibility = 'public' 
         OR userAddress IS NULL 
         OR userAddress = ?
       )
       ORDER BY created_at ASC` :
      `SELECT * FROM entities 
       WHERE DATE(created_at) = ?
       AND (
         type = 'group' 
         OR visibility = 'public' 
         OR userAddress IS NULL 
         OR userAddress = ?
       )
       ORDER BY created_at ASC`;
    
    const stmt = sqliteDb.prepare(query);
    const rows = date === '' ? 
      stmt.all(userAddress || '') as Record<string, unknown>[] :
      stmt.all(date, userAddress || '') as Record<string, unknown>[];
    
    return rows.map((row) => {
      // Ensure consistent field names (SQLite might also return lowercase)
      const normalizedRow = {
        id: row.id,
        nodeId: row.nodeid || row.nodeId,  // Handle case sensitivity
        label: row.label,
        type: row.type,
        userAddress: row.useraddress || row.userAddress,
        parentId: row.parentid || row.parentId,
        x: row.x,
        y: row.y,
        width: row.width,
        height: row.height,
        visibility: row.visibility,
        properties: row.properties,
        created_at: row.created_at
      };
      
      if (
        normalizedRow.type === 'group' &&
        normalizedRow.visibility === 'private' &&
        normalizedRow.userAddress &&
        String(normalizedRow.userAddress).toLowerCase() !== (userAddress || '').toLowerCase()
      ) {
        return { ...normalizedRow, label: '', properties: {} };
      }
      return {
        ...normalizedRow,
        properties: normalizedRow.properties ? JSON.parse(String(normalizedRow.properties)) : {}
      };
    });
  } catch (error) {
    console.error('[Database] Error getting entities (SQLite):', error);
    throw error;
  }
}

// Add quota tracking functions
export async function getUserQuota(userAddress: string): Promise<{ entities: number; relations: number; totalSizeKB: number }> {
  if (usePostgres) {
    return getUserQuotaPostgres(userAddress);
  } else {
    return getUserQuotaSQLite(userAddress);
  }
}

async function getUserQuotaPostgres(userAddress: string): Promise<{ entities: number; relations: number; totalSizeKB: number }> {
  try {
    const entityCount = await sql`SELECT COUNT(*) as count FROM entities WHERE userAddress = ${userAddress}`;
    const relationCount = await sql`SELECT COUNT(*) as count FROM relations WHERE userAddress = ${userAddress}`;
    
    // Calculate approximate total size
    const entitySize = await sql`
      SELECT COALESCE(SUM(
        LENGTH(COALESCE(label, '')) + 
        LENGTH(COALESCE(properties::text, '{}')) + 
        LENGTH(COALESCE(type, ''))
      ), 0) as size FROM entities WHERE userAddress = ${userAddress}
    `;
    
    const relationSize = await sql`
      SELECT COALESCE(SUM(
        LENGTH(COALESCE(relationType, '')) + 
        LENGTH(COALESCE(properties::text, '{}'))
      ), 0) as size FROM relations WHERE userAddress = ${userAddress}
    `;

    return {
      entities: Number(entityCount.rows[0].count) || 0,
      relations: Number(relationCount.rows[0].count) || 0,
      totalSizeKB: Math.ceil((Number(entitySize.rows[0].size) + Number(relationSize.rows[0].size)) / 1024)
    };
  } catch (error) {
    errorLogger.logError(
      error instanceof Error ? error : new Error(String(error)),
      'Failed to get user quota (PostgreSQL)',
      userAddress
    );
    return { entities: 0, relations: 0, totalSizeKB: 0 };
  }
}

function getUserQuotaSQLite(userAddress: string): { entities: number; relations: number; totalSizeKB: number } {
  if (!sqliteDb) throw new Error('SQLite not initialized');
  
  try {
    const entityCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM entities WHERE userAddress = ?').get(userAddress) as { count: number };
    const relationCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM relations WHERE userAddress = ?').get(userAddress) as { count: number };
    
    // Calculate approximate total size
    const entitySizeResult = sqliteDb.prepare(`
      SELECT COALESCE(SUM(
        LENGTH(COALESCE(label, '')) + 
        LENGTH(COALESCE(properties, '{}')) + 
        LENGTH(COALESCE(type, ''))
      ), 0) as size FROM entities WHERE userAddress = ?
    `).get(userAddress) as { size: number };
    
    const relationSizeResult = sqliteDb.prepare(`
      SELECT COALESCE(SUM(
        LENGTH(COALESCE(relationType, '')) + 
        LENGTH(COALESCE(properties, '{}'))
      ), 0) as size FROM relations WHERE userAddress = ?
    `).get(userAddress) as { size: number };

    return {
      entities: entityCount?.count || 0,
      relations: relationCount?.count || 0,
      totalSizeKB: Math.ceil((entitySizeResult.size + relationSizeResult.size) / 1024)
    };
  } catch (error) {
    errorLogger.logError(
      error instanceof Error ? error : new Error(String(error)),
      'Failed to get user quota (SQLite)',
      userAddress
    );
    return { entities: 0, relations: 0, totalSizeKB: 0 };
  }
}

// Add cleanup function for old edit history
export async function cleanupOldEditHistory(retentionDays: number = 30): Promise<{ deletedRecords: number }> {
  if (usePostgres) {
    return cleanupOldEditHistoryPostgres(retentionDays);
  } else {
    return cleanupOldEditHistorySQLite(retentionDays);
  }
}

async function cleanupOldEditHistoryPostgres(retentionDays: number): Promise<{ deletedRecords: number }> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const result = await sql`
      DELETE FROM edit_history 
      WHERE created_at < ${cutoffDate.toISOString()}
    `;
    
    console.log(`[Database] Cleaned up ${result.rowCount} old edit history records (PostgreSQL)`);
    return { deletedRecords: result.rowCount || 0 };
  } catch (error) {
    errorLogger.logError(
      error instanceof Error ? error : new Error(String(error)),
      'Failed to cleanup old edit history (PostgreSQL)'
    );
    throw error;
  }
}

function cleanupOldEditHistorySQLite(retentionDays: number): { deletedRecords: number } {
  if (!sqliteDb) throw new Error('SQLite not initialized');
  
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const result = sqliteDb.prepare(`
      DELETE FROM edit_history 
      WHERE datetime(created_at) < datetime(?)
    `).run(cutoffDate.toISOString());
    
    console.log(`[Database] Cleaned up ${result.changes} old edit history records (SQLite)`);
    return { deletedRecords: result.changes || 0 };
  } catch (error) {
    errorLogger.logError(
      error instanceof Error ? error : new Error(String(error)),
      'Failed to cleanup old edit history (SQLite)'
    );
    throw error;
  }
}

// Add database size monitoring
export async function getDatabaseSize(): Promise<{ sizeKB: number; tableStats: Record<string, number> }> {
  if (usePostgres) {
    return getDatabaseSizePostgres();
  } else {
    return getDatabaseSizeSQLite();
  }
}

async function getDatabaseSizePostgres(): Promise<{ sizeKB: number; tableStats: Record<string, number> }> {
  try {
    // Get database size - this requires appropriate PostgreSQL permissions
    const dbSizeResult = await sql`
      SELECT pg_database_size(current_database()) as size
    `;
    
    const tableStatsResults = await sql`
      SELECT 
        'entities' as table_name,
        COUNT(*) as count
      FROM entities
      UNION ALL
      SELECT 
        'relations' as table_name,
        COUNT(*) as count
      FROM relations
      UNION ALL
      SELECT 
        'edit_history' as table_name,
        COUNT(*) as count
      FROM edit_history
    `;

    const tableStats: Record<string, number> = {};
    const statsRows = isPostgresDriver ? tableStatsResults : tableStatsResults.rows;
    statsRows.forEach((row: any) => {
      tableStats[row.table_name] = Number(row.count);
    });

    return {
      sizeKB: Math.ceil(Number(dbSizeResult.rows[0].size) / 1024),
      tableStats
    };
  } catch (error) {
    errorLogger.logError(
      error instanceof Error ? error : new Error(String(error)),
      'Failed to get database size (PostgreSQL)'
    );
    // Return default values on error
    return { sizeKB: 0, tableStats: {} };
  }
}

function getDatabaseSizeSQLite(): { sizeKB: number; tableStats: Record<string, number> } {
  if (!sqliteDb) throw new Error('SQLite not initialized');
  
  try {
    // Get SQLite file size
    const dbPath = path.join(process.cwd(), 'data', 'graph.sqlite');
    let fileSize = 0;
    
    try {
      const stats = fs.statSync(dbPath);
      fileSize = stats.size;
    } catch {
      // File might not exist yet
      fileSize = 0;
    }

    // Get table counts
    const entityCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM entities').get() as { count: number };
    const relationCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM relations').get() as { count: number };
    const historyCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM edit_history').get() as { count: number };

    return {
      sizeKB: Math.ceil(fileSize / 1024),
      tableStats: {
        entities: entityCount.count,
        relations: relationCount.count,
        edit_history: historyCount.count
      }
    };
  } catch (error) {
    errorLogger.logError(
      error instanceof Error ? error : new Error(String(error)),
      'Failed to get database size (SQLite)'
    );
    return { sizeKB: 0, tableStats: {} };
  }
}

// Update createEntity to use protection
export async function createEntity(data: {
  nodeId: string;
  label: string;
  type: string;
  userAddress?: string;
  parentId?: string;
  visibility?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  properties?: Record<string, unknown>;
}) {
  // Validate with protection system
  const operation: DatabaseOperation = {
    type: 'create',
    table: 'entities',
    userAddress: data.userAddress,
    payload: data
  };

  const validation = await dbProtection.validateOperation(operation);
  if (!validation.allowed) {
    throw new Error(validation.reason || 'Operation not allowed');
  }

  // Sanitize input data
  const sanitizedData = {
    ...data,
    ...dbProtection.sanitizeInput(data)
  };

  if (usePostgres) {
    return createEntityPostgres(sanitizedData);
  } else {
    return createEntitySQLite(sanitizedData);
  }
}

async function createEntityPostgres(data: {
  nodeId: string;
  label: string;
  type: string;
  userAddress?: string;
  parentId?: string;
  visibility?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  properties?: Record<string, unknown>;
}) {
  try {
    console.log(`[Database] CREATE ENTITY START:`, JSON.stringify(data));
    
    // Check for duplicates
    const existing = await sql`
      SELECT id FROM entities WHERE nodeId = ${data.nodeId}
    `;
    
    const existingRows = isPostgresDriver ? existing : existing?.rows;
    console.log(`[Database] DUPLICATE CHECK: ${existingRows?.length || 0} existing rows`);
    
    if (existingRows && existingRows.length > 0) {
      console.log(`[Database] FOUND DUPLICATE, returning existing id: ${existingRows[0].id}`);
      return { id: existingRows[0].id, duplicated: true };
    }

    const result = await sql`
      INSERT INTO entities (
        nodeId, label, type, userAddress, parentId, x, y, width, height, properties, visibility
      ) VALUES (
        ${data.nodeId},
        ${data.label},
        ${data.type},
        ${data.userAddress || null},
        ${data.parentId || null},
        ${data.x || null},
        ${data.y || null},
        ${data.width || null},
        ${data.height || null},
        ${JSON.stringify(data.properties || {})},
        ${data.visibility || 'public'}
      )
      RETURNING id, created_at
    `;

    const resultRows = isPostgresDriver ? result : result?.rows;
    console.log(`[Database] INSERT RESULT: ${resultRows?.length || 0} rows inserted`);
    
    if (resultRows && resultRows.length > 0) {
      console.log(`[Database] CREATED ENTITY: id=${resultRows[0].id}, created_at=${resultRows[0].created_at}`);
    }

    // Record creation in edit history
    await sql`
      INSERT INTO edit_history (nodeId, nodeType, action, field, oldValue, newValue, editorAddress) 
      VALUES (${data.nodeId}, 'entity', 'create', null, null, ${data.label}, ${data.userAddress || null})
    `;

    if (!resultRows || resultRows.length === 0) {
      console.log('[Database] INSERT FAILED - No result from insert, returning default id');
      return { id: 1 }; // Fallback ID
    }

    console.log(`[Database] CREATE ENTITY SUCCESS: returning id ${resultRows[0].id}`);
    return { id: resultRows[0].id };
  } catch (error) {
    console.error('[Database] Error creating entity (PostgreSQL):', error);
    throw error;
  }
}

function createEntitySQLite(data: {
  nodeId: string;
  label: string;
  type: string;
  userAddress?: string;
  parentId?: string;
  visibility?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  properties?: Record<string, unknown>;
}) {
  if (!sqliteDb) throw new Error('SQLite not initialized');
  
  try {
    // Check for duplicates
    const existing = sqliteDb.prepare('SELECT id FROM entities WHERE nodeId = ?').get(data.nodeId) as { id: number } | undefined;
    
    if (existing) {
      return { id: existing.id, duplicated: true };
    }

    const result = sqliteDb.prepare(`
      INSERT INTO entities (
        nodeId, label, type, userAddress, parentId, x, y, width, height, properties, visibility, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      data.nodeId,
      data.label,
      data.type,
      data.userAddress || null,
      data.parentId || null,
      data.x || null,
      data.y || null,
      data.width || null,
      data.height || null,
      JSON.stringify(data.properties || {}),
      data.visibility || 'public'
    );

    // Record creation in edit history
    sqliteDb.prepare(`
      INSERT INTO edit_history (nodeId, nodeType, action, field, oldValue, newValue, editorAddress) 
      VALUES (?, 'entity', 'create', NULL, NULL, ?, ?)
    `).run(data.nodeId, data.label, data.userAddress || null);

    return { id: result.lastInsertRowid };
  } catch (error) {
    console.error('[Database] Error creating entity (SQLite):', error);
    throw error;
  }
}

// Helper function to update an entity
export async function updateEntity(nodeId: string, updates: Record<string, unknown>, editorAddress?: string) {
  // Validate with protection system
  const operation: DatabaseOperation = {
    type: 'update',
    table: 'entities',
    userAddress: editorAddress,
    payload: updates
  };

  const validation = await dbProtection.validateOperation(operation);
  if (!validation.allowed) {
    throw new Error(validation.reason || 'Operation not allowed');
  }

  // Sanitize input data
  const sanitizedUpdates = dbProtection.sanitizeInput(updates);

  if (usePostgres) {
    return updateEntityPostgres(nodeId, sanitizedUpdates, editorAddress);
  } else {
    return updateEntitySQLite(nodeId, sanitizedUpdates, editorAddress);
  }
}

async function updateEntityPostgres(nodeId: string, updates: Record<string, unknown>, editorAddress?: string) {
  try {
    // Get current values for history tracking
    const current = await sql`
      SELECT * FROM entities WHERE nodeId = ${nodeId}
    `;
    
    if (current.rows.length === 0) {
      throw new Error('Entity not found');
    }
    
    const currentData = current.rows[0];

    // Helper function to record edit history
    const recordEdit = async (field: string, oldValue: unknown, newValue: unknown) => {
      if (oldValue !== newValue) {
        await sql`
          INSERT INTO edit_history (nodeId, nodeType, action, field, oldValue, newValue, editorAddress) 
          VALUES (${nodeId}, 'entity', 'update', ${field}, ${String(oldValue || '')}, ${String(newValue || '')}, ${editorAddress || null})
        `;
      }
    };

    // Position updates (don't track in history for noise reduction)
    if (updates.x !== undefined && updates.y !== undefined) {
      const x = typeof updates.x === 'number' ? updates.x : Number(updates.x) || 0;
      const y = typeof updates.y === 'number' ? updates.y : Number(updates.y) || 0;
      await sql`
        UPDATE entities SET x = ${x}, y = ${y} WHERE nodeId = ${nodeId}
      `;
    }

    // Label updates (track in history)
    if (updates.label && updates.label !== currentData.label) {
      const label = String(updates.label);
      await recordEdit('label', currentData.label, label);
      await sql`
        UPDATE entities SET label = ${label} WHERE nodeId = ${nodeId}
      `;
    }

    // Properties updates (track in history)
    if (updates.properties) {
      const oldProps = JSON.stringify(currentData.properties || {});
      const newProps = JSON.stringify(updates.properties);
      if (oldProps !== newProps) {
        await recordEdit('properties', oldProps, newProps);
        await sql`
          UPDATE entities SET properties = ${newProps} WHERE nodeId = ${nodeId}
        `;
      }
    }

    // Visibility updates (track in history)
    if (updates.visibility && updates.visibility !== currentData.visibility) {
      const visibility = String(updates.visibility);
      await recordEdit('visibility', currentData.visibility, visibility);
      await sql`
        UPDATE entities SET visibility = ${visibility} WHERE nodeId = ${nodeId}
      `;
    }

    // Parent updates (track in history)
    if (updates.parentId !== undefined && updates.parentId !== currentData.parentid) {
      const parentId = updates.parentId === null ? null : String(updates.parentId);
      await recordEdit('parentId', currentData.parentid, parentId);
      await sql`
        UPDATE entities SET parentId = ${parentId} WHERE nodeId = ${nodeId}
      `;
    }

    // Size updates (don't track in history for noise reduction)
    if (updates.width !== undefined && updates.height !== undefined) {
      const width = typeof updates.width === 'number' ? updates.width : Number(updates.width) || 0;
      const height = typeof updates.height === 'number' ? updates.height : Number(updates.height) || 0;
      await sql`
        UPDATE entities SET width = ${width}, height = ${height} WHERE nodeId = ${nodeId}
      `;
    }

    return { success: true };
  } catch (error) {
    console.error('[Database] Error updating entity (PostgreSQL):', error);
    throw error;
  }
}

function updateEntitySQLite(nodeId: string, updates: Record<string, unknown>, editorAddress?: string) {
  if (!sqliteDb) throw new Error('SQLite not initialized');
  
  try {
    // Get current values for history tracking
    const current = sqliteDb.prepare('SELECT * FROM entities WHERE nodeId = ?').get(nodeId) as Record<string, unknown> | undefined;
    
    if (!current) {
      throw new Error('Entity not found');
    }

    // Helper function to record edit history
    const recordEdit = (field: string, oldValue: unknown, newValue: unknown) => {
      if (oldValue !== newValue) {
        sqliteDb!.prepare(`
          INSERT INTO edit_history (nodeId, nodeType, action, field, oldValue, newValue, editorAddress) 
          VALUES (?, 'entity', 'update', ?, ?, ?, ?)
        `).run(nodeId, field, String(oldValue || ''), String(newValue || ''), editorAddress || null);
      }
    };

    // Position updates (don't track in history for noise reduction)
    if (updates.x !== undefined && updates.y !== undefined) {
      sqliteDb.prepare('UPDATE entities SET x = ?, y = ? WHERE nodeId = ?').run(updates.x, updates.y, nodeId);
    }

    // Label updates (track in history)
    if (updates.label && updates.label !== current.label) {
      recordEdit('label', current.label, updates.label);
      sqliteDb.prepare('UPDATE entities SET label = ? WHERE nodeId = ?').run(updates.label, nodeId);
    }

    // Properties updates (track in history)
    if (updates.properties) {
      const oldProps = JSON.stringify(current.properties || {});
      const newProps = JSON.stringify(updates.properties);
      if (oldProps !== newProps) {
        recordEdit('properties', oldProps, newProps);
        sqliteDb.prepare('UPDATE entities SET properties = ? WHERE nodeId = ?').run(newProps, nodeId);
      }
    }

    // Visibility updates (track in history)
    if (updates.visibility && updates.visibility !== current.visibility) {
      recordEdit('visibility', current.visibility, updates.visibility);
      sqliteDb.prepare('UPDATE entities SET visibility = ? WHERE nodeId = ?').run(updates.visibility, nodeId);
    }

    // Parent updates (track in history)
    if (updates.parentId !== undefined && updates.parentId !== current.parentId) {
      recordEdit('parentId', current.parentId, updates.parentId);
      sqliteDb.prepare('UPDATE entities SET parentId = ? WHERE nodeId = ?').run(updates.parentId, nodeId);
    }

    // Size updates (don't track in history for noise reduction)
    if (updates.width !== undefined && updates.height !== undefined) {
      sqliteDb.prepare('UPDATE entities SET width = ?, height = ? WHERE nodeId = ?').run(updates.width, updates.height, nodeId);
    }

    return { success: true };
  } catch (error) {
    console.error('[Database] Error updating entity (SQLite):', error);
    throw error;
  }
}

// Helper function to delete an entity
export async function deleteEntity(nodeId: string) {
  if (usePostgres) {
    return deleteEntityPostgres(nodeId);
  } else {
    return deleteEntitySQLite(nodeId);
  }
}

async function deleteEntityPostgres(nodeId: string) {
  try {
    // Get entity info before deletion for history
    const entity = await sql`
      SELECT * FROM entities WHERE nodeId = ${nodeId}
    `;
    
    console.log('[Database] Delete entity query result:', { hasResult: !!entity, hasRows: !!entity?.rows, rowCount: entity?.rows?.length });
    
    if (!entity?.rows || entity.rows.length === 0) {
      throw new Error('Entity not found');
    }

    // Record deletion in edit history
    await sql`
      INSERT INTO edit_history (nodeId, nodeType, action, field, oldValue, newValue, editorAddress) 
      VALUES (${nodeId}, 'entity', 'delete', null, ${entity.rows[0].label}, null, null)
    `;

    // Delete the entity
    await sql`
      DELETE FROM entities WHERE nodeId = ${nodeId}
    `;

    return { success: true };
  } catch (error) {
    console.error('[Database] Error deleting entity (PostgreSQL):', error);
    throw error;
  }
}

function deleteEntitySQLite(nodeId: string) {
  if (!sqliteDb) throw new Error('SQLite not initialized');
  
  try {
    // Get entity info before deletion for history
    const entity = sqliteDb.prepare('SELECT * FROM entities WHERE nodeId = ?').get(nodeId) as Record<string, unknown> | undefined;
    
    if (!entity) {
      throw new Error('Entity not found');
    }

    // Record deletion in edit history
    sqliteDb.prepare(`
      INSERT INTO edit_history (nodeId, nodeType, action, field, oldValue, newValue, editorAddress) 
      VALUES (?, 'entity', 'delete', NULL, ?, NULL, NULL)
    `).run(nodeId, String(entity.label || ''));

    // Delete the entity
    sqliteDb.prepare('DELETE FROM entities WHERE nodeId = ?').run(nodeId);

    return { success: true };
  } catch (error) {
    console.error('[Database] Error deleting entity (SQLite):', error);
    throw error;
  }
}

// Export the database instance for backward compatibility
export default usePostgres ? null : sqliteDb; 