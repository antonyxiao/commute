const sqlite3 = require('sqlite3').verbose();
const config = require('./config.json');
const path = require('path');

const dbPath = path.resolve(__dirname, config.sqlitePath);
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log("Adding index on stop_lat and stop_lon...");
    db.run("CREATE INDEX IF NOT EXISTS idx_stops_lat_lon ON stops(stop_lat, stop_lon)", (err) => {
        if (err) {
            console.error("Error creating index:", err.message);
        } else {
            console.log("Index 'idx_stops_lat_lon' created successfully.");
        }
    });
});
