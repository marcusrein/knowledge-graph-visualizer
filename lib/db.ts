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
      type TEXT,
      userAddress TEXT,
      x REAL,
      y REAL,
      properties TEXT,
      created_at TEXT,
      parentId TEXT,
      visibility TEXT DEFAULT 'public'
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

  // Add x and y columns if they were missing from an existing database
  try {
    db.prepare('ALTER TABLE entities ADD COLUMN x REAL').run();
  } catch {
    /* ignore: column already exists */
  }
  try {
    db.prepare('ALTER TABLE entities ADD COLUMN y REAL').run();
  } catch {
    /* ignore: column already exists */
  }
  try {
    db.prepare('ALTER TABLE entities ADD COLUMN properties TEXT').run();
  } catch {
    /* ignore: column already exists */
  }

  // Add x and y columns to relations if they were missing
  try {
    db.prepare('ALTER TABLE relations ADD COLUMN x REAL').run();
  } catch {
    /* ignore: column already exists */
  }
  try {
    db.prepare('ALTER TABLE relations ADD COLUMN y REAL').run();
  } catch {
    /* ignore: column already exists */
  }
  try {
    db.prepare('ALTER TABLE relations ADD COLUMN properties TEXT').run();
  } catch {
    /* ignore: column already exists */
  }
  try {
    db.prepare('ALTER TABLE entities ADD COLUMN parentId TEXT').run();
  } catch {
    /* ignore: column already exists */
  }
  try {
    db.prepare("ALTER TABLE entities ADD COLUMN visibility TEXT DEFAULT 'public'").run();
  } catch {
    /* ignore: column exists */
  }
  try {
    db.prepare('ALTER TABLE entities ADD COLUMN width REAL').run();
  } catch {
    /* ignore: column already exists */
  }
  try {
    db.prepare('ALTER TABLE entities ADD COLUMN height REAL').run();
  } catch {
    /* ignore: column already exists */
  }
};

init();

export default db; 