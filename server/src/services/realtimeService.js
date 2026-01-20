const axios = require('axios');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

const rtCache = {};
const pendingRequests = {}; // Deduplication for concurrent requests
const CACHE_TTL = 5000; // 5 seconds

/**
 * Fetches data from a URL with caching and request deduplication.
 * Prevents multiple concurrent requests to the same URL.
 * @param {string} url - The URL to fetch from.
 * @param {string} cacheKey - The key to store data in the cache.
 * @returns {Promise<ArrayBuffer>} The response data.
 */
async function fetchWithCache(url, cacheKey) {
  const now = Date.now();

  // Check cache first
  const cached = rtCache[cacheKey];
  if (cached && cached.data && (now - cached.timestamp < CACHE_TTL)) {
    return cached.data;
  }

  // If there's already a pending request for this key, wait for it
  if (pendingRequests[cacheKey]) {
    return pendingRequests[cacheKey];
  }

  // Create new request with deduplication
  pendingRequests[cacheKey] = (async () => {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000 // 10 second timeout
      });
      rtCache[cacheKey] = { data: response.data, timestamp: Date.now() };
      return response.data;
    } finally {
      delete pendingRequests[cacheKey];
    }
  })();

  return pendingRequests[cacheKey];
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