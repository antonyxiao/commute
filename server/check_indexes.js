const sqlite3 = require('sqlite3').verbose();
const config = require('./config.json');
const path = require('path');

const dbPath = path.resolve(__dirname, config.sqlitePath);
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

db.serialize(() => {
    console.log("--- Indexes on 'stops' ---");
    db.all("PRAGMA index_list(stops)", (err, rows) => {
        if (err) console.error(err);
        else {
            console.log(rows);
            // Iterate to get column details
             if(rows.length > 0) {
                 rows.forEach(idx => {
                     db.all(`PRAGMA index_info(${idx.name})`, (e, cols) => {
                         console.log(`Index ${idx.name} cols:`, cols);
                     });
                 });
             }
        }
    });
});
