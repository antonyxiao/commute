const express = require('express');
const cors = require('cors');
const compression = require('compression');
const gtfs = require('gtfs');
const config = require('./config.json');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const axios = require('axios');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

const app = express();
const port = 3000;

app.use(compression());
app.use(cors());

const rtCache = {
  tripUpdates: { data: null, timestamp: 0 },
  vehiclePositions: { data: null, timestamp: 0 }
};
const CACHE_TTL = 15000; // 15 seconds

async function fetchWithCache(url, cacheKey) {
  const now = Date.now();
  if (rtCache[cacheKey].data && (now - rtCache[cacheKey].timestamp < CACHE_TTL)) {
    return rtCache[cacheKey].data;
  }
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  rtCache[cacheKey] = { data: response.data, timestamp: now };
  return response.data;
}

// ... (health and stops endpoints remain unchanged)

app.get('/api/stops', async (req, res) => {
  try {
    const stops = await gtfs.getStops();
    res.json(stops);
  } catch (err) {
    console.error('Error fetching stops:', err);
    res.status(500).json({ error: 'Failed to fetch stops' });
  }
});

app.get('/api/stops_in_bounds', async (req, res) => {
  const { north, east, south, west } = req.query;

  if (!north || !east || !south || !west) {
    return res.status(400).json({ error: 'Missing bounding box parameters (north, east, south, west)' });
  }

  const dbPath = path.resolve(__dirname, config.sqlitePath);
  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
      console.error('Error opening database for bounds query:', err.message);
      return res.status(500).json({ error: 'Failed to connect to database' });
    }
  });

  try {
    const stops = await new Promise((resolve, reject) => {
      const query = `
        SELECT stop_id, stop_name, stop_desc, stop_lat, stop_lon 
        FROM stops 
        WHERE stop_lat <= ? AND stop_lat >= ? AND stop_lon <= ? AND stop_lon >= ?
        LIMIT 1000
      `;
      db.all(query, [north, south, east, west], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
    res.json(stops);
  } catch (err) {
    console.error('Error fetching stops in bounds:', err);
    res.status(500).json({ error: 'Failed to fetch stops in bounds' });
  } finally {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      }
    });
  }
});

