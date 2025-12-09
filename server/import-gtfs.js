const gtfs = require('gtfs');
const config = require('./config.json');

async function importGtfs() {
  try {
    await gtfs.import(config);
    console.log('GTFS data imported successfully.');
  } catch (err) {
    console.error('Error importing GTFS data:', err);
  }
}

importGtfs();
