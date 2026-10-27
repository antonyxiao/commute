# Commute

Real-time transit for Victoria, BC (and TransLink / Vancouver), built with GTFS and
GTFS-Realtime. React Native (Expo) client with a native map on iOS/Android, a Leaflet
map on web, and an Express + SQLite backend.

## Highlights

- **Keyless maps** everywhere: iOS/Android run Leaflet inside a WebView with CARTO/OSM
  raster tiles (street names, no API key) and client-side stop clustering. Web uses
  Leaflet directly with the same controls.
- **Adaptive design** that follows the system light/dark appearance, with a draggable,
  safe-area-aware arrivals sheet.
- **Live data** polled every 5s (vehicles) and 10s (arrivals), paused in the background.
- **Resilient networking**: request timeouts, stale-request cancellation, retry/refresh
  states, and automatic API host detection on devices.
- **Schedule picker** for a specific day and departure time, plus Inbound/Outbound filters.
- **Bounded server caches** and parameterized, indexed GTFS queries.

## Project layout

```
client/                    Expo app
  App.js                   App shell (map + overlays + stop sheet)
  src/components/
    Map.native.js          keyless Leaflet WebView + clustering
    Map.web.js             react-leaflet map
    StopCard.js            Draggable arrivals bottom sheet
    ArrivalRow.js          Arrival row (countdown, route badge, status chips)
    DateTimeSheet.js       Schedule picker
    ui/IconButton.js
  src/constants/           theme, layout, API config
  src/hooks/               polling + fetching hooks
  src/utils/               formatting, clustering, GTFS enum helpers
server/                    Express API
  src/controllers/         stops, stop_times, vehicles
  src/services/            GTFS queries + GTFS-RT cache
  src/utils/               date/time, TTL cache
  test/                    node:test suites
  config.json              agencies + feed URLs
```

## Requirements

- Node.js 18+ (Node 20 recommended) and npm
- Expo Go on a phone for native testing (optional)
- A GTFS database at `gtfs.db` (see the import step below)

## Quick start

Convenience scripts from the repo root: `npm run server`, `npm run client`,
`npm test`, `npm run import-gtfs`, `npm run add-indexes`.

### 1. Backend

```bash
cd server
npm install
cp .env.example .env          # add TRANSLINK_API_KEY if using Vancouver
node import-gtfs.js           # first run only: downloads GTFS and builds ../gtfs.db
npm start                     # http://localhost:3000
```

The server prints its LAN URL(s) at startup. It listens on `0.0.0.0:3000` by default
so phones on the same Wi-Fi can reach it.

### 2. Client

```bash
cd client
npm install
npm start                     # press w (web), a (Android), or i (iOS)
```

No IP editing is required: the app derives the API host from the Expo dev server on
devices and from `window.location.hostname` on web. Override it when needed:

```bash
# client/.env
EXPO_PUBLIC_API_URL=http://192.168.1.50:3000
```

## Tests

```bash
cd server && npm test
```

Covers the Vancouver timezone handling, GTFS service-day selection, time formatting,
query parameterization, and TTL cache eviction.

## Configuration

`server/config.json` maps agencies to their GTFS agency IDs and real-time feed URLs.
`{{PLACEHOLDER}}` values are substituted from `server/.env`.

- `TRANSLINK_API_KEY` — required for TransLink real-time data.
- `PORT` / `HOST` — optional server overrides.

## Native map notes

- The native map is a **keyless Leaflet map in a WebView** (`react-native-webview`).
  Tiles come from CARTO's Positron (light) and Dark Matter (dark) basemaps, which are
  built from OpenStreetMap data and include street names. No Google Maps key is needed.
- `react-native-webview` and `expo-location` work in **Expo Go** out of the box.
- Performance: tiles are not loaded during panning, retina duplicates are disabled,
  stops are clustered into screen-space cells, and the server only returns stops in
  the viewport plus a capped window of arrivals.
- Location is only requested when the user taps the locate / nearest-stop buttons.
- The basemap needs a network connection (raster tiles are not bundled).

## Troubleshooting

- **No arrivals / empty schedule** — check the GTFS feed coverage. The calendar in
  `gtfs.db` must include today; re-run `node import-gtfs.js` to refresh.
- **Phone can't reach the API** — make sure both devices are on the same network, the
  server is running, and port 3000 is not blocked. Set `EXPO_PUBLIC_API_URL` if the
  auto-detected host is wrong.
- **Map is blank** — the Leaflet CDN or CARTO tile CDN is unreachable; check the network connection.
