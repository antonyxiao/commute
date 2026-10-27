const { queryAll } = require('../db');

const MAX_STOPS_IN_BOUNDS = 1000;

function parseCoordinate(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
}

/**
 * GET /api/stops
 * Lightweight list of stops (used for debugging / small clients).
 */
async function getStops(req, res, next) {
  try {
    const stops = await queryAll(`
      SELECT stop_id, stop_code, stop_name, stop_desc, stop_lat, stop_lon, platform_code
      FROM stops
      ORDER BY stop_name
      LIMIT 5000
    `);
    res.json(stops);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/stops_in_bounds?north=&east=&south=&west=
 */
async function getStopsInBounds(req, res, next) {
  try {
    const north = parseCoordinate(req.query.north, -90, 90);
    const south = parseCoordinate(req.query.south, -90, 90);
    const east = parseCoordinate(req.query.east, -180, 180);
    const west = parseCoordinate(req.query.west, -180, 180);

    if (north === null || south === null || east === null || west === null) {
      return res.status(400).json({
        error: 'Invalid bounding box. north/south must be -90..90 and east/west -180..180.',
      });
    }

    const top = Math.max(north, south);
    const bottom = Math.min(north, south);
    const left = Math.min(east, west);
    const right = Math.max(east, west);

    const stops = await queryAll(
      `
        SELECT stop_id, stop_code, stop_name, stop_desc, stop_lat, stop_lon, platform_code
        FROM stops
        WHERE stop_lat <= ? AND stop_lat >= ? AND stop_lon <= ? AND stop_lon >= ?
        LIMIT ?
      `,
      [top, bottom, right, left, MAX_STOPS_IN_BOUNDS]
    );

    res.json(stops);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStops,
  getStopsInBounds,
};
