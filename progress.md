# Progress Log

## Date: 2025-12-18

### Issues Resolved
1.  **Server/Client Config Mismatch**: 
    - Updated `client/src/constants/config.js` to use `http://localhost:3000` instead of ngrok.
    - Updated `server/config.json` to point to the correct database location (`../gtfs.db`).

2.  **Database Issues**:
    - Identified `gtfs.db` was empty (0 bytes).
    - Successfully populated `gtfs.db` (~260MB) using `server/import-gtfs.js`.
    - Verified database content with `server/check_stops_custom.js` and `server/test-gtfs.js`.
    - Fixed server 500 errors for `/api/stops_in_bounds`.

3.  **Real-time Features**:
    - Enhanced `server/src/controllers/vehicleController.js` to expose:
        - Speed
        - Occupancy Status
        - Congestion Level
        - Current Status (Stop Status)
    - Updated `client/src/components/Map.js`:
        - Added helper functions to decode GTFS-RT enums.
        - Added a Popup to vehicle markers to display real-time data.
        - Removed "Status" field from the popup upon user request.

4.  **UX Improvements**:
    - Removed "silent retry" logic from `LocationMarker` in `client/src/components/Map.js` to prevent infinite location loops/spam.

### Current State
- Server is running locally on port 3000.
- Client is configured for local development.
- Database is populated and accessible.
- Real-time vehicle data is being fetched and displayed on the map.

## Date: 2025-12-19

### Performance Optimization
1.  **GTFS Import Speed**:
    -   Upgraded `node-gtfs` from v2 to v4.18.2 to address the 10+ minute import time for `stop_times`.
    -   This version utilizes `better-sqlite3` for significantly faster bulk inserts.
    -   Updated `server/import-gtfs.js` to use dynamic imports (ESM) to support the new library version.

### Reliability
1.  **GTFS Download Timeout**:
    -   Added `downloadTimeout: 300000` (5 minutes) to `server/config.json` to prevent `TimeoutError` during the download of large GTFS zip files.

### Bug Fixes
1.  **Midnight Crossover Sorting**:
    -   Fixed an issue where real-time updates after midnight (e.g., 00:10) were sorted to the top of the arrivals list instead of the bottom.
    -   Implemented a closest-time heuristic in `server/src/controllers/tripController.js` that adjusts real-time minutes by +/- 24 hours if the difference from scheduled time exceeds 12 hours.
2.  **GTFS Time Formatting**:
    -   Fixed the display of "late-night" GTFS times (e.g., 25:05, 26:04).
    -   Added `formatGTFSTime` to `server/src/utils/dateUtils.js` to convert these to standard 24-hour clock strings (e.g., 1:05, 2:04) while maintaining the original values for sorting.
3.  **Syntax Error in Trip Controller**:
    -   Fixed a "Missing catch or finally after try" syntax error in `server/src/controllers/tripController.js`.
    -   Removed an extra closing brace that was prematurely terminating a `try` block.

### Features
1.  **Multi-Agency Real-time Support**:
    -   Updated `server/config.json` to map agencies to their GTFS `agency_id`s.
    -   Refactored `tripController.js` and `vehicleController.js` to fetch and aggregate real-time data from multiple agencies dynamically based on the stop's agency context.
    -   Updated `realtimeService.js` to support dynamic cache keys for different feeds.

2.  **Enhanced Real-time Status UI**:
    -   Updated `client/src/components/StopCard.js` to handle and visualize:
        -   **Canceled** trips (strikethrough, red text).
        -   **Skipped** stops (strikethrough, gray text).
        -   **Added** trips (green text).
        -   **Unscheduled** trips (orange text).
    -   Improved `tripController.js` to parse `scheduleRelationship` from GTFS-RT (CANCELED, ADDED, UNSCHEDULED) and `StopPoint` (SKIPPED).

### UX Improvements
1.  **Map Popup Styling**:
    -   Compacted the vehicle information popup in `client/src/components/Map.js` to occupy less screen space.
    -   Reduced font sizes, line heights, and margins for a cleaner look.
    -   Fixed persistent line spacing issues by switching from `<p>` to `<div>` tags and using `!m-0` to override default Leaflet styles.

### Refactoring
1.  **Removed Runtime Dependency**:
    -   Refactored `server/src/controllers/stopController.js` to use direct SQL queries (`SELECT * FROM stops`) via the app's DB module instead of the `gtfs` library helper.
    -   Removed the redundant `gtfs.openDb()` call in `server/index.js`, streamlining the database connection logic to use `server/src/db/index.js`.
    -   Updated `server/test-gtfs.js` to use dynamic imports for compatibility.

## Date: 2025-12-29

### Performance & Real-time Tuning
1.  **Faster Polling Intervals**:
    -   Updated `server/src/services/realtimeService.js` to reduce the cache TTL from 15s to **5s** to support more frequent updates.
    -   Refactored `client/src/hooks/useTransitData.js` to implement independent polling intervals:
        -   **Vehicle Positions**: Every 5 seconds.
        -   **Trip Updates (Arrivals)**: Every 10 seconds.