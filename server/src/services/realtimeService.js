const axios = require('axios');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

const rtCache = {
  tripUpdates: { data: null, timestamp: 0 },
  vehiclePositions: { data: null, timestamp: 0 }
};
const CACHE_TTL = 15000; // 15 seconds

/**
 * Fetches data from a URL with caching.
 * @param {string} url - The URL to fetch from.
 * @param {string} cacheKey - The key to store data in the cache.
 * @returns {Promise<ArrayBuffer>} The response data.
 */
async function fetchWithCache(url, cacheKey) {
  const now = Date.now();
  if (rtCache[cacheKey].data && (now - rtCache[cacheKey].timestamp < CACHE_TTL)) {
    return rtCache[cacheKey].data;
  }
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  rtCache[cacheKey] = { data: response.data, timestamp: now };
  return response.data;
}

/**
 * Decodes a GTFS Realtime feed buffer.
 * @param {ArrayBuffer} buffer - The buffer to decode.
 * @returns {Object} The decoded feed message.
 */
function decodeFeed(buffer) {
  return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
}

module.exports = {
  fetchWithCache,
  decodeFeed
};
