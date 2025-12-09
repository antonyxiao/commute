import './global.css';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import Map from './components/Map';
import StopCard from './components/StopCard';

// -----------------------------------------------------------------------------
// MOBILE ACCESS CONFIGURATION (WSL2 / Tunnel)
// -----------------------------------------------------------------------------
// 1. Run this command in a separate terminal to expose your API:
//    npx ngrok http 3000
// 2. Copy the 'Forwarding' URL (e.g., https://abcd-123.ngrok-free.app) below.
// -----------------------------------------------------------------------------
const TUNNEL_URL = 'https://clint-extemporal-unmatrimonially.ngrok-free.dev'; // <--- PASTE YOUR NGROK URL HERE (e.g., 'https://...')

let API_BASE_URL = 'http://localhost:3000'; // Default for Desktop/Web

if (TUNNEL_URL) {
  API_BASE_URL = TUNNEL_URL;
} else if (Platform.OS === 'web' && typeof window !== 'undefined') {
  API_BASE_URL = `http://${window.location.hostname}:3000`;
}

export default function App() {

  const [stops, setStops] = useState([]);

  const [loading, setLoading] = useState(true);

  const [selectedStop, setSelectedStop] = useState(null);

  const [arrivals, setArrivals] = useState([]);
  const [vehicles, setVehicles] = useState([]);

  const [arrivalsLoading, setArrivalsLoading] = useState(false);

  const [mapBounds, setMapBounds] = useState(null);

  const [debouncedMapBounds, setDebouncedMapBounds] = useState(null);

  const [selectedDate, setSelectedDate] = useState(null);
  const [isStopCardCollapsed, setIsStopCardCollapsed] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);


  const debounceTimeoutRef = useRef(null);



  useEffect(() => {

    if (mapBounds) {

      if (debounceTimeoutRef.current) {

        clearTimeout(debounceTimeoutRef.current);

      }

      debounceTimeoutRef.current = setTimeout(() => {

        setDebouncedMapBounds(mapBounds);

      }, 500); // 500ms debounce

    }

  }, [mapBounds]);



  useEffect(() => {

    if (debouncedMapBounds) {

      setLoading(true);

      const { north, east, south, west } = debouncedMapBounds;

      const API_URL = `${API_BASE_URL}/api/stops_in_bounds?north=${north}&east=${east}&south=${south}&west=${west}`;



      fetch(API_URL, {
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
      })
        .then(res => res.json())
        .then(data => {

          setStops(data);

          setLoading(false);

        })

        .catch(err => {

          console.error('Error fetching stops:', err);

          setLoading(false);

        });

    } else {

      setLoading(false); // If no bounds, then no stops to load.

    }

  }, [debouncedMapBounds]);



  useEffect(() => {
    let intervalId;

    if (selectedStop) {
      setVehicles([]); // Clear previous vehicles

      const fetchArrivals = (isBackgroundRefresh = false) => {
        if (!isBackgroundRefresh) {
          setArrivalsLoading(true);
          setArrivals([]); 
        }

        const queryParams = [];
        if (selectedDate) {
           const y = selectedDate.getFullYear();
           const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
           const d = String(selectedDate.getDate()).padStart(2, '0');
           queryParams.push(`date=${y}${m}${d}`);
        }
        queryParams.push(`ts=${Date.now()}`); // Cache buster

        const queryString = queryParams.length ? `?${queryParams.join('&')}` : '';

        console.log(`Fetching arrivals for stop ${selectedStop.stop_id} (background: ${isBackgroundRefresh})`);

        fetch(`${API_BASE_URL}/api/stop_times/${selectedStop.stop_id}${queryString}`, {
          headers: { 'ngrok-skip-browser-warning': 'true' },
        })
          .then(res => res.json())
          .then(data => {
            console.log(`Received ${data.length} arrivals`);
            setArrivals(data);
            if (!isBackgroundRefresh) setArrivalsLoading(false);
          })
          .catch(err => {
            console.error('Error fetching arrivals:', err);
            if (!isBackgroundRefresh) setArrivalsLoading(false);
          });
      };

      const fetchVehicles = () => {
        const queryParams = [];
        if (selectedDate) {
           const y = selectedDate.getFullYear();
           const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
           const d = String(selectedDate.getDate()).padStart(2, '0');
           queryParams.push(`date=${y}${m}${d}`);
        }
        queryParams.push(`ts=${Date.now()}`); // Cache buster

        const queryString = queryParams.length ? `?${queryParams.join('&')}` : '';

        fetch(`${API_BASE_URL}/api/vehicles_for_stop/${selectedStop.stop_id}${queryString}`, {
            headers: { 'ngrok-skip-browser-warning': 'true' },
        })
        .then(res => {
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            return res.json();
        })
        .then(data => {
            if (Array.isArray(data)) {
                setVehicles(data);
            } else {
                console.error("Vehicles data is not an array:", data);
                setVehicles([]);
            }
        })
        .catch(err => {
            console.error('Error fetching vehicles:', err);
            setVehicles([]);
        });
      };

      const fetchData = (isBackground = false) => {
          fetchArrivals(isBackground);
          fetchVehicles();
      };

      // Initial fetch
      fetchData(false);

      // Set up polling
      if (!selectedDate) {
        console.log('Setting up polling interval for stop', selectedStop.stop_id);
        intervalId = setInterval(() => {
          console.log('Polling data...');
          fetchData(true);
        }, 30000); 
      }
    } else {
        setVehicles([]); // Clear if no stop selected
        setSelectedVehicle(null);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [selectedStop, selectedDate]);



  const handleStopSelect = (stop) => {

    setSelectedStop(stop);
    setSelectedVehicle(null);

    setSelectedDate(null); // Reset to "Now" when selecting a new stop

  };

  const handleArrivalPress = (arrival) => {
      const vehicle = vehicles.find(v => v.trip_id === arrival.trip_id);
      if (vehicle) {
          console.log("Selecting vehicle:", vehicle.id);
          setSelectedVehicle(vehicle);
      }
  };



  const handleCloseCard = () => {

    setSelectedStop(null);
    setSelectedVehicle(null);

    setArrivals([]);

    setSelectedDate(null);

  };



  const handleViewportChanged = useCallback((bounds) => {

    setMapBounds(bounds);

  }, []);



  return (
    <SafeAreaProvider>
      <SafeAreaView className="flex-1 bg-white" edges={['top', 'left', 'right']}>
        <StatusBar style="auto" />

        <View className="flex-1 w-full h-full relative">

          <Map 
            stops={stops} 
            selectedStop={selectedStop}
            vehicles={vehicles}
            selectedVehicle={selectedVehicle}
            onStopSelect={handleStopSelect} 
            onViewportChanged={handleViewportChanged} 
            isStopCardCollapsed={isStopCardCollapsed}
          />

          {loading && (

            <View className="absolute top-4 left-0 right-0 items-center justify-center z-[1000] pointer-events-none">

              <View className="bg-white/90 px-4 py-2 rounded-full shadow-lg flex-row items-center border border-gray-200">

                <ActivityIndicator size="small" color="#3B82F6" />

                <Text className="ml-2 text-gray-700 font-medium text-sm">Loading stops...</Text>

              </View>

            </View>

          )}

          {selectedStop && (

                      <StopCard 

                        stop={selectedStop} 

                        arrivals={arrivals} 
                        
                        vehicles={vehicles}

                        loading={arrivalsLoading}

                        onClose={handleCloseCard}
                        
                        onArrivalPress={handleArrivalPress}

                        selectedDate={selectedDate}

                        onDateChange={setSelectedDate}
                        isCollapsed={isStopCardCollapsed}
                        setIsCollapsed={setIsStopCardCollapsed}
                      />

          )}

        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );

}