import { API_BASE_URL } from '../constants/config';

const DEFAULT_TIMEOUT = 15000;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function toGTFSDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

async function request(endpoint, options = {}) {
  const { signal, timeout = DEFAULT_TIMEOUT, query, ...fetchOptions } = options;
  const params = [];
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null) {
      params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  params.push(`ts=${Date.now()}`);
  const url = `${API_BASE_URL}${endpoint}?${params.join('&')}`;

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);

  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'ngrok-skip-browser-warning': 'true',
        ...fetchOptions.headers,
      },
    });

    if (!response.ok) {
      throw new ApiError(`Request failed with status ${response.status}`, response.status);
    }

    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      if (timedOut) throw new ApiError('The server took too long to respond.');
      throw error;
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError('Could not reach the transit server.');
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Fetch stops within a bounding box.
 * @param {{north:number,east:number,south:number,west:number}} bounds
 * @param {{signal?: AbortSignal}} [options]
 */
export function fetchStopsInBounds(bounds, options = {}) {
  return request('/api/stops_in_bounds', {
    ...options,
    query: bounds,
  });
}

/**
 * Fetch arrivals for a stop, optionally for a future date.
 * @param {string} stopId
 * @param {Date|null} date
 * @param {{signal?: AbortSignal}} [options]
 */
export function fetchStopTimes(stopId, date, { after, ...options } = {}) {
  return request(`/api/stop_times/${encodeURIComponent(stopId)}`, {
    ...options,
    query: {
      ...(date ? { date: toGTFSDate(date) } : {}),
      ...(after ? { after } : {}),
    },
  });
}

/**
 * Fetch live vehicle positions for trips serving a stop.
 * @param {string} stopId
 * @param {Date|null} date
 * @param {{signal?: AbortSignal}} [options]
 */
export function fetchVehiclesForStop(stopId, date, options = {}) {
  return request(`/api/vehicles_for_stop/${encodeURIComponent(stopId)}`, {
    ...options,
    query: date ? { date: toGTFSDate(date) } : undefined,
  });
}
