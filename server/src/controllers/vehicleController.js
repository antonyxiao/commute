const { queryAll } = require('../db');
const { fetchWithCache, decodeFeed } = require('../services/realtimeService');
const { toGTFSDate, parseGTFSDate, getDayName } = require('../utils/dateUtils');
const config = require('../../loadConfig');

// Server-side result cache for vehicles
const vehiclesCache = {};
const RESULT_CACHE_TTL = 5000; // 5 seconds (matches RT cache)

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

  const todayString = toGTFSDate(new Date());
  const isToday = dateString === todayString;

  // Check result cache
  const cacheKey = `vehicles_${stop_id}_${dateString}`;
  const now = Date.now();
  if (isToday && vehiclesCache[cacheKey] && (now - vehiclesCache[cacheKey].timestamp < RESULT_CACHE_TTL)) {
    return res.json(vehiclesCache[cacheKey].data);
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
            r.route_text_color,
            r.agency_id
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

    // Build lookup map and collect agency IDs in single pass
    const tripMap = new Map();
    const foundAgencyIds = new Set();

    for (const t of validTrips) {
      tripMap.set(t.trip_id, t);
      foundAgencyIds.add(t.agency_id || "");
    }

    // Identify matching agencies
    const matchedAgencies = config.agencies.filter(agency =>
      agency.gtfs_agency_ids?.some(id => foundAgencyIds.has(id))
    );

    // Parallel fetch RT data for all agencies
    const rtResults = await Promise.all(
      matchedAgencies.map(async (agencyConfig) => {
        const vehiclePositionsUrl = agencyConfig.realtimeUrls?.vehiclePositions;
        if (!vehiclePositionsUrl) return null;

        try {
          const buffer = await fetchWithCache(vehiclePositionsUrl, `vehiclePositions_${agencyConfig.agency_key}`);
          return { agency: agencyConfig, feed: decodeFeed(buffer) };
        } catch (err) {
          console.error(`Error fetching RT vehicles for ${agencyConfig.agency_key}:`, err.message);
          return null;
        }
      })
    );

    // Process all feeds and build vehicles array
    const vehicles = [];

    for (const result of rtResults) {
      if (!result) continue;
      const { feed } = result;

      for (const entity of feed.entity) {
        if (!entity.vehicle?.trip?.tripId || !entity.vehicle?.position) continue;

        const tripId = entity.vehicle.trip.tripId;
        const routeInfo = tripMap.get(tripId);

        if (routeInfo) {
          vehicles.push({
            id: entity.id,
            trip_id: tripId,
            lat: entity.vehicle.position.latitude,
            lon: entity.vehicle.position.longitude,
            bearing: entity.vehicle.position.bearing,
            speed: entity.vehicle.position.speed,
            occupancy_status: entity.vehicle.occupancyStatus,
            congestion_level: entity.vehicle.congestionLevel,
            current_status: entity.vehicle.currentStatus,
            stop_id: entity.vehicle.stopId,
            route_short_name: routeInfo.route_short_name,
            route_color: routeInfo.route_color || '000000',
            route_text_color: routeInfo.route_text_color || 'FFFFFF'
          });
        }
      }
    }

    // Cache result
    if (isToday) {
      vehiclesCache[cacheKey] = { data: vehicles, timestamp: Date.now() };
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
