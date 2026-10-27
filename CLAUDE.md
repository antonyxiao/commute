# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project Overview

Full-stack transit app for Victoria BC Transit (and TransLink) using GTFS + GTFS-Realtime.
Monorepo: React Native (Expo) client and Node.js (Express) server with SQLite.

## Common Commands

### Server
```bash
cd server
npm start                    # Express on 0.0.0.0:3000
npm test                     # node:test suites (date/time, queries, TTL cache)
node import-gtfs.js          # Download GTFS and rebuild ../gtfs.db
npm run add-indexes          # (optional) rebuild SQLite indexes
```

### Client
```bash
cd client
npm start                    # Expo dev server (w, a, i)
npx expo export --platform web   # build check used before finishing work
```

## Architecture

```
Client (Expo)                          Server (Express)             Database
┌────────────────────────────┐         ┌────────────────────┐        ┌──────────┐
│ Map.native.js (RN Maps)    │ ──────► │ stopController     │ ─────► │ gtfs.db  │
│ Map.web.js (Leaflet)       │  REST   │ tripController     │  SQL   │ (SQLite) │
│ StopCard / ArrivalRow      │  API    │ vehicleController  │        └──────────┘
│ useTransitData hooks       │         │ gtfsQueries        │ ─────► GTFS-RT feeds
│ api.js (auto API host)     │         │ realtimeService    │        (protobuf)
└────────────────────────────┘         └────────────────────┘
```

Data flow:
1. Map reports viewport bounds → `/api/stops_in_bounds`.
2. Selecting a stop fetches `/api/stop_times` and `/api/vehicles_for_stop`.
3. Server merges static schedule with GTFS-RT trip updates / vehicle positions.
4. Client polls vehicles every 5s and arrivals every 10s (foreground only).

## Where things live

### Client
- `src/components/Map.native.js` — keyless Leaflet-in-WebView map, CARTO tiles, clustering.
- `src/components/map/leafletHtml.js` — HTML/JS document injected into the native WebView.
- `src/components/Map.web.js` — `react-leaflet` map, themed tiles and controls.
- `src/components/StopCard.js` — draggable bottom sheet, safe areas, direction filter.
- `src/components/ArrivalRow.js` — countdown, route badge, delay/status chips.
- `src/components/DateTimeSheet.js` — schedule date/time picker.
- `src/hooks/useTransitData.js` — fetch/poll hooks with cancellation and errors.
- `src/services/api.js` — fetch wrapper (timeouts, abort, query building).
- `src/constants/config.js` — API host auto-detection + polling intervals.
- `src/constants/theme.js` — light/dark palette and map tiles.
- `src/constants/layout.js` — bottom-sheet snap heights.
- `src/utils/` — formatting, clustering, GTFS enum labels.

### Server
- `src/services/gtfsQueries.js` — shared, parameterized "trips at stop" query + cache.
- `src/controllers/tripController.js` — merges schedule with GTFS-RT, trip statuses.
- `src/controllers/vehicleController.js` — live vehicle positions for a stop.
- `src/controllers/stopController.js` — bounds validation + indexed stop lookup.
- `src/services/realtimeService.js` — GTFS-RT fetch with TTL cache + deduplication.
- `src/utils/dateUtils.js` — Vancouver-timezone-safe dates and GTFS times.
- `src/utils/ttlCache.js` — bounded LRU/TTL cache.
- `config.json` / `loadConfig.js` — multi-agency configuration with env substitution.

## API

- `GET /api/stops_in_bounds?north=&east=&south=&west=` — stops in viewport (max 1000)
- `GET /api/stop_times/:stop_id?date=YYYYMMDD&after=HH:MM` — arrivals + realtime status (windowed, max 150)
- `GET /api/vehicles_for_stop/:stop_id?date=YYYYMMDD` — live vehicle positions
- `GET /health` — health check

## Conventions

- Keep UI minimal and mobile-first; support system light/dark.
- Use the existing theme tokens / `dark:` classes instead of hard-coded colors where possible.
- Always cancel in-flight requests when inputs change; never poll in the background.
- Bound any server cache; never add unbounded module-level maps.
- Validate all user input (bounds, dates, stop IDs); keep SQL parameterized.
- Run `cd server && npm test` and the web export before finishing.

## Configuration

- `server/.env`: `TRANSLINK_API_KEY`, optional `PORT`/`HOST`.
- `client/.env`: optional `EXPO_PUBLIC_API_URL` override.
- `gtfs.db` and `node_modules` are intentionally untracked.
