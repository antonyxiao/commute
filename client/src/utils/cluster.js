/**
 * Lightweight grid clustering for map stops. Avoids rendering hundreds of
 * individual markers when zoomed out, without pulling in another dependency.
 */
export function clusterStops(stops, region, cells = 8) {
  if (!Array.isArray(stops) || stops.length === 0 || !region) return [];

  const latitudeDelta = region.latitudeDelta || 0.02;
  const longitudeDelta = region.longitudeDelta || latitudeDelta;
  const cellLat = latitudeDelta / cells;
  const cellLon = longitudeDelta / cells;
  const south = region.latitude - latitudeDelta / 2;
  const west = region.longitude - longitudeDelta / 2;

  const grid = new Map();

  for (const stop of stops) {
    const latitude = Number(stop.stop_lat);
    const longitude = Number(stop.stop_lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    const x = Math.floor((longitude - west) / cellLon);
    const y = Math.floor((latitude - south) / cellLat);
    const key = `${x}:${y}`;

    let cell = grid.get(key);
    if (!cell) {
      cell = { key, count: 0, latSum: 0, lonSum: 0, stops: [] };
      grid.set(key, cell);
    }
    cell.count += 1;
    cell.latSum += latitude;
    cell.lonSum += longitude;
    cell.stops.push(stop);
  }

  return [...grid.values()].map((cell) => {
    if (cell.count === 1) {
      const stop = cell.stops[0];
      return {
        key: cell.key,
        count: 1,
        latitude: Number(stop.stop_lat),
        longitude: Number(stop.stop_lon),
        stop,
        stops: cell.stops,
      };
    }

    return {
      key: cell.key,
      count: cell.count,
      latitude: cell.latSum / cell.count,
      longitude: cell.lonSum / cell.count,
      stop: null,
      stops: cell.stops,
    };
  });
}

export function regionToBounds(region) {
  const latitudeDelta = region.latitudeDelta || 0;
  const longitudeDelta = region.longitudeDelta || latitudeDelta;
  return {
    north: region.latitude + latitudeDelta / 2,
    south: region.latitude - latitudeDelta / 2,
    east: region.longitude + longitudeDelta / 2,
    west: region.longitude - longitudeDelta / 2,
  };
}

/** Great-circle distance in metres. */
export function distanceMeters(a, b) {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