app.get('/api/stop_times/:stop_id', async (req, res) => {
  const { stop_id } = req.params;

  // 1. Determine Date and Day (Victoria Time)
  let dateString = req.query.date;
  if (!dateString) {
    const now = new Date();
    const dateOptions = { timeZone: 'America/Vancouver', year: 'numeric', month: '2-digit', day: '2-digit' };
    const parts = new Intl.DateTimeFormat('en-CA', dateOptions).formatToParts(now);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const d = parts.find(p => p.type === 'day').value;
    dateString = `${y}${m}${d}`;
  }

  const y = parseInt(dateString.substring(0, 4));
  const m = parseInt(dateString.substring(4, 6)) - 1;
  const d = parseInt(dateString.substring(6, 8));
  const dateObj = new Date(y, m, d);
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = days[dateObj.getDay()];

  const dbPath = path.resolve(__dirname, config.sqlitePath);
  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
      console.error('Error opening database for stop_times:', err.message);
      return res.status(500).json({ error: 'Failed to connect to database' });
    }
  });

  let rows = [];
  try {
    rows = await new Promise((resolve, reject) => {
      // Optimized query to join tables and filter by date in SQL
      // Note: We inject dayName safely because it comes from our fixed array
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
      
      // Params: date (for calendar_dates), stop_id, date (start), date (end)
      db.all(query, [dateString, stop_id, dateString, dateString], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

  } catch (err) {
    console.error('Error fetching static stop times:', err);
    db.close();
    return res.status(500).json({ error: 'Failed to fetch stop times' });
  }

  // 2. Fetch Real-time Updates (only if querying for today/current date)
  // Simple check: if dateString matches today's date in Vancouver
  const now = new Date();
  const dateOptions = { timeZone: 'America/Vancouver', year: 'numeric', month: '2-digit', day: '2-digit' };
  const parts = new Intl.DateTimeFormat('en-CA', dateOptions).formatToParts(now);
  const todayY = parts.find(p => p.type === 'year').value;
  const todayM = parts.find(p => p.type === 'month').value;
  const todayD = parts.find(p => p.type === 'day').value;
  const todayString = `${todayY}${todayM}${todayD}`;

  if (dateString === todayString) {
      try {
          const buffer = await fetchWithCache('https://bct.tmix.se/gtfs-realtime/tripupdates.pb?operatorIds=48', 'tripUpdates');
          const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
          
          const rtMap = new Map();
          feed.entity.forEach(entity => {
              if (entity.tripUpdate && entity.tripUpdate.trip && entity.tripUpdate.stopTimeUpdate) {
                  const tripId = entity.tripUpdate.trip.tripId;
                  // Find update for this specific stop
                  // Note: stopId in RT might not match exactly if there are leading zeros or different formats, but usually it matches GTFS stop_id.
                  // Sometimes RT uses stopSequence. Here we check stopId.
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
                         
                         // Format to HH:MM in America/Vancouver timezone
                         const timeOptions = { 
                             timeZone: 'America/Vancouver', 
                             hour: '2-digit', 
                             minute: '2-digit', 
                             hour12: false 
                         };
                         // Intl.DateTimeFormat returns "02:30" (or sometimes "24:00" depending on locale, usually 00-23)
                         // We can assume en-CA or en-US gives HH:MM
                         rtTime = new Intl.DateTimeFormat('en-CA', timeOptions).format(date);
                     } else if (update.arrival.delay) {
                         // Delay in seconds. Add to static time.
                         const delaySeconds = update.arrival.delay;
                         const [hh, mm, ss] = row.arrival_time.split(':').map(Number);
                         
                         // Create a date object for the scheduled arrival (using today's date)
                         // Note: This logic assumes the trip is for 'today'.
                         // For trips crossing midnight, this simple logic might be slightly off if not careful, 
                         // but standard GTFS usually handles 24+ hours.
                         // However, for RT display purposes, we just need to add seconds.
                         
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

          // Helper to convert HH:MM to minutes from midnight for sorting
          const timeToMinutes = (timeString) => {
            if (!timeString) return -1; // Or some other value that places them correctly
            const [hours, minutes] = timeString.split(':').map(Number);
            return hours * 60 + minutes;
          };

          // Sort the rows based on real-time arrival, then scheduled arrival
          rows.sort((a, b) => {
            const timeA = a.real_time_arrival ? timeToMinutes(a.real_time_arrival) : timeToMinutes(a.arrival_time);
            const timeB = b.real_time_arrival ? timeToMinutes(b.real_time_arrival) : timeToMinutes(b.arrival_time);

            // Handle cases where real_time_arrival might be null for some, but others have a scheduled time
            // For example, a trip might not have real-time data, but still has a valid scheduled time.
            if (timeA === -1 && timeB !== -1) return 1; // a is undefined, b is defined, b comes first
            if (timeA !== -1 && timeB === -1) return -1; // a is defined, b is undefined, a comes first
            if (timeA === -1 && timeB === -1) return 0; // both undefined, maintain original order

            return timeA - timeB;
          });

      } catch (rtErr) {
          console.error('Error fetching/parsing real-time updates:', rtErr);
          // Proceed without RT data on error
      }
  }

  db.close((err) => {
    if (err) console.error('Error closing database:', err.message);
  });
  
  res.json(rows);
});

app.get('/api/vehicles_for_stop/:stop_id', async (req, res) => {
  const { stop_id } = req.params;

  // 1. Determine Date and Day (Victoria Time)
  let dateString = req.query.date;
  if (!dateString) {
    const now = new Date();
    const dateOptions = { timeZone: 'America/Vancouver', year: 'numeric', month: '2-digit', day: '2-digit' };
    const parts = new Intl.DateTimeFormat('en-CA', dateOptions).formatToParts(now);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const d = parts.find(p => p.type === 'day').value;
    dateString = `${y}${m}${d}`;
  }

  const y = parseInt(dateString.substring(0, 4));
  const m = parseInt(dateString.substring(4, 6)) - 1;
  const d = parseInt(dateString.substring(6, 8));
  const dateObj = new Date(y, m, d);
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = days[dateObj.getDay()];

  const dbPath = path.resolve(__dirname, config.sqlitePath);
  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
      console.error('Error opening database for vehicles:', err.message);
      return res.status(500).json({ error: 'Failed to connect to database' });
    }
  });

  try {
    // Get all trips serving this stop for the current date
    const validTrips = await new Promise((resolve, reject) => {
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
        db.all(query, [dateString, stop_id, dateString, dateString], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

    const tripMap = new Map();
    validTrips.forEach(t => tripMap.set(t.trip_id, t));

    let vehicles = [];
    try {
        // Fetch Real-time Vehicle Positions
        // Using 48 as established for Victoria
        const buffer = await fetchWithCache('https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=48', 'vehiclePositions');
        const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

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
        // Continue with empty vehicles list
    }

    res.json(vehicles);

  } catch (err) {
    console.error('Error fetching vehicles endpoint:', err);
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  } finally {
    db.close((err) => {
        if(err) console.error(err);
    });
  }
});

async function startServer() {
  try {
    await gtfs.openDb(config);
    console.log('GTFS Database opened successfully.');
    
    app.listen(port, () => {
      console.log(`Server listening at http://localhost:${port}`);
    });
  } catch (err) {
    console.error('Failed to open GTFS database:', err);
    process.exit(1);
  }
}

startServer();
