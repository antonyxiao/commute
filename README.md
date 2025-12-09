# Commute App

A transit application consisting of a React Native client (Expo) and a Node.js server.

## Project Structure

- **client/**: React Native application (Expo)
- **server/**: Node.js backend using SQLite (gtfs.db) and GTFS data
- **.github/**: GitHub Actions workflows

## Getting Started

### Server

Navigate to the `server` directory:

```bash
cd server
npm install
node index.js
```

### Client

Navigate to the `client` directory:

```bash
cd client
npm install
npx expo start
```
