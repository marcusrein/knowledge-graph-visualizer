// Migration script to move data from SQLite to Postgres
// Run this locally if you have existing data to migrate
/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports */

const Database = require('better-sqlite3');
const { sql } = require('@vercel/postgres');
const path = require('path');

async function migrateData() {
  try {
    // Connect to local SQLite database
    const dbPath = path.join(process.cwd(), 'data', 'graph.sqlite');
    const db = new Database(dbPath);

    console.log('Reading data from SQLite...');

    // Get all entities
    const entities = db.prepare('SELECT * FROM entities').all();
    console.log(`Found ${entities.length} entities`);

    // Get all relations
    const relations = db.prepare('SELECT * FROM relations').all();
    console.log(`Found ${relations.length} relations`);

    // Get all relation_links
    const relationLinks = db.prepare('SELECT * FROM relation_links').all();
    console.log(`Found ${relationLinks.length} relation links`);

    // Migrate entities
    for (const entity of entities) {
      await sql`
        INSERT INTO entities (
          nodeId, label, type, userAddress, x, y, properties, created_at, 
          parentId, visibility, width, height
        ) VALUES (
          ${entity.nodeId},
          ${entity.label},
          ${entity.type},
          ${entity.userAddress},
          ${entity.x},
          ${entity.y},
          ${entity.properties || '{}'},
          ${entity.created_at},
          ${entity.parentId},
          ${entity.visibility || 'public'},
          ${entity.width},
          ${entity.height}
        )
        ON CONFLICT (nodeId) DO NOTHING
      `;
    }
    console.log('✅ Entities migrated');

    // Migrate relations
    for (const relation of relations) {
      await sql`
        INSERT INTO relations (
          id, sourceId, targetId, relationType, userAddress, x, y, properties, created_at
        ) VALUES (
          ${relation.id},
          ${relation.sourceId},
          ${relation.targetId},
          ${relation.relationType},
          ${relation.userAddress},
          ${relation.x},
          ${relation.y},
          ${relation.properties || '{}'},
          ${relation.created_at}
        )
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log('✅ Relations migrated');

    // Migrate relation_links
    for (const link of relationLinks) {
      await sql`
        INSERT INTO relation_links (
          relationId, entityId, role, created_at
        ) VALUES (
          ${link.relationId},
          ${link.entityId},
          ${link.role},
          ${link.created_at}
        )
      `;
    }
    console.log('✅ Relation links migrated');

    console.log('🎉 Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

migrateData(); 