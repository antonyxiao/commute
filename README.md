# Transit App

A full-stack transit application providing real-time bus schedules and vehicle locations for Victoria, BC.

## Project Structure

This project is a monorepo containing:
- `client/`: A React Native (Expo) application for the frontend.
- `server/`: A Node.js (Express) server with SQLite for the backend.

## Prerequisites

- Node.js (v14+)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)

## Getting Started

### Backend (Server)

1. Navigate to the server directory:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Import GTFS data (initial setup):
   ```bash
   node import-gtfs.js
   ```
   *Note: Ensure you have `config.json` configured correctly.*

4. Start the server:
   ```bash
   npm start
   ```
   The server runs on `http://localhost:3000`.

### Frontend (Client)

1. Navigate to the client directory:
   ```bash
   cd client
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the application:
   ```bash
   npx expo start
   ```
   *Note: For web support, press `w` in the terminal.*

## Architecture

### Server
- **Modular Design**: Separated into controllers, routes, services, and utils.
- **Database**: SQLite used for storing static GTFS data.
- **Real-time**: Fetches GTFS-Realtime (TripUpdates, VehiclePositions) and caches it.

### Client
- **React Native**: Built with Expo for cross-platform support.
- **Leaflet Maps**: Uses `react-leaflet` for web map rendering.
- **Custom Hooks**: `useStops`, `useStopDetails` for clean data fetching.

## Key Features
- **Map View**: Interactive map showing bus stops and live vehicle positions.
- **Stop Details**: View scheduled and real-time arrivals for selected stops.
- **Date Selection**: View schedules for future dates.
- **Vehicle Tracking**: Click on an arrival to see the specific vehicle on the map.
