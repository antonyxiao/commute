const gtfs = require('gtfs');
const config = require('./config.json');

async function test() {
  try {
    await gtfs.openDb(config);
    console.log('DB Opened.');
    
    // Pick a stop ID from previous output: '100071'
    console.log('Fetching stoptimes for stop 100071...');
    const times = await gtfs.getStoptimes({ stop_id: '100071' });
    console.log('Times found:', times.length);
    if (times.length > 0) console.log(times[0]);
    
  } catch (err) {
    console.error('Error:', err);
  }
}

test();