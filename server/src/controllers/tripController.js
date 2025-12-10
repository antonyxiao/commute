const { queryAll } = require('../db');
const { fetchWithCache, decodeFeed } = require('../services/realtimeService');
const { toGTFSDate, parseGTFSDate, getDayName, timeToMinutes } = require('../utils/dateUtils');

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

  const dateObj = parseGTFSDate(dateString);
  const dayName = getDayName(dateObj);

  let rows = [];
  try {
    // Optimized query to join tables and filter by date in SQL
    const query = `
        SELECT 
            t.trip_id,
            t.service_id,
            t.direction_id,
            t.trip_headsign,
            r.route_short_name,
            r.route_color,
            r.route_text_color,
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

  // 2. Fetch Real-time Updates (only if querying for today/current date)
  const todayString = toGTFSDate(new Date());

  if (dateString === todayString) {
      try {
          const buffer = await fetchWithCache('https://bct.tmix.se/gtfs-realtime/tripupdates.pb?operatorIds=48', 'tripUpdates');
          const feed = decodeFeed(buffer);
          
          const rtMap = new Map();
          feed.entity.forEach(entity => {
              if (entity.tripUpdate && entity.tripUpdate.trip && entity.tripUpdate.stopTimeUpdate) {
                  const tripId = entity.tripUpdate.trip.tripId;
                  const stopUpdate = entity.tripUpdate.stopTimeUpdate.find(u => u.stopId == stop_id);
                  if (stopUpdate) {
                      rtMap.set(tripId, stopUpdate);
                  }
              }
          });

          // Enrich rows with RT data
          rows = rows.map(row => {
             if (rtMap.has(row.trip_id)) {
                 const update = rtMap.get(row.trip_id);
                 let rtTime = null;
                 
                 if (update.arrival) {
                     if (update.arrival.time) {
                         // Timestamp is in seconds
                         const timestamp = update.arrival.time.low || update.arrival.time; 
                         const date = new Date(timestamp * 1000);
                         
                         const timeOptions = { 
                             timeZone: 'America/Vancouver', 
                             hour: '2-digit', 
                             minute: '2-digit', 
                             hour12: false 
                         };
                         rtTime = new Intl.DateTimeFormat('en-CA', timeOptions).format(date);
                     } else if (update.arrival.delay) {
                         const delaySeconds = update.arrival.delay;
                         const [hh, mm, ss] = row.arrival_time.split(':').map(Number);
                         
                         const arrivalDate = new Date();
                         arrivalDate.setHours(hh);
                         arrivalDate.setMinutes(mm);
                         arrivalDate.setSeconds(ss || 0);
                         
                         // Add delay
                         arrivalDate.setSeconds(arrivalDate.getSeconds() + delaySeconds);
                         
                         const timeOptions = { 
                             timeZone: 'America/Vancouver', 
                             hour: '2-digit', 
                             minute: '2-digit', 
                             hour12: false 
                         };
                         rtTime = new Intl.DateTimeFormat('en-CA', timeOptions).format(arrivalDate);
                     }
                 }
                 
                 return { ...row, real_time_arrival: rtTime };
             }
             return row; 
          });

          rows.sort((a, b) => {
            const timeA = a.real_time_arrival ? timeToMinutes(a.real_time_arrival) : timeToMinutes(a.arrival_time);
            const timeB = b.real_time_arrival ? timeToMinutes(b.real_time_arrival) : timeToMinutes(b.arrival_time);

            if (timeA === -1 && timeB !== -1) return 1;
            if (timeA !== -1 && timeB === -1) return -1;
            if (timeA === -1 && timeB === -1) return 0;

            return timeA - timeB;
          });

      } catch (rtErr) {
          console.error('Error fetching/parsing real-time updates:', rtErr);
      }
  }
  
  res.json(rows);
}

module.exports = {
  getStopTimes
};
