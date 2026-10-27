const os = require('os');
const app = require('./src/app');
const { closeDb } = require('./src/db');

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';

function lanAddresses() {
  const addresses = [];
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const iface of interfaces || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

const server = app.listen(port, host, () => {
  console.log(`Server listening on http://localhost:${port}`);
  for (const address of lanAddresses()) {
    console.log(`  On your network: http://${address}:${port}`);
  }
});

function shutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down...`);
  server.close(() => {
    closeDb();
    process.exit(0);
  });

  // Do not hang forever on stuck connections.
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
