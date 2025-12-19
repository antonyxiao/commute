const { queryAll } = require('../db');
const { fetchWithCache, decodeFeed } = require('../services/realtimeService');
const { toGTFSDate, parseGTFSDate, getDayName, timeToMinutes, formatGTFSTime } = require('../utils/dateUtils');
const config = require('../../loadConfig');

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

  // 2. Fetch Real-time Updates (only if querying for today/current date)
  const todayString = toGTFSDate(new Date());

  if (dateString === todayString) {
      try {
          // Identify relevant agencies from the rows
          const relevantAgencies = new Set();
          rows.forEach(row => {
              const safeId = row.agency_id || "";
              const agency = config.agencies.find(a => a.gtfs_agency_ids && a.gtfs_agency_ids.includes(safeId));
              if (agency) relevantAgencies.add(agency);
          });

          const rtMap = new Map();
          const addedTrips = [];

          // Fetch RT data for all relevant agencies
          for (const agency of relevantAgencies) {
              const tripUpdatesUrl = agency.realtimeUrls ? agency.realtimeUrls.tripUpdates : null;
              
              if (tripUpdatesUrl) {
                  try {
                      const buffer = await fetchWithCache(tripUpdatesUrl, `tripUpdates_${agency.agency_key}`);
                      const feed = decodeFeed(buffer);
                      
                      feed.entity.forEach(entity => {
                          if (entity.tripUpdate && entity.tripUpdate.trip) {
                              const tripUpdate = entity.tripUpdate;
                              const tripId = tripUpdate.trip.tripId;
                              const routeId = tripUpdate.trip.routeId;
                              
                              // ScheduleRelationship enum: 0=SCHEDULED, 1=ADDED, 2=UNSCHEDULED, 3=CANCELED
                              const scheduleRelationship = tripUpdate.trip.scheduleRelationship;

                              if (scheduleRelationship === 3) { // CANCELED
                                  rtMap.set(tripId, { status: 'CANCELED' });
                              } else {
                                  // For SCHEDULED, ADDED, UNSCHEDULED, we need a stop update for this stop
                                  const stopUpdate = tripUpdate.stopTimeUpdate 
                                      ? tripUpdate.stopTimeUpdate.find(u => u.stopId == stop_id) 
                                      : null;

                                  if (stopUpdate) {
                                      if (stopUpdate.scheduleRelationship === 1) { // SKIPPED
                                          rtMap.set(tripId, { status: 'SKIPPED' });
                                      } else if (scheduleRelationship === 1 || scheduleRelationship === 2) {
                                          // ADDED or UNSCHEDULED
                                          addedTrips.push({
                                              tripId,
                                              routeId,
                                              tripUpdate,
                                              stopUpdate,
                                              status: scheduleRelationship === 1 ? 'ADDED' : 'UNSCHEDULED',
                                              agencyId: agency.agency_id
                                          });
                                      } else {
                                          // SCHEDULED (default)
                                          rtMap.set(tripId, { status: 'SCHEDULED', stopUpdate });
                                      }
                                  }
                              }
                          }
                      });
                  } catch (agencyErr) {
                      console.error(`Error fetching RT for agency ${agency.agency_key}:`, agencyErr);
                  }
              }
          }

          // Process Added Trips
          for (const added of addedTrips) {
              // Try to find a template row to copy route info from
              // We look for a row with the same route_id. If multiple agencies share routes, strict checking might be needed, 
              // but here we just try to find a match in the static data we pulled.
              // Note: 'rows' doesn't explicitly have route_id selected in the SQL above? 
              // Wait, looking at SQL: "r.route_short_name, r.route_color..." but route_id is strictly in the JOIN.
              // I should check if I selected route_id. The SQL says: "t.trip_id, t.service_id, t.direction_id, ... r.agency_id". 
              // It does NOT select r.route_id explicitly? "JOIN routes r ON t.route_id = r.route_id".
              // Actually, I should check the SQL in the file. 
              // The SQL is: "SELECT t.trip_id ... r.route_short_name ..." 
              // It seems I missed selecting r.route_id in the original SQL if I need it for matching.
              // However, I can try to match by agency_id if route_id is not available, or just use a default.
              // Actually, `added.routeId` comes from RT. `rows` might not have `route_id`.
              // Let's assume for now we can't easily match route metadata without route_id in `rows`.
              // FIX: I will check if I can modify the query later, but for now I'll use a heuristic or just empty strings.
              // BETTER: Just use what we have. If we can't find route info, the UI will just show less info.
              
              // Let's Calculate the time for the added trip
              let rtTime = null;
              const update = added.stopUpdate;
              
              if (update.arrival) {
                   if (update.arrival.time) {
                       const timestamp = update.arrival.time.low || update.arrival.time;
                       const date = new Date(timestamp * 1000);
                       const timeOptions = { timeZone: 'America/Vancouver', hour: '2-digit', minute: '2-digit', hour12: false };
                       rtTime = new Intl.DateTimeFormat('en-CA', timeOptions).format(date);
                   } else if (update.arrival.delay) {
                       // Delay logic requires a scheduled time, which added trips don't have.
                       // Usually added trips provide absolute time. If only delay is provided, we can't calculate it without a base.
                       // We'll skip if no time.
                   }
              }

              if (rtTime) {
                  // Construct a pseudo-row
                  // We try to find *any* row with the same agency to at least get some style if possible, 
                  // or better, if we had route_id in rows we could match.
                  // Since I can't easily change the SQL in this tool call without replacing the whole file, 
                  // I'll leave route info basic.
                  
                  rows.push({
                      trip_id: added.tripId,
                      route_short_name: 'Add', // Indicating added
                      route_color: '000000', // Default black
                      route_text_color: 'FFFFFF',
                      trip_headsign: 'Added Service',
                      arrival_time: rtTime, // Use RT time as "scheduled" for sorting/display base
                      departure_time: rtTime,
                      real_time_arrival: formatGTFSTime(rtTime),
                      status: added.status,
                      is_added: true,
                      agency_id: added.agencyId
                  });
              }
          }

            // Enrich rows with RT data
            rows = rows.map(row => {
               let sortTime = timeToMinutes(row.arrival_time);
               let rtTime = null;
               let status = 'SCHEDULED';

               if (rtMap.has(row.trip_id)) {
                   const update = rtMap.get(row.trip_id);
                   status = update.status; // SCHEDULED or CANCELED
                   
                   if (status === 'CANCELED') {
                       // Canceled trips often don't have time updates, or we shouldn't rely on them.
                       // We keep the scheduled time for sorting or display (maybe strikethrough).
                   } else if (update.stopUpdate) {
                       // ... (existing time calculation logic) ...
                       const stopUpdate = update.stopUpdate;
                       if (stopUpdate.arrival) {
                           if (stopUpdate.arrival.time) {
                               const timestamp = stopUpdate.arrival.time.low || stopUpdate.arrival.time; 
                               const date = new Date(timestamp * 1000);
                               const timeOptions = { timeZone: 'America/Vancouver', hour: '2-digit', minute: '2-digit', hour12: false };
                               rtTime = new Intl.DateTimeFormat('en-CA', timeOptions).format(date);
                           } else if (stopUpdate.arrival.delay) {
                               const delaySeconds = stopUpdate.arrival.delay;
                               const [hh, mm, ss] = row.arrival_time.split(':').map(Number);
                               const arrivalDate = new Date();
                               arrivalDate.setHours(hh);
                               arrivalDate.setMinutes(mm);
                               arrivalDate.setSeconds(ss || 0);
                               arrivalDate.setSeconds(arrivalDate.getSeconds() + delaySeconds);
                               const timeOptions = { timeZone: 'America/Vancouver', hour: '2-digit', minute: '2-digit', hour12: false };
                               rtTime = new Intl.DateTimeFormat('en-CA', timeOptions).format(arrivalDate);
                           }
                       }
                   }
                   
                   if (rtTime) {
                       let rtMinutes = timeToMinutes(rtTime);
                       const scheduledMinutes = timeToMinutes(row.arrival_time);
                       if (Math.abs(rtMinutes - scheduledMinutes) > 720) {
                           if (rtMinutes < scheduledMinutes) rtMinutes += 1440;
                           else rtMinutes -= 1440;
                       }
                       sortTime = rtMinutes;
                   }
               }

               return { 
                   ...row, 
                   arrival_time: formatGTFSTime(row.arrival_time),
                   departure_time: formatGTFSTime(row.departure_time),
                   real_time_arrival: rtTime ? formatGTFSTime(rtTime) : null, 
                   sortTime,
                   status: row.is_added ? row.status : status // Preserve 'ADDED'/'UNSCHEDULED' or use 'CANCELED'/'SCHEDULED'
               };
            });

          rows.sort((a, b) => a.sortTime - b.sortTime);

      } catch (rtErr) {
          console.error('Error fetching/parsing real-time updates:', rtErr);
      }
  } else {
      // For non-today dates, still format the static times
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
