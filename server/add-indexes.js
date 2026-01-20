/**
 * Script to add performance indexes to the GTFS database.
 * Run once: node add-indexes.js
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('./config.json');

const dbPath = path.resolve(__dirname, config.sqlitePath);

console.log('Opening database:', dbPath);
const db = new sqlite3.Database(dbPath);

const indexes = [
  // Geographic index for bounding box queries (critical for map performance)
  {
    name: 'idx_stops_lat_lon',
    sql: 'CREATE INDEX IF NOT EXISTS idx_stops_lat_lon ON stops(stop_lat, stop_lon)'
  },
  // Composite index for stop_times queries
  {
    name: 'idx_stop_times_stop_trip',
    sql: 'CREATE INDEX IF NOT EXISTS idx_stop_times_stop_trip ON stop_times(stop_id, trip_id)'
  },
  // Index for calendar date range queries
  {
    name: 'idx_calendar_dates',
    sql: 'CREATE INDEX IF NOT EXISTS idx_calendar_dates ON calendar(start_date, end_date)'
  },
  // Index for calendar_dates lookups
  {
    name: 'idx_calendar_dates_lookup',
    sql: 'CREATE INDEX IF NOT EXISTS idx_calendar_dates_lookup ON calendar_dates(date, service_id)'
  }
];

db.serialize(() => {
  indexes.forEach(index => {
    console.log(`Creating index: ${index.name}...`);
    db.run(index.sql, (err) => {
      if (err) {
        console.error(`Error creating ${index.name}:`, err.message);
      } else {
        console.log(`Index ${index.name} created successfully.`);
      }
    });
  });

  // Analyze tables to update query planner statistics
  console.log('Running ANALYZE...');
  db.run('ANALYZE', (err) => {
    if (err) console.error('ANALYZE error:', err.message);
    else console.log('ANALYZE complete.');

    db.close((err) => {
      if (err) console.error('Error closing database:', err.message);
      else console.log('Database closed. Indexes added successfully!');
    });
  });
});
