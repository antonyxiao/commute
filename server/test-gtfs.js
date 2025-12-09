const gtfs = require('gtfs');
const config = require('./config.json');

async function test() {
  try {
    await gtfs.openDb(config);
    console.log('DB Opened.');
    
    // Pick a stop ID from previous output: '78'
    console.log('Fetching stoptimes for stop 78...');
    const times = await gtfs.getStoptimes({ stop_id: '78' });
    console.log('Times found:', times.length);
    if (times.length > 0) console.log(times[0]);
    
  } catch (err) {
    console.error('Error:', err);
  }
}

test();