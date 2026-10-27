const { getTripsAtStop } = require('../services/gtfsQueries');
const { fetchWithCache, decodeFeed } = require('../services/realtimeService');
const {
  toGTFSDate,
  isValidGTFSDate,
  timeToMinutes,
  minutesToClock,
  formatGTFSTime,
  getNowMinutesInTimeZone,
  formatTimestamp,
} = require('../utils/dateUtils');
const { TtlCache } = require('../utils/ttlCache');
const config = require('../../loadConfig');

const MAX_ARRIVALS = 150;
const PAST_GRACE_MINUTES = 15;

// GTFS-RT schedule_relationship values
const TRIP_SCHEDULED = 0;
const TRIP_ADDED = 1;
const TRIP_UNSCHEDULED = 2;
const TRIP_CANCELED = 3;

// GTFS-RT stop_time_update schedule_relationship values
const STOP_SCHEDULED = 0;
const STOP_SKIPPED = 1;

const resultCache = new TtlCache({ ttl: 5000, max: 100 });
const agenciesById = new Map();

for (const agency of config.agencies || []) {
  for (const id of agency.gtfs_agency_ids || []) {
    agenciesById.set(String(id), agency);
  }
}

function isValidStopId(stopId) {
  return typeof stopId === 'string' && stopId.length > 0 && stopId.length <= 64;
}

function hasUsableUrl(url) {
  return typeof url === 'string' && url.length > 0 && !url.endsWith('apikey=');
}

/**
 * Parses an `after=HH:MM` filter.
 * @returns {number|null|undefined} minutes, null when absent, undefined when invalid.
 */
function parseAfter(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{1,2}:\d{2}$/.test(value)) return undefined;
  const [hours, minutes] = value.split(':').map(Number);
  if (hours > 23 || minutes > 59) return undefined;
  return hours * 60 + minutes;
}

function agenciesForRows(rows) {
  const found = new Set();
  for (const row of rows) {
    const agency = agenciesById.get(String(row.agency_id ?? ''));
    if (agency) found.add(agency);
  }
  return [...found];
}

function readStopTime(update) {
  return update?.arrival || update?.departure || null;
}

/**
 * Converts a GTFS-RT stop time (absolute timestamp or delay) into minutes.
 * @returns {{ minutes: number|null, delaySeconds: number|null }}
 */
function resolveRealtimeMinutes(stopTime, scheduledMinutes) {
  if (!stopTime) return { minutes: null, delaySeconds: null };

  if (stopTime.time) {
    const timestamp = typeof stopTime.time === 'number'
      ? stopTime.time
      : stopTime.time.low || Number(stopTime.time);
    if (!timestamp) return { minutes: null, delaySeconds: null };

    let minutes = timeToMinutes(formatTimestamp(timestamp));
    if (minutes < 0) return { minutes: null, delaySeconds: null };

    // Midnight crossover: snap the realtime clock to the scheduled service day.
    if (Math.abs(minutes - scheduledMinutes) > 720) {
      minutes += minutes < scheduledMinutes ? 1440 : -1440;
    }
    return { minutes, delaySeconds: null };
  }

  if (typeof stopTime.delay === 'number') {
    return {
      minutes: scheduledMinutes + stopTime.delay / 60,
      delaySeconds: stopTime.delay,
    };
  }

  return { minutes: null, delaySeconds: null };
}

/**
 * GET /api/stop_times/:stop_id?date=YYYYMMDD
 * Returns scheduled arrivals for a stop, enriched with realtime updates.
 */
async function getStopTimes(req, res, next) {
  try {
    const { stop_id: stopId } = req.params;
    if (!isValidStopId(stopId)) {
      return res.status(400).json({ error: 'Invalid stop_id' });
    }

    let dateString = req.query.date;
    if (dateString && !isValidGTFSDate(dateString)) {
      return res.status(400).json({ error: 'Invalid date, expected YYYYMMDD' });
    }

    const afterMinutes = parseAfter(req.query.after);
    if (afterMinutes === undefined) {
      return res.status(400).json({ error: 'Invalid after, expected HH:MM' });
    }

    const todayString = toGTFSDate(new Date());
    if (!dateString) dateString = todayString;

    const isToday = dateString === todayString;
    const cacheKey = `${stopId}_${dateString}_${afterMinutes ?? 'auto'}`;

    if (isToday) {
      const cached = resultCache.get(cacheKey);
      if (cached) return res.json(cached);
    }

    const rows = await getTripsAtStop(stopId, dateString);
    let arrivals = rows.map((row) => ({
      ...row,
      arrival_time: formatGTFSTime(row.arrival_time),
      departure_time: formatGTFSTime(row.departure_time),
      real_time_arrival: null,
      delay_minutes: null,
      is_realtime: false,
      sortTime: timeToMinutes(row.arrival_time || row.departure_time),
      status: 'SCHEDULED',
    }));

    if (isToday) {
      arrivals = await mergeRealtime(stopId, arrivals);
    }

    arrivals.sort((a, b) => a.sortTime - b.sortTime);

    // Only ship a useful window instead of every departure of the day.
    const threshold =
      afterMinutes ??
      (isToday ? getNowMinutesInTimeZone() - PAST_GRACE_MINUTES : 0);

    arrivals = arrivals
      .filter((arrival) => arrival.sortTime >= threshold)
      .slice(0, MAX_ARRIVALS);

    if (isToday) {
      resultCache.set(cacheKey, arrivals);
    }

    res.json(arrivals);
  } catch (err) {
    next(err);
  }
}

