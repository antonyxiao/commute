import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { fetchStopsInBounds, fetchStopTimes, fetchVehiclesForStop } from '../services/api';
import { POLL_INTERVALS } from '../constants/config';

/** Tracks whether the app is in the foreground so polling can pause. */
export function useAppActive() {
  const [active, setActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  return active;
}

/** Re-renders on an interval so countdowns stay fresh. */
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

function stopsBounds(bounds) {
  if (!bounds) return null;
  const { north, east, south, west } = bounds;
  if (![north, east, south, west].every((value) => Number.isFinite(value))) return null;
  return { north, east, south, west };
}

/**
 * Fetches transit stops for the visible map area, with debouncing,
 * cancellation of stale requests, and an error state for the UI.
 */
export function useStops(mapBounds) {
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [debouncedBounds, setDebouncedBounds] = useState(null);

  const abortRef = useRef(null);
  const sequenceRef = useRef(0);

  const bounds = stopsBounds(mapBounds);

  useEffect(() => {
    if (!bounds) return undefined;
    const id = setTimeout(() => setDebouncedBounds(bounds), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds?.north, bounds?.east, bounds?.south, bounds?.west]);

  const load = useCallback(async (target, { silent = false } = {}) => {
    if (!target) return;

    const sequence = ++sequenceRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(!silent);
    setError(null);

    try {
      const data = await fetchStopsInBounds(target, { signal: controller.signal });
      if (sequence !== sequenceRef.current) return;
      setStops(Array.isArray(data) ? data : []);
      setLastUpdated(Date.now());
    } catch (err) {
      if (err?.name === 'AbortError' || sequence !== sequenceRef.current) return;
      setError(err?.message || 'Unable to load stops.');
    } finally {
      if (sequence === sequenceRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debouncedBounds) load(debouncedBounds);
  }, [debouncedBounds, load]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const refresh = useCallback(() => {
    load(debouncedBounds, { silent: true });
  }, [debouncedBounds, load]);

  return { stops, loading, error, lastUpdated, refresh };
}

/**
 * Arrivals + vehicles for a selected stop. Realtime data is polled only for
 * today's schedule and only while the app is in the foreground.
 */
export function useStopDetails(selectedStop, selectedDate, selectedTime) {
  const stopId = selectedStop?.stop_id;
  const date = selectedDate || null;
  const after = selectedTime || null;
  const isToday = date === null;
  const appActive = useAppActive();

  const [arrivals, setArrivals] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!stopId) {
      setArrivals([]);
      setVehicles([]);
      setError(null);
      setLastUpdated(null);
      return undefined;
    }

    let cancelled = false;
    const arrivalsController = new AbortController();
    const vehiclesController = new AbortController();

    setArrivals([]);
    setVehicles([]);
    setError(null);
    setLoading(true);

    const requests = [
      fetchStopTimes(stopId, date, { signal: arrivalsController.signal, after }).then((data) => {
        if (!cancelled) setArrivals(Array.isArray(data) ? data : []);
      }),
      fetchVehiclesForStop(stopId, date, { signal: vehiclesController.signal }).then((data) => {
        if (!cancelled) setVehicles(Array.isArray(data) ? data : []);
      }),
    ];

    Promise.allSettled(requests).then((results) => {
      if (cancelled) return;
      const failure = results.find((result) => result.status === 'rejected');
      setError(failure ? failure.reason?.message || 'Unable to load this stop.' : null);
      setLastUpdated(Date.now());
      setLoading(false);
    });

    return () => {
      cancelled = true;
      arrivalsController.abort();
      vehiclesController.abort();
    };
  }, [stopId, date, after]);

  // Poll realtime data (today only, foreground only)
  useEffect(() => {
    if (!stopId || !isToday || !appActive) return undefined;

    const controller = new AbortController();
    let disposed = false;

    const pollArrivals = async () => {
      try {
        const data = await fetchStopTimes(stopId, null, {
          signal: controller.signal,
          after,
        });
        if (disposed) return;
        setArrivals(Array.isArray(data) ? data : []);
        setLastUpdated(Date.now());
        setError(null);
      } catch (err) {
        if (err?.name !== 'AbortError') console.warn('Arrivals poll failed:', err.message);
      }
    };

    const pollVehicles = async () => {
      try {
        const data = await fetchVehiclesForStop(stopId, null, { signal: controller.signal });
        if (disposed) return;
        setVehicles(Array.isArray(data) ? data : []);
      } catch (err) {
        if (err?.name !== 'AbortError') console.warn('Vehicles poll failed:', err.message);
      }
    };

    const arrivalsInterval = setInterval(pollArrivals, POLL_INTERVALS.arrivals);
    const vehiclesInterval = setInterval(pollVehicles, POLL_INTERVALS.vehicles);

    return () => {
      disposed = true;
      clearInterval(arrivalsInterval);
      clearInterval(vehiclesInterval);
      controller.abort();
    };
  }, [stopId, isToday, appActive, after]);

  const refetch = useCallback(async () => {
    if (!stopId) return;
    setRefreshing(true);
    setError(null);

    const results = await Promise.allSettled([
      fetchStopTimes(stopId, date, { after }),
      fetchVehiclesForStop(stopId, date),
    ]);

    if (!mountedRef.current) return;

    const [arrivalsResult, vehiclesResult] = results;
    if (arrivalsResult.status === 'fulfilled') {
      setArrivals(Array.isArray(arrivalsResult.value) ? arrivalsResult.value : []);
    }
    if (vehiclesResult.status === 'fulfilled') {
      setVehicles(Array.isArray(vehiclesResult.value) ? vehiclesResult.value : []);
    }

    const failure = results.find((result) => result.status === 'rejected');
    setError(failure ? failure.reason?.message || 'Unable to refresh.' : null);
    setLastUpdated(Date.now());
    setRefreshing(false);
  }, [stopId, date, after]);

  return { arrivals, vehicles, loading, refreshing, error, lastUpdated, refetch };
}
