// New file: scripts/clean-db.js
// Simple helper to wipe the local SQLite DB used by the backend API.
// Run with: `yarn clean:db`
// -------------------------------------------------------------
const fs = require('fs');
const path = require('path');

// Database lives in packages/backend/data/leaderboard.db (relative to repo root)
const DB_PATH = path.join(__dirname, '..', 'packages', 'backend', 'data', 'leaderboard.db');

if (fs.existsSync(DB_PATH)) {
  try {
    fs.unlinkSync(DB_PATH);
    // eslint-disable-next-line no-console
    console.log(`🧹  Successfully removed local database: ${DB_PATH}`);
    // The backend will recreate an empty DB automatically next time it boots.
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('❌  Failed to delete database file:', err);
    process.exit(1);
  }
} else {
  // eslint-disable-next-line no-console
  console.log('ℹ️  No local database found – nothing to clean.');
} 