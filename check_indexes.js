const sqlite3 = require('sqlite3').verbose();
const config = require('./server/config.json');
const path = require('path');

const dbPath = path.resolve('./server', config.sqlitePath);
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

db.serialize(() => {
    console.log("--- Indexes on 'stops' ---");
    db.all("PRAGMA index_list(stops)", (err, rows) => {
        if (err) console.error(err);
        else {
            console.log(rows);
            rows.forEach(row => {
                db.all(`PRAGMA index_info(${row.name})`, (e, r) => {
                    console.log(`Index ${row.name}:`, r);
                });
            });
        }
    });

    console.log("--- Indexes on 'stop_times' ---");
    db.all("PRAGMA index_list(stop_times)", (err, rows) => {
        if (err) console.error(err);
        else {
             console.log(rows);
             // detailed info usually follows async, might be messy in output but readable
        }
    });
});
