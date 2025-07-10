import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'graph.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

// Initialise tables once
const init = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nodeId TEXT,
      label TEXT,
      type TEXT CHECK(type IN ('category', 'knowledge')),
      userAddress TEXT,
      x REAL,
      y REAL,
      properties TEXT,
      created_at TEXT
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
      FOREIGN KEY(relationId) REFERENCES relations(id)
    );
  `);

  // Add x and y columns if they were missing from an existing database
  try {
    db.prepare('ALTER TABLE entities ADD COLUMN x REAL').run();
  } catch (e) {
    /* ignore: column already exists */
  }
  try {
    db.prepare('ALTER TABLE entities ADD COLUMN y REAL').run();
  } catch (e) {
    /* ignore: column already exists */
  }
  try {
    db.prepare('ALTER TABLE entities ADD COLUMN properties TEXT').run();
  } catch (e) {
    /* ignore: column already exists */
  }

  // Add x and y columns to relations if they were missing
  try {
    db.prepare('ALTER TABLE relations ADD COLUMN x REAL').run();
  } catch (e) {
    /* ignore: column already exists */
  }
  try {
    db.prepare('ALTER TABLE relations ADD COLUMN y REAL').run();
  } catch (e) {
    /* ignore: column already exists */
  }
  try {
    db.prepare('ALTER TABLE relations ADD COLUMN properties TEXT').run();
  } catch (e) {
    /* ignore: column already exists */
  }
};

init();

export default db; 