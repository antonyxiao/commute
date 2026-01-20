const { queryAll } = require('../db');
const { fetchWithCache, decodeFeed } = require('../services/realtimeService');
const { toGTFSDate, parseGTFSDate, getDayName, timeToMinutes, formatGTFSTime, formatTimestamp } = require('../utils/dateUtils');
const config = require('../../loadConfig');

// Server-side result cache for stop times
const stopTimesCache = {};
const RESULT_CACHE_TTL = 10000; // 10 seconds

/**
 * Get stop times for a specific stop, optionally merging with real-time data.
 */
async function getStopTimes(req, res) {
  const { stop_id } = req.params;

  // 1. Determine Date and Day
  let dateString = req.query.date;
  if (!dateString) {
    dateString = toGTFSDate(new Date());
  }

  const todayString = toGTFSDate(new Date());
  const isToday = dateString === todayString;

  // Check result cache for today's data
  const cacheKey = `${stop_id}_${dateString}`;
  const now = Date.now();
  if (isToday && stopTimesCache[cacheKey] && (now - stopTimesCache[cacheKey].timestamp < RESULT_CACHE_TTL)) {
    return res.json(stopTimesCache[cacheKey].data);
  }

  const dateObj = parseGTFSDate(dateString);
  const dayName = getDayName(dateObj);

  let rows = [];
  try {
    // Optimized query with all needed fields
    const query = `
        SELECT
            t.trip_id,
            t.service_id,
            t.direction_id,
            t.trip_headsign,
            r.route_short_name,
            r.route_color,
            r.route_text_color,
            r.agency_id,
            st.arrival_time,
            st.departure_time,
            st.stop_headsign
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
        ORDER BY st.arrival_time
      `;

    rows = await queryAll(query, [dateString, stop_id, dateString, dateString]);

  } catch (err) {
    console.error('Error fetching static stop times:', err);
    return res.status(500).json({ error: 'Failed to fetch stop times' });
  }

  // 2. Fetch Real-time Updates (only if querying for today)
  if (isToday) {
    try {
      // Identify relevant agencies from the rows
      const agencySet = new Set();
      for (const row of rows) {
        const safeId = row.agency_id || "";
        const agency = config.agencies.find(a => a.gtfs_agency_ids?.includes(safeId));
        if (agency) agencySet.add(agency);
      }
      const relevantAgencies = [...agencySet];

      // Parallel fetch RT data for all agencies
      const rtResults = await Promise.all(
        relevantAgencies.map(async (agency) => {
          const tripUpdatesUrl = agency.realtimeUrls?.tripUpdates;
          if (!tripUpdatesUrl) return null;

          try {
            const buffer = await fetchWithCache(tripUpdatesUrl, `tripUpdates_${agency.agency_key}`);
            return { agency, feed: decodeFeed(buffer) };
          } catch (err) {
            console.error(`Error fetching RT for agency ${agency.agency_key}:`, err.message);
            return null;
          }
        })
      );

      // Build RT lookup map and collect added trips in single pass
      const rtMap = new Map();
      const addedTrips = [];

      for (const result of rtResults) {
        if (!result) continue;
        const { feed } = result;

        for (const entity of feed.entity) {
          if (!entity.tripUpdate?.trip) continue;

          const tripUpdate = entity.tripUpdate;
          const tripId = tripUpdate.trip.tripId;
          const scheduleRelationship = tripUpdate.trip.scheduleRelationship;

          if (scheduleRelationship === 3) { // CANCELED
            rtMap.set(tripId, { status: 'CANCELED' });
            continue;
          }

          const stopUpdate = tripUpdate.stopTimeUpdate?.find(u => u.stopId == stop_id);
          if (!stopUpdate) continue;

          if (stopUpdate.scheduleRelationship === 1) { // SKIPPED
            rtMap.set(tripId, { status: 'SKIPPED' });
          } else if (scheduleRelationship === 1 || scheduleRelationship === 2) {
            // ADDED or UNSCHEDULED
            addedTrips.push({
              tripId,
              stopUpdate,
              status: scheduleRelationship === 1 ? 'ADDED' : 'UNSCHEDULED'
            });
          } else {
            rtMap.set(tripId, { status: 'SCHEDULED', stopUpdate });
          }
        }
      }

      // Process added trips
      for (const added of addedTrips) {
        const update = added.stopUpdate;
        let rtTime = null;

        if (update.arrival?.time) {
          const timestamp = update.arrival.time.low || update.arrival.time;
          rtTime = formatTimestamp(timestamp);
        }

        if (rtTime) {
          rows.push({
            trip_id: added.tripId,
            route_short_name: 'Add',
            route_color: '000000',
            route_text_color: 'FFFFFF',
            trip_headsign: 'Added Service',
            arrival_time: rtTime,
            departure_time: rtTime,
            real_time_arrival: formatGTFSTime(rtTime),
            status: added.status,
            is_added: true
          });
        }
      }

      // Single-pass enrichment and transformation
      rows = rows.map(row => {
        let sortTime = timeToMinutes(row.arrival_time);
        let rtTime = null;
        let status = row.is_added ? row.status : 'SCHEDULED';

        const rtData = rtMap.get(row.trip_id);
        if (rtData) {
          status = rtData.status;

          if (rtData.stopUpdate) {
            const stopUpdate = rtData.stopUpdate;
            if (stopUpdate.arrival?.time) {
              const timestamp = stopUpdate.arrival.time.low || stopUpdate.arrival.time;
              rtTime = formatTimestamp(timestamp);
            } else if (stopUpdate.arrival?.delay) {
              const delaySeconds = stopUpdate.arrival.delay;
              const [hh, mm, ss] = row.arrival_time.split(':').map(Number);
              const arrivalDate = new Date();
              arrivalDate.setHours(hh, mm, ss || 0, 0);
              arrivalDate.setSeconds(arrivalDate.getSeconds() + delaySeconds);
              rtTime = formatTimestamp(Math.floor(arrivalDate.getTime() / 1000));
            }

            if (rtTime) {
              let rtMinutes = timeToMinutes(rtTime);
              const scheduledMinutes = timeToMinutes(row.arrival_time);
              // Handle midnight crossover
              if (Math.abs(rtMinutes - scheduledMinutes) > 720) {
                rtMinutes += rtMinutes < scheduledMinutes ? 1440 : -1440;
              }
              sortTime = rtMinutes;
            }
          }
        }

        return {
          ...row,
          arrival_time: formatGTFSTime(row.arrival_time),
          departure_time: formatGTFSTime(row.departure_time),
          real_time_arrival: rtTime ? formatGTFSTime(rtTime) : null,
          sortTime,
          status
        };
      });

      rows.sort((a, b) => a.sortTime - b.sortTime);

      // Cache result
      stopTimesCache[cacheKey] = { data: rows, timestamp: Date.now() };

    } catch (rtErr) {
      console.error('Error fetching/parsing real-time updates:', rtErr);
    }
  } else {
    // For non-today dates, just format times
    rows = rows.map(row => ({
      ...row,
      arrival_time: formatGTFSTime(row.arrival_time),
      departure_time: formatGTFSTime(row.departure_time)
    }));
  }

  res.json(rows);
}

module.exports = {
  getStopTimes
};
