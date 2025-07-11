import { sql } from '@vercel/postgres';
/* eslint-disable @typescript-eslint/no-explicit-any */

// Initialize database tables
export async function initializeDatabase() {
  try {
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

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

// Helper function to get entities for a date
export async function getEntitiesForDate(date: string, userAddress?: string) {
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
    
    // Redact private Space labels for non-owners
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
    console.error('Error getting entities:', error);
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
        ${data.parentId as any || null},
        ${data.x as any || null},
        ${data.y as any || null},
        ${data.width as any || null},
        ${data.height as any || null},
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
    console.error('Error creating entity:', error);
    throw error;
  }
}

// Helper function to update an entity
export async function updateEntity(nodeId: string, updates: Record<string, unknown>, editorAddress?: string) {
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
        UPDATE entities SET x = ${updates.x as any}, y = ${updates.y as any} WHERE nodeId = ${nodeId}
      `;
    }

    // Label updates (track in history)
    if (updates.label && updates.label !== currentData.label) {
      await recordEdit('label', currentData.label, updates.label);
      await sql`
        UPDATE entities SET label = ${updates.label as any} WHERE nodeId = ${nodeId}
      `;
    }

    // Properties updates (track in history)
    if (updates.properties) {
      const oldProps = JSON.stringify(currentData.properties || {});
      const newProps = JSON.stringify(updates.properties);
      if (oldProps !== newProps) {
        await recordEdit('properties', oldProps, newProps);
        await sql`
          UPDATE entities SET properties = ${newProps as any} WHERE nodeId = ${nodeId}
        `;
      }
    }

    // Visibility updates (track in history)
    if (updates.visibility && updates.visibility !== currentData.visibility) {
      await recordEdit('visibility', currentData.visibility, updates.visibility);
      await sql`
        UPDATE entities SET visibility = ${updates.visibility as any} WHERE nodeId = ${nodeId}
      `;
    }

    // Parent updates (track in history)
    if (updates.parentId !== undefined && updates.parentId !== currentData.parentid) {
      await recordEdit('parentId', currentData.parentid, updates.parentId);
      await sql`
        UPDATE entities SET parentId = ${updates.parentId as any} WHERE nodeId = ${nodeId}
      `;
    }

    // Size updates (don't track in history for noise reduction)
    if (updates.width !== undefined && updates.height !== undefined) {
      await sql`
        UPDATE entities SET width = ${updates.width as any}, height = ${updates.height as any} WHERE nodeId = ${nodeId}
      `;
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating entity:', error);
    throw error;
  }
}

// Helper function to delete an entity
export async function deleteEntity(nodeId: string) {
  try {
    // Start a transaction-like operation
    // Remove relation_links rows that reference this entity
    await sql`DELETE FROM relation_links WHERE entityId = ${nodeId}`;

    // Nullify sourceId/targetId in relations that referenced this entity
    await sql`UPDATE relations SET sourceId = NULL WHERE sourceId = ${nodeId}`;
    await sql`UPDATE relations SET targetId = NULL WHERE targetId = ${nodeId}`;

    // Delete the entity
    const result = await sql`DELETE FROM entities WHERE nodeId = ${nodeId}`;

    if (result.rowCount === 0) {
      throw new Error('Entity not found');
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting entity:', error);
    throw error;
  }
}

export { sql }; 