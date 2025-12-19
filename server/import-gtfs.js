const config = require('./config.json');

async function runImport() {
  try {
    const gtfs = await import('gtfs');
    await gtfs.importGtfs(config);
    console.log('GTFS data imported successfully.');
  } catch (err) {
    console.error('Error importing GTFS data:', err);
  }
}

runImport();
