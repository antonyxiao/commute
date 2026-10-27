const axios = require('axios');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
const { TtlCache } = require('../utils/ttlCache');

const CACHE_TTL = 5000; // 5 seconds
const cache = new TtlCache({ ttl: CACHE_TTL, max: 20 });
const pendingRequests = new Map();

/**
 * Fetches data from a URL with caching and request deduplication.
 * Concurrent requests for the same key share a single HTTP request.
 * @param {string} url
 * @param {string} cacheKey
 * @returns {Promise<Buffer>}
 */
async function fetchWithCache(url, cacheKey) {
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey);
  }

  const request = (async () => {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: { 'User-Agent': 'commute-transit/1.0' },
      });
      cache.set(cacheKey, response.data);
      return response.data;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, request);
  return request;
}

/**
 * Decodes a GTFS Realtime feed buffer.
 * @param {ArrayBuffer|Buffer} buffer
 * @returns {Object}
 */
function decodeFeed(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(bytes);
}

module.exports = {
  fetchWithCache,
  decodeFeed,
};
