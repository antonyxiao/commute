# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Full-stack transit application providing real-time bus schedules and vehicle locations using GTFS/GTFS-Realtime data. Monorepo with React Native (Expo) client and Node.js (Express) server with SQLite database.

## Common Commands

### Server (Terminal 1)
```bash
cd server
npm start                    # Start Express server on port 3000
node import-gtfs.js          # Import GTFS data into SQLite database
```

### Client (Terminal 2)
```bash
cd client
npm start                    # Start Expo dev server
# Then press 'w' for web, 'a' for Android, 'i' for iOS
```

### Database
```bash
node check_indexes.js        # Verify database indexes (run from root)
node server/test-gtfs.js     # Test database connectivity
```

## Architecture

```
Client (React Native/Expo)          Server (Express)              Database
┌────────────────────────┐         ┌────────────────────┐        ┌──────────┐
│ Map.js (Leaflet)       │ ──────► │ stopController     │ ─────► │ gtfs.db  │
│ StopCard.js            │  REST   │ tripController     │  SQL   │ (SQLite) │
│ useTransitData.js      │  API    │ vehicleController  │        └──────────┘
│ api.js                 │         │ realtimeService    │ ──────► GTFS-RT APIs
└────────────────────────┘         └────────────────────┘         (protobuf)
```

### Key Data Flow
1. Client requests stops within map bounds → Server queries SQLite
2. User selects stop → Client fetches arrivals and vehicle positions
3. Server merges static GTFS schedule with real-time trip updates/vehicle positions
4. Client polls: vehicles every 5s, arrivals every 10s

### Multi-Agency Support
Configured in `server/config.json` - maps agency keys to GTFS agency IDs and real-time feed URLs. Uses `{{PLACEHOLDER}}` syntax for environment variables (loaded via dotenv).

## Key Files

### Client
- `src/components/Map.js` - Leaflet map with stop markers and vehicle positions
- `src/components/StopCard.js` - Animated bottom sheet with arrivals list
- `src/hooks/useTransitData.js` - Custom hooks with polling logic (useStops, useStopDetails)
- `src/services/api.js` - API wrapper for server endpoints
- `src/constants/config.js` - API_BASE_URL configuration

### Server
- `src/controllers/tripController.js` - Merges static schedule with real-time data, handles trip status (SCHEDULED, CANCELED, ADDED, UNSCHEDULED, SKIPPED)
- `src/services/realtimeService.js` - GTFS-RT fetching with 5s cache TTL
- `src/utils/dateUtils.js` - Date formatting and midnight crossover handling
- `config.json` - Multi-agency configuration
- `loadConfig.js` - Config loader with environment variable substitution

## API Endpoints

- `GET /api/stops_in_bounds?north=&east=&south=&west=` - Stops within bounding box (max 1000)
- `GET /api/stop_times/:stop_id?date=YYYYMMDD` - Arrivals with real-time status
- `GET /api/vehicles_for_stop/:stop_id` - Live vehicle positions

## Configuration

### Server Environment (.env)
```
TRANSLINK_API_KEY=<key>      # Required for Vancouver transit real-time data
```

### Client API URL
Edit `client/src/constants/config.js` to change API_BASE_URL (use ngrok for mobile testing).

## Project Guidelines
- Check feature_list.json first for planned features
- Update progress.md after changes
- Keep UI modern and minimal
