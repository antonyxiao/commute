const { queryAll } = require('../db');
const { getDayNameFromGTFSDate, getServiceDayColumn } = require('../utils/dateUtils');
const { TtlCache } = require('../utils/ttlCache');

// Static schedules only change when GTFS is re-imported, so a 5 minute cache
// safely removes the repeated stop_times scans for every polling request.
const tripsCache = new TtlCache({ ttl: 5 * 60 * 1000, max: 200 });

/**
 * Builds the "trips serving this stop on this date" query.
 * The weekday column comes from an allow-list so it is safe to interpolate.
 * @param {string} dayColumn
 * @returns {string}
 */
function buildTripsAtStopQuery(dayColumn) {
  const column = getServiceDayColumn(dayColumn);
  if (!column) {
    throw new Error(`Invalid service day column: ${dayColumn}`);
  }

  return `
    SELECT
        t.trip_id,
        t.service_id,
        t.direction_id,
        t.trip_headsign,
        r.route_short_name,
        r.route_long_name,
        r.route_color,
        r.route_text_color,
        r.route_type,
        r.agency_id,
        st.arrival_time,
        st.departure_time,
        st.stop_headsign,
        st.stop_sequence
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
            AND c.${column} = 1
            AND (cd.service_id IS NULL OR cd.exception_type != 2)
        )
    )
    ORDER BY st.arrival_time, t.trip_id
  `;
}

/**
 * Returns every scheduled trip serving a stop on a service date.
 * @param {string} stopId
 * @param {string} dateString YYYYMMDD
 * @returns {Promise<Array>}
 */
async function getTripsAtStop(stopId, dateString) {
  const cacheKey = `${stopId}_${dateString}`;
  const cached = tripsCache.get(cacheKey);
  if (cached) return cached;

  const dayName = getDayNameFromGTFSDate(dateString);
  if (!dayName) throw new Error(`Invalid service date: ${dateString}`);

  const query = buildTripsAtStopQuery(dayName);
  const rows = await queryAll(query, [dateString, stopId, dateString, dateString]);

  tripsCache.set(cacheKey, rows);
  return rows;
}

module.exports = {
  buildTripsAtStopQuery,
  getTripsAtStop,
  tripsCache,
};
