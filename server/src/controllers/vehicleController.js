const { getTripsAtStop } = require('../services/gtfsQueries');
const { fetchWithCache, decodeFeed } = require('../services/realtimeService');
const { toGTFSDate, isValidGTFSDate } = require('../utils/dateUtils');
const { TtlCache } = require('../utils/ttlCache');
const config = require('../../loadConfig');

const resultCache = new TtlCache({ ttl: 5000, max: 100 });
const agenciesById = new Map();

for (const agency of config.agencies || []) {
  for (const id of agency.gtfs_agency_ids || []) {
    agenciesById.set(String(id), agency);
  }
}

function hasUsableUrl(url) {
  return typeof url === 'string' && url.length > 0 && !url.endsWith('apikey=');
}

/**
 * GET /api/vehicles_for_stop/:stop_id?date=YYYYMMDD
 * Returns live vehicle positions for trips that serve the stop today.
 */
async function getVehiclesForStop(req, res, next) {
  try {
    const { stop_id: stopId } = req.params;
    if (typeof stopId !== 'string' || stopId.length === 0 || stopId.length > 64) {
      return res.status(400).json({ error: 'Invalid stop_id' });
    }

    let dateString = req.query.date;
    if (dateString && !isValidGTFSDate(dateString)) {
      return res.status(400).json({ error: 'Invalid date, expected YYYYMMDD' });
    }

    const todayString = toGTFSDate(new Date());
    if (!dateString) dateString = todayString;

    const isToday = dateString === todayString;
    const cacheKey = `${stopId}_${dateString}`;

    if (isToday) {
      const cached = resultCache.get(cacheKey);
      if (cached) return res.json(cached);
    }

    // Vehicles are live data; a future/past schedule has no live positions.
    if (!isToday) return res.json([]);

    const trips = await getTripsAtStop(stopId, dateString);
    if (trips.length === 0) return res.json([]);

    const tripMap = new Map();
    const agencies = new Set();

    for (const trip of trips) {
      tripMap.set(trip.trip_id, trip);
      const agency = agenciesById.get(String(trip.agency_id ?? ''));
      if (agency) agencies.add(agency);
    }

    const feeds = await Promise.all(
      [...agencies].map(async (agency) => {
        const url = agency.realtimeUrls?.vehiclePositions;
        if (!hasUsableUrl(url)) return null;

        try {
          const buffer = await fetchWithCache(url, `vehiclePositions_${agency.agency_key}`);
          return decodeFeed(buffer);
        } catch (err) {
          console.error(`Realtime vehiclePositions failed for ${agency.agency_key}: ${err.message}`);
          return null;
        }
      })
    );

    const vehicles = [];

    for (const feed of feeds) {
      if (!feed) continue;

      for (const entity of feed.entity || []) {
        const vehicle = entity.vehicle;
        const tripId = vehicle?.trip?.tripId;
        const position = vehicle?.position;
        if (!tripId || !position) continue;

        const trip = tripMap.get(tripId);
        if (!trip) continue;

        vehicles.push({
          id: entity.id,
          vehicle_id: vehicle.vehicle?.id || entity.id,
          label: vehicle.vehicle?.label || null,
          trip_id: tripId,
          lat: position.latitude,
          lon: position.longitude,
          bearing: position.bearing ?? null,
          speed: position.speed ?? null,
          odometer: position.odometer ?? null,
          occupancy_status: vehicle.occupancyStatus ?? null,
          congestion_level: vehicle.congestionLevel ?? null,
          current_status: vehicle.currentStatus ?? null,
          stop_id: vehicle.stopId || null,
          current_stop_sequence: vehicle.currentStopSequence ?? null,
          timestamp: vehicle.timestamp ?? null,
          route_short_name: trip.route_short_name,
          route_long_name: trip.route_long_name || null,
          route_color: trip.route_color || '2563EB',
          route_text_color: trip.route_text_color || 'FFFFFF',
          route_type: trip.route_type ?? null,
          trip_headsign: trip.trip_headsign || null,
          direction_id: trip.direction_id ?? null,
          agency_id: trip.agency_id ?? null,
        });
      }
    }

    if (isToday) {
      resultCache.set(cacheKey, vehicles);
    }

    res.json(vehicles);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getVehiclesForStop,
};
