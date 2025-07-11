import { sql } from '@vercel/postgres';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Environment detection
const isProduction = process.env.NODE_ENV === 'production';
const hasVercelDB = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
const usePostgres = isProduction && hasVercelDB;

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
    return initializePostgres();
  } else {
    return initializeSQLite();
  }
}

async function initializePostgres() {
  try {
    console.log('[Database] Initializing PostgreSQL...');
    // Create entities table
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

    // Create relations table
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

    // Create relation_links table
    await sql`
      CREATE TABLE IF NOT EXISTS relation_links (
        id SERIAL PRIMARY KEY,
        relationId INTEGER REFERENCES relations(id) ON DELETE CASCADE,
        entityId TEXT,
        role TEXT CHECK(role IN ('source','target')),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Create edit_history table
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
    const result = await sql`
      SELECT * FROM entities 
      WHERE DATE(created_at) = ${date}
      AND (
        type = 'group' 
        OR visibility = 'public' 
        OR userAddress IS NULL 
        OR userAddress = ${userAddress || ''}
      )
      ORDER BY created_at ASC
    `;
    
    return result.rows.map((row: Record<string, unknown>) => {
      if (
        row.type === 'group' &&
        row.visibility === 'private' &&
        row.useraddress &&
        String(row.useraddress).toLowerCase() !== (userAddress || '').toLowerCase()
      ) {
        return { ...row, label: '', properties: {} };
      }
      return {
        ...row,
        properties: typeof row.properties === 'string' ? JSON.parse(row.properties) : row.properties
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
    const stmt = sqliteDb.prepare(`
      SELECT * FROM entities 
      WHERE DATE(created_at) = ?
      AND (
        type = 'group' 
        OR visibility = 'public' 
        OR userAddress IS NULL 
        OR userAddress = ?
      )
      ORDER BY created_at ASC
    `);
    
    const rows = stmt.all(date, userAddress || '') as Record<string, unknown>[];
    
    return rows.map((row) => {
      if (
        row.type === 'group' &&
        row.visibility === 'private' &&
        row.userAddress &&
        String(row.userAddress).toLowerCase() !== (userAddress || '').toLowerCase()
      ) {
        return { ...row, label: '', properties: {} };
      }
      return {
        ...row,
        properties: row.properties ? JSON.parse(String(row.properties)) : {}
      };
    });
  } catch (error) {
    console.error('[Database] Error getting entities (SQLite):', error);
    throw error;
  }
}

// Helper function to create an entity
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
  if (usePostgres) {
    return createEntityPostgres(data);
  } else {
    return createEntitySQLite(data);
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
    // Check for duplicates
    const existing = await sql`
      SELECT id FROM entities WHERE nodeId = ${data.nodeId}
    `;
    
    if (existing.rows.length > 0) {
      return { id: existing.rows[0].id, duplicated: true };
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
      RETURNING id
    `;

    // Record creation in edit history
    await sql`
      INSERT INTO edit_history (nodeId, nodeType, action, field, oldValue, newValue, editorAddress) 
      VALUES (${data.nodeId}, 'entity', 'create', null, null, ${data.label}, ${data.userAddress || null})
    `;

    return { id: result.rows[0].id };
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
  if (usePostgres) {
    return updateEntityPostgres(nodeId, updates, editorAddress);
  } else {
    return updateEntitySQLite(nodeId, updates, editorAddress);
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
      await sql`
        UPDATE entities SET x = ${updates.x}, y = ${updates.y} WHERE nodeId = ${nodeId}
      `;
    }

    // Label updates (track in history)
    if (updates.label && updates.label !== currentData.label) {
      await recordEdit('label', currentData.label, updates.label);
      await sql`
        UPDATE entities SET label = ${updates.label} WHERE nodeId = ${nodeId}
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
      await recordEdit('visibility', currentData.visibility, updates.visibility);
      await sql`
        UPDATE entities SET visibility = ${updates.visibility} WHERE nodeId = ${nodeId}
      `;
    }

    // Parent updates (track in history)
    if (updates.parentId !== undefined && updates.parentId !== currentData.parentid) {
      await recordEdit('parentId', currentData.parentid, updates.parentId);
      await sql`
        UPDATE entities SET parentId = ${updates.parentId} WHERE nodeId = ${nodeId}
      `;
    }

    // Size updates (don't track in history for noise reduction)
    if (updates.width !== undefined && updates.height !== undefined) {
      await sql`
        UPDATE entities SET width = ${updates.width}, height = ${updates.height} WHERE nodeId = ${nodeId}
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
    
    if (entity.rows.length === 0) {
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