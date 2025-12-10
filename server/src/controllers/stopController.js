const gtfs = require('gtfs');
const { queryAll } = require('../db');

/**
 * Get all stops.
 */
async function getStops(req, res) {
  try {
    const stops = await gtfs.getStops();
    res.json(stops);
  } catch (err) {
    console.error('Error fetching stops:', err);
    res.status(500).json({ error: 'Failed to fetch stops' });
  }
}

/**
 * Get stops within a bounding box.
 */
async function getStopsInBounds(req, res) {
  const { north, east, south, west } = req.query;

  if (!north || !east || !south || !west) {
    return res.status(400).json({ error: 'Missing bounding box parameters (north, east, south, west)' });
  }

  try {
    const query = `
      SELECT stop_id, stop_name, stop_desc, stop_lat, stop_lon 
      FROM stops 
      WHERE stop_lat <= ? AND stop_lat >= ? AND stop_lon <= ? AND stop_lon >= ?
      LIMIT 1000
    `;
    const stops = await queryAll(query, [north, south, east, west]);
    res.json(stops);
  } catch (err) {
    console.error('Error fetching stops in bounds:', err);
    res.status(500).json({ error: 'Failed to fetch stops in bounds' });
  }
}

module.exports = {
  getStops,
  getStopsInBounds
};
