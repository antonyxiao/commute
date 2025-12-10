const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('../../config.json');

let db = null;

/**
 * Opens the database connection.
 * @returns {sqlite3.Database} The database instance.
 */
function getDb() {
  if (db) return db;
  
  const dbPath = path.resolve(__dirname, '../../', config.sqlitePath);
  db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
    } else {
      console.log('Connected to SQLite database.');
    }
  });
  return db;
}

/**
 * Closes the database connection.
 */
function closeDb() {
    if (db) {
        db.close((err) => {
            if (err) console.error('Error closing database:', err.message);
            else console.log('Closed SQLite database connection.');
        });
        db = null;
    }
}

/**
 * Promisified db.all
 * @param {string} query 
 * @param {Array} params 
 * @returns {Promise<Array>}
 */
function queryAll(query, params = []) {
    const database = getDb();
    return new Promise((resolve, reject) => {
        database.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

module.exports = {
    getDb,
    closeDb,
    queryAll
};
