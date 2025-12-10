import { API_BASE_URL } from '../constants/config';

/**
 * Generic fetch wrapper to handle errors and headers.
 * @param {string} endpoint - The API endpoint (e.g., '/api/stops').
 * @param {Object} options - Fetch options.
 * @returns {Promise<any>} The response data.
 */
async function fetchApi(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    'ngrok-skip-browser-warning': 'true',
    ...options.headers,
  };

  try {
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Fetch error for ${endpoint}:`, error);
    throw error;
  }
}

/**
 * Fetch stops within a bounding box.
 * @param {Object} bounds - { north, east, south, west }
 */
export async function fetchStopsInBounds(bounds) {
  const { north, east, south, west } = bounds;
  return fetchApi(`/api/stops_in_bounds?north=${north}&east=${east}&south=${south}&west=${west}`);
}

/**
 * Fetch stop times for a specific stop.
 * @param {string} stopId 
 * @param {Date} [date] 
 * @returns {Promise<Array>}
 */
export async function fetchStopTimes(stopId, date) {
    const queryParams = [];
    if (date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        queryParams.push(`date=${y}${m}${d}`);
    }
    queryParams.push(`ts=${Date.now()}`); // Cache buster
    const queryString = queryParams.length ? `?${queryParams.join('&')}` : '';
    
    return fetchApi(`/api/stop_times/${stopId}${queryString}`);
}

/**
 * Fetch vehicles for a specific stop.
 * @param {string} stopId 
 * @param {Date} [date] 
 * @returns {Promise<Array>}
 */
export async function fetchVehiclesForStop(stopId, date) {
    const queryParams = [];
    if (date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        queryParams.push(`date=${y}${m}${d}`);
    }
    queryParams.push(`ts=${Date.now()}`); // Cache buster
    const queryString = queryParams.length ? `?${queryParams.join('&')}` : '';

    return fetchApi(`/api/vehicles_for_stop/${stopId}${queryString}`);
}
