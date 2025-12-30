import { useState, useEffect, useRef } from 'react';
import { fetchStopsInBounds, fetchStopTimes, fetchVehiclesForStop } from '../services/api';

/**
 * Hook to fetch stops based on map bounds.
 * @param {Object} mapBounds - Current map bounds.
 * @returns {Object} { stops, loading }
 */
export function useStops(mapBounds) {
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(false);
  const [debouncedMapBounds, setDebouncedMapBounds] = useState(null);
  const debounceTimeoutRef = useRef(null);

  useEffect(() => {
    if (mapBounds) {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      debounceTimeoutRef.current = setTimeout(() => {
        setDebouncedMapBounds(mapBounds);
      }, 500); 
    }
  }, [mapBounds]);

  useEffect(() => {
    if (debouncedMapBounds) {
      setLoading(true);
      fetchStopsInBounds(debouncedMapBounds)
        .then(data => {
          setStops(data);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLoading(false);
        });
    }
  }, [debouncedMapBounds]);

  return { stops, loading };
}

/**
 * Hook to fetch arrivals and vehicles for a selected stop.
 * @param {Object} selectedStop 
 * @param {Date} selectedDate 
 * @returns {Object} { arrivals, vehicles, arrivalsLoading }
 */
export function useStopDetails(selectedStop, selectedDate) {
    const [arrivals, setArrivals] = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [loading, setLoading] = useState(false);

    // Initial fetch when stop or date changes
    useEffect(() => {
        if (selectedStop) {
            setLoading(true);
            setArrivals([]);
            setVehicles([]);

            Promise.all([
                fetchStopTimes(selectedStop.stop_id, selectedDate),
                fetchVehiclesForStop(selectedStop.stop_id, selectedDate)
            ]).then(([arrivalsData, vehiclesData]) => {
                setArrivals(arrivalsData);
                setVehicles(Array.isArray(vehiclesData) ? vehiclesData : []);
            }).catch(err => {
                console.error("Error fetching stop details:", err);
            }).finally(() => {
                setLoading(false);
            });
        } else {
            setArrivals([]);
            setVehicles([]);
        }
    }, [selectedStop, selectedDate]);

    // Polling for Arrivals (10 seconds)
    useEffect(() => {
        let intervalId;
        if (selectedStop && !selectedDate) {
            intervalId = setInterval(async () => {
                try {
                    const data = await fetchStopTimes(selectedStop.stop_id, null);
                    setArrivals(data);
                } catch (err) {
                    console.error("Error polling arrivals:", err);
                }
            }, 10000);
        }
        return () => clearInterval(intervalId);
    }, [selectedStop, selectedDate]);

    // Polling for Vehicles (5 seconds)
    useEffect(() => {
        let intervalId;
        if (selectedStop && !selectedDate) {
            intervalId = setInterval(async () => {
                try {
                    const data = await fetchVehiclesForStop(selectedStop.stop_id, null);
                    setVehicles(Array.isArray(data) ? data : []);
                } catch (err) {
                    console.error("Error polling vehicles:", err);
                }
            }, 5000);
        }
        return () => clearInterval(intervalId);
    }, [selectedStop, selectedDate]);

    return { arrivals, vehicles, loading };
}
