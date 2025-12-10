const { queryAll } = require('../db');
const { fetchWithCache, decodeFeed } = require('../services/realtimeService');
const { toGTFSDate, parseGTFSDate, getDayName } = require('../utils/dateUtils');

/**
 * Get vehicles for a specific stop.
 */
async function getVehiclesForStop(req, res) {
  const { stop_id } = req.params;

  // 1. Determine Date and Day
  let dateString = req.query.date;
  if (!dateString) {
    dateString = toGTFSDate(new Date());
  }

  const dateObj = parseGTFSDate(dateString);
  const dayName = getDayName(dateObj);

  try {
    // Get all trips serving this stop for the current date
    const query = `
            SELECT 
                t.trip_id,
                r.route_short_name,
                r.route_color,
                r.route_text_color
            FROM stop_times st
            JOIN trips t ON st.trip_id = t.trip_id
            JOIN routes r ON t.route_id = r.route_id
            LEFT JOIN calendar c ON t.service_id = c.service_id
            LEFT JOIN calendar_dates cd ON t.service_id = cd.service_id AND cd.date = ?
            WHERE st.stop_id = ?
            AND (
                (cd.service_id IS NOT NULL AND cd.exception_type = 1)
                OR
                (
                    c.service_id IS NOT NULL 
                    AND c.start_date <= ? AND c.end_date >= ?
                    AND c.${dayName} = 1
                    AND (cd.service_id IS NULL OR cd.exception_type != 2)
                )
            )
        `;
    const validTrips = await queryAll(query, [dateString, stop_id, dateString, dateString]);

    const tripMap = new Map();
    validTrips.forEach(t => tripMap.set(t.trip_id, t));

    let vehicles = [];
    try {
        const buffer = await fetchWithCache('https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=48', 'vehiclePositions');
        const feed = decodeFeed(buffer);

        feed.entity.forEach(entity => {
            if (entity.vehicle && entity.vehicle.trip && entity.vehicle.position) {
                const tripId = entity.vehicle.trip.tripId;
                if (tripMap.has(tripId)) {
                    const routeInfo = tripMap.get(tripId);
                    vehicles.push({
                        id: entity.id,
                        trip_id: tripId,
                        lat: entity.vehicle.position.latitude,
                        lon: entity.vehicle.position.longitude,
                        bearing: entity.vehicle.position.bearing,
                        route_short_name: routeInfo.route_short_name,
                        route_color: routeInfo.route_color || '000000',
                        route_text_color: routeInfo.route_text_color || 'FFFFFF'
                    });
                }
            }
        });
    } catch (rtErr) {
        console.error('Error fetching real-time vehicles:', rtErr.message);
    }

    res.json(vehicles);

  } catch (err) {
    console.error('Error fetching vehicles endpoint:', err);
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
}

module.exports = {
  getVehiclesForStop
};
