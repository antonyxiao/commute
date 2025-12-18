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
