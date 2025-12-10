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

    useEffect(() => {
        let intervalId;

        if (selectedStop) {
            setVehicles([]); // Clear previous vehicles
            
            const fetchData = async (isBackgroundRefresh = false) => {
                if (!isBackgroundRefresh) {
                    setLoading(true);
                    setArrivals([]);
                }

                try {
                    const [arrivalsData, vehiclesData] = await Promise.all([
                        fetchStopTimes(selectedStop.stop_id, selectedDate),
                        fetchVehiclesForStop(selectedStop.stop_id, selectedDate)
                    ]);
                    
                    setArrivals(arrivalsData);
                    if (Array.isArray(vehiclesData)) {
                        setVehicles(vehiclesData);
                    } else {
                        setVehicles([]);
                    }

                } catch (err) {
                    console.error("Error fetching stop details:", err);
                } finally {
                    if (!isBackgroundRefresh) setLoading(false);
                }
            };

            fetchData(false);

            // Poll every 30 seconds if looking at "Now"
            if (!selectedDate) {
                intervalId = setInterval(() => {
                    fetchData(true);
                }, 30000);
            }
        } else {
            setArrivals([]);
            setVehicles([]);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [selectedStop, selectedDate]);

    return { arrivals, vehicles, loading };
}