async function mergeRealtime(stopId, arrivals) {
  const agencies = agenciesForRows(arrivals);
  if (agencies.length === 0) return arrivals;

  const feeds = await Promise.all(
    agencies.map(async (agency) => {
      const url = agency.realtimeUrls?.tripUpdates;
      if (!hasUsableUrl(url)) return null;

      try {
        const buffer = await fetchWithCache(url, `tripUpdates_${agency.agency_key}`);
        return decodeFeed(buffer);
      } catch (err) {
        console.error(`Realtime tripUpdates failed for ${agency.agency_key}: ${err.message}`);
        return null;
      }
    })
  );

  const rtByTrip = new Map();
  const addedTrips = [];

  for (const feed of feeds) {
    if (!feed) continue;

    for (const entity of feed.entity || []) {
      const tripUpdate = entity.tripUpdate;
      if (!tripUpdate?.trip?.tripId) continue;

      const tripId = tripUpdate.trip.tripId;
      const scheduleRelationship = tripUpdate.trip.scheduleRelationship ?? TRIP_SCHEDULED;

      if (scheduleRelationship === TRIP_CANCELED) {
        rtByTrip.set(tripId, { status: 'CANCELED' });
        continue;
      }

      const stopUpdate = (tripUpdate.stopTimeUpdate || []).find(
        (update) => String(update.stopId) === String(stopId)
      );
      if (!stopUpdate) continue;

      if (stopUpdate.scheduleRelationship === STOP_SKIPPED) {
        rtByTrip.set(tripId, { status: 'SKIPPED' });
        continue;
      }

      if (
        scheduleRelationship === TRIP_ADDED ||
        scheduleRelationship === TRIP_UNSCHEDULED
      ) {
        addedTrips.push({
          tripId,
          stopUpdate,
          status: scheduleRelationship === TRIP_ADDED ? 'ADDED' : 'UNSCHEDULED',
        });
        continue;
      }

      if (stopUpdate.scheduleRelationship === STOP_SCHEDULED || stopUpdate.scheduleRelationship == null) {
        rtByTrip.set(tripId, { status: 'SCHEDULED', stopUpdate });
      }
    }
  }

  const enriched = arrivals.map((arrival) => {
    const update = rtByTrip.get(arrival.trip_id);
    if (!update) return arrival;

    if (update.status !== 'SCHEDULED') {
      return { ...arrival, status: update.status };
    }

    const { minutes, delaySeconds } = resolveRealtimeMinutes(
      readStopTime(update.stopUpdate),
      arrival.sortTime
    );
    if (minutes == null) {
      return { ...arrival, is_realtime: true };
    }

    return {
      ...arrival,
      real_time_arrival: minutesToClock(minutes),
      delay_minutes: delaySeconds == null ? Math.round(minutes - arrival.sortTime) : Math.round(delaySeconds / 60),
      is_realtime: true,
      sortTime: minutes,
    };
  });

  for (const added of addedTrips) {
    const stopTime = readStopTime(added.stopUpdate);
    if (!stopTime) continue;

    let minutes = null;
    if (stopTime.time) {
      const timestamp = typeof stopTime.time === 'number'
        ? stopTime.time
        : stopTime.time.low || Number(stopTime.time);
      if (timestamp) minutes = timeToMinutes(formatTimestamp(timestamp));
    }

    if (minutes == null) continue;

    enriched.push({
      trip_id: added.tripId,
      service_id: null,
      direction_id: null,
      trip_headsign: 'Added service',
      route_short_name: 'ADD',
      route_long_name: 'Added service',
      route_color: '059669',
      route_text_color: 'FFFFFF',
      route_type: 3,
      agency_id: null,
      arrival_time: null,
      departure_time: null,
      stop_headsign: null,
      stop_sequence: null,
      real_time_arrival: minutesToClock(minutes),
      delay_minutes: null,
      is_realtime: true,
      sortTime: minutes,
      status: added.status,
    });
  }

  return enriched;
}

module.exports = {
  getStopTimes,
};
