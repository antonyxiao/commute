import './global.css';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useCallback } from 'react';
import Map from './src/components/Map';
import StopCard from './src/components/StopCard';
import { useStops, useStopDetails } from './src/hooks/useTransitData';

export default function App() {
  const [mapBounds, setMapBounds] = useState(null);
  const [selectedStop, setSelectedStop] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [isStopCardCollapsed, setIsStopCardCollapsed] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  // Custom Hooks
  const { stops, loading: stopsLoading } = useStops(mapBounds);
  const { arrivals, vehicles, loading: arrivalsLoading } = useStopDetails(selectedStop, selectedDate);

  const handleStopSelect = (stop) => {
    setSelectedStop(stop);
    setSelectedVehicle(null);
    setSelectedDate(null); 
  };

  const handleArrivalPress = (arrival) => {
      const vehicle = vehicles.find(v => v.trip_id === arrival.trip_id);
      if (vehicle) {
          setSelectedVehicle(vehicle);
      }
  };

  const handleCloseCard = () => {
    setSelectedStop(null);
    setSelectedVehicle(null);
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

          {stopsLoading && (
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
