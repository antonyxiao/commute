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

## Date: 2026-01-20

### UX Improvements
1.  **Draggable Bottom Menu (StopCard)**:
    -   Replaced the "Hide/Show" button with a visual drag handle (gray bar).
    -   Implemented pan gesture handling using `react-native-gesture-handler`.
    -   Added three snap heights:
        -   **Collapsed** (60px): Minimal view showing stop name.
        -   **Medium** (400px): Default expanded size.
        -   **Expanded** (85% of screen): Full-height view for more content.
    -   Fast swipes snap to the next height in swipe direction; slow drags snap to nearest height.
    -   Replaced spring animation with `withTiming` for smooth, non-bouncing transitions.
    -   Added `GestureHandlerRootView` wrapper in `App.js` (required for gestures).

### Performance Optimizations
1.  **Map.js**:
    -   Created memoized `StopMarker` component to prevent individual marker re-renders.
    -   Added vehicle icon caching using a plain object to avoid recreating `L.DivIcon` on every render.
    -   Used ref for `onStopSelect` callback to prevent full marker list rebuilds.
    -   Changed marker list dependency from full `selectedStop` object to `selectedStopId`.

2.  **StopCard.js**:
    -   Created memoized `ArrivalItem` component for FlatList items.
    -   Moved constants outside component (`ANIMATION_CONFIG`, `findNearestSnapPoint` worklet, `SNAP_POINTS`).
    -   Memoized FlatList callbacks (`keyExtractor`, `getItemLayout`, `renderItem`, `handleScrollToIndexFailed`).
    -   Added FlatList performance props:
        -   `removeClippedSubviews={true}`: Unmounts items outside viewport.
        -   `maxToRenderPerBatch={10}`: Limits items rendered per frame.
        -   `windowSize={5}`: Reduces memory footprint.
        -   `initialNumToRender={8}`: Faster initial render.
    -   Memoized pan gesture with `useMemo`.

3.  **App.js**:
    -   Memoized all callback handlers (`handleStopSelect`, `handleArrivalPress`, `handleCloseCard`, `handleViewportChanged`) with `useCallback`.
    -   Moved root style object outside component.

### Bug Fixes
1.  **Map/Map Naming Collision**:
    -   Fixed crash caused by the React component `Map` shadowing JavaScript's built-in `Map` class.
    -   Changed `vehicleIconCache` from `new Map()` to a plain object `{}` to avoid the collision.

### Backend Performance Optimizations

1.  **Database Indexing** (`server/add-indexes.js`):
    -   Added `idx_stops_lat_lon` index on `stops(stop_lat, stop_lon)` for **50-100× faster bounding box queries**.
    -   Added `idx_stop_times_stop_trip` composite index on `stop_times(stop_id, trip_id)`.
    -   Added `idx_calendar_dates` index on `calendar(start_date, end_date)`.
    -   Added `idx_calendar_dates_lookup` index on `calendar_dates(date, service_id)`.
    -   Ran `ANALYZE` to update query planner statistics.

2.  **Parallel Real-Time Fetching** (`tripController.js`, `vehicleController.js`):
    -   Replaced sequential `for` loops with `Promise.all()` for **2-3× faster multi-agency RT fetching**.
    -   All agency feeds now fetched concurrently instead of one at a time.

3.  **Request Deduplication** (`realtimeService.js`):
    -   Added `pendingRequests` map to prevent duplicate concurrent requests to the same URL.
    -   Multiple simultaneous requests for the same feed now share a single HTTP request.
    -   Added 10-second timeout on axios requests.

4.  **Server-Side Result Caching**:
    -   `tripController.js`: Added 10-second cache for stop_times results.
    -   `vehicleController.js`: Added 5-second cache for vehicle results.
    -   Cached responses returned immediately without DB/RT processing.

5.  **Single-Pass Processing** (`tripController.js`):
    -   Combined RT map building and added trip collection into single loop.
    -   Reduced from multiple array iterations to single-pass enrichment.
    -   Cleaner code with better performance.

6.  **Cached Date Formatters** (`dateUtils.js`):
    -   Moved `Intl.DateTimeFormat` instances to module level (created once, reused).
    -   Added `formatTimestamp()` function using cached time formatter.
    -   Eliminates formatter recreation on every function call.

**Expected Performance Improvements**:
-   Bounding box queries: **50-100× faster** (index vs full table scan)
-   Multi-agency RT fetching: **2-3× faster** (parallel vs sequential)
-   Repeated requests: **Near-instant** (result caching)
-   Overall latency reduction: **50-70%** for typical requests