const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, './gtfs.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the gtfs database.');
  }
});

db.get("PRAGMA table_info(stops);", (err, row) => {
  if (err) {
    console.error('Error getting table info:', err.message);
  } else {
    db.all("PRAGMA table_info(stops);", (err, rows) => {
      if (err) {
        console.error('Error getting table info:', err.message);
      } else {
        console.log('Stops table schema:');
        rows.forEach(row => {
          console.log(`  ${row.name} (type: ${row.type})`);
        });
      }
      db.close();
    });
  }
});
