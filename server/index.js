const app = require('./src/app');
const gtfs = require('gtfs');
const config = require('./config.json');

const port = process.env.PORT || 3000;

async function startServer() {
  try {
    // Open GTFS database using the library (it might need it for its internal functions)
    // Note: Our custom DB module handles other queries.
    // Ideally we should align them, but for now we keep existing behavior.
    await gtfs.openDb(config);
    console.log('GTFS Database opened successfully via gtfs library.');
    
    app.listen(port, () => {
      console.log(`Server listening at http://localhost:${port}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();