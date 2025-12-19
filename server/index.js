const app = require('./src/app');
const config = require('./config.json');

const port = process.env.PORT || 3000;

async function startServer() {
  try {
    // Note: Our custom DB module handles queries via src/db/index.js
    
    app.listen(port, () => {
      console.log(`Server listening at http://localhost:${port}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();