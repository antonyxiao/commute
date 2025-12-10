import React, { useEffect, useState } from 'react';
import { View, Text, Platform, TouchableOpacity } from 'react-native';

let MapContainer, TileLayer, Marker, CircleMarker, Popup, useMapEvents, busStopIcon, selectedBusStopIcon, userLocationIcon;
if (Platform.OS === 'web') {
  const RL = require('react-leaflet');
  MapContainer = RL.MapContainer;
  TileLayer = RL.TileLayer;
  Marker = RL.Marker;
  CircleMarker = RL.CircleMarker;
  Popup = RL.Popup;
  useMapEvents = RL.useMapEvents;
  
  // Fix for Leaflet icon issues in Webpack/Expo
  const L = require('leaflet');
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
    iconUrl: require('leaflet/dist/images/marker-icon.png'),
    shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
  });

  // Green Square Icon for Bus Stops
  const busStopIconSvgBase64 = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAzMCAzMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB4PSIyIiB5PSIyIiB3aWR0aD0iMjYiIGhlaWdodD0iMjYiIHJ4PSI0IiBmaWxsPSIjMTBCOTgxIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMiIvPjwvc3ZnPg==';
  busStopIcon = new L.Icon({
    iconUrl: busStopIconSvgBase64,
    iconSize: [15, 15], 
    iconAnchor: [7.5, 7.5], 
    popupAnchor: [0, -7.5]
  });

  // Red Square Icon for Selected Bus Stop
  const selectedStopIconSvgBase64 = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAzMCAzMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB4PSIyIiB5PSIyIiB3aWR0aD0iMjYiIGhlaWdodD0iMjYiIHJ4PSI0IiBmaWxsPSIjRUY0NDQ0IiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMiIvPjwvc3ZnPg==';
  selectedBusStopIcon = new L.Icon({
    iconUrl: selectedStopIconSvgBase64,
    iconSize: [15, 15],
    iconAnchor: [7.5, 7.5],
    popupAnchor: [0, -7.5]
  });

  // Blue Circle Icon for User Location
  const userLocationIconSvgBase64 = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMCIgY3k9IjEwIiByPSI4IiBmaWxsPSIjM0I4MkY2IiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiLz48L3N2Zz4=';
  userLocationIcon = new L.Icon({
    iconUrl: userLocationIconSvgBase64,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    popupAnchor: [0, -6]
  });
}

const EXPANDED_STOP_CARD_HEIGHT = 400;
const COLLAPSED_STOP_CARD_HEIGHT = 60;

function LocationMarker({ isMapCardActive, isMapCardCollapsed, flyToLocation }) {
  const [position, setPosition] = useState(null);
  
  const map = useMapEvents({
    locationfound(e) {
      console.log("Location found:", e.latlng);
      setPosition(e.latlng);
      flyToLocation(e.latlng, map, isMapCardActive, isMapCardCollapsed, 17);
    },
    locationerror(e) {
      // Suppress noisy errors for position unavailable (often happens in dev/without GPS)
      if (e.code === 1) {
          console.warn("Location permission denied.");
      } else {
          console.log("Location check failed (unavailable or timeout). Silent retry.");
      }
      
      // Retry once with lower accuracy requirements if high accuracy fails
      // Note: We use a flag or check to prevent infinite loops if retry also fails, 
      // but for now we just fire one single retry.
      // We strictly avoid re-triggering 'locate' endlessly.
      map.locate({ maxZoom: 16, enableHighAccuracy: false });
    }
  });

  useEffect(() => {
    // Request location ONLY once on mount
    console.log("Requesting initial location...");
    map.locate({ enableHighAccuracy: true });
  }, [map]);

  return position === null ? null : (
    <Marker position={position} icon={userLocationIcon}>
    </Marker>
  );
}

function MapEventsHandler({ onViewportChanged, onMapReady }) {
  const map = useMapEvents({
    moveend: () => {
      if (onViewportChanged) {
        const bounds = map.getBounds();
        onViewportChanged({
          north: bounds.getNorth(),
          east: bounds.getEast(),
          south: bounds.getSouth(),
          west: bounds.getWest(),
        });
      }
    },
    zoomend: () => {
      if (onViewportChanged) {
        const bounds = map.getBounds();
        onViewportChanged({
          north: bounds.getNorth(),
          east: bounds.getEast(),
          south: bounds.getSouth(),
          west: bounds.getWest(),
        });
      }
    },
  });

  useEffect(() => {
    if (onMapReady) {
      onMapReady(map);
      // Trigger initial bounds
      if (onViewportChanged) {
          const bounds = map.getBounds();
          onViewportChanged({
            north: bounds.getNorth(),
            east: bounds.getEast(),
            south: bounds.getSouth(),
            west: bounds.getWest(),
          });
      }
    }
  }, [map, onMapReady]); // Ensure this only runs when map instance is ready

  return null;
}

export default function Map({ stops, selectedStop, vehicles, selectedVehicle, onStopSelect, onViewportChanged, isStopCardCollapsed }) {
  const [mapInstance, setMapInstance] = useState(null);

  if (Platform.OS !== 'web') {
    return (
      <View className="flex-1 items-center justify-center bg-gray-100">
        <Text className="text-red-500 font-bold">Map is only supported on Web with react-leaflet.</Text>
      </View>
    );
  }

  // Helper function for centering the map with an offset
  const flyToLocation = React.useCallback((latlng, map, isMapCardActive, isMapCardCollapsed, zoom = 17) => {
    if (!map) return;

    const currentZoom = map.getZoom();
    const targetZoom = Math.max(currentZoom, zoom);

    if (isMapCardActive) {
      const height = isMapCardCollapsed ? COLLAPSED_STOP_CARD_HEIGHT : EXPANDED_STOP_CARD_HEIGHT;
      const offset = height / 2; 
      const point = map.project(latlng, targetZoom);
      const targetPoint = point.add([0, offset]);
      const targetLatLng = map.unproject(targetPoint, targetZoom);
      map.flyTo(targetLatLng, targetZoom);
    } else {
      map.flyTo(latlng, targetZoom);
    }
  }, []);

  useEffect(() => {
    if (selectedStop && mapInstance) {
      flyToLocation([selectedStop.stop_lat, selectedStop.stop_lon], mapInstance, !!selectedStop, isStopCardCollapsed, 16);
    }
  }, [selectedStop, mapInstance, flyToLocation, isStopCardCollapsed]);

  // Effect to fly to selected vehicle
  useEffect(() => {
    if (selectedVehicle && mapInstance) {
        flyToLocation([selectedVehicle.lat, selectedVehicle.lon], mapInstance, !!selectedStop, isStopCardCollapsed, 16);
    }
  }, [selectedVehicle, mapInstance, flyToLocation, isStopCardCollapsed, selectedStop]);

  // Victoria BC coordinates
  const position = [48.4284, -123.3656];

  // Memoize markers to prevent unnecessary re-renders of the entire marker list
  const markers = React.useMemo(() => {
    if (!stops) return null;
    return stops.map(stop => {
      const isSelected = selectedStop && selectedStop.stop_id === stop.stop_id;
      return (
        <React.Fragment key={stop.stop_id}>
            {/* Visual Marker (Non-interactive) */}
            <CircleMarker 
              center={[stop.stop_lat, stop.stop_lon]}
              radius={isSelected ? 8 : 6}
              pathOptions={{
                fillColor: isSelected ? '#EF4444' : '#10B981',
                color: 'white',
                weight: 2,
                fillOpacity: 1,
                interactive: false
              }}
            />
            {/* Invisible Hit Target (Interactive) */}
            <CircleMarker 
              center={[stop.stop_lat, stop.stop_lon]}
              radius={20}
              pathOptions={{
                stroke: false,
                fillOpacity: 0,
                interactive: true
              }}
              eventHandlers={{
                click: () => {
                  if (onStopSelect) onStopSelect(stop);
                },
              }}
            />
        </React.Fragment>
      );
    });
  }, [stops, selectedStop, onStopSelect]);

  // Memoize vehicle markers
  const vehicleMarkers = React.useMemo(() => {
      // Ensure vehicles is an array before mapping
      const vehicleList = Array.isArray(vehicles) ? vehicles : [];
      if (vehicleList.length === 0) return null;

      return vehicleList.map(v => {
          const L = require('leaflet');
          const icon = new L.DivIcon({
              className: '', // Remove default leaflet-div-icon styles
              html: `<div style="background-color: #${v.route_color}; color: #${v.route_text_color}; width: 24px; height: 24px; display: flex; justify-content: center; align-items: center; border-radius: 4px; font-weight: bold; font-size: 12px; border: 1px solid white;">${v.route_short_name}</div>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12]
          });

          return (
              <Marker 
                key={v.id} 
                position={[v.lat, v.lon]} 
                icon={icon}
                zIndexOffset={1000} 
              />
          );
      });
  }, [vehicles]);

  const handleFindClosestStop = () => {
    if (!mapInstance || !stops || stops.length === 0) return;

    // Use .once to avoid accumulating listeners
    mapInstance.once('locationfound', (e) => {
        const userLocation = e.latlng;
        let closestStop = null;
        let minDistance = Infinity;

        stops.forEach(stop => {
            const stopLatLng = { lat: stop.stop_lat, lng: stop.stop_lon };
            const dist = mapInstance.distance(userLocation, stopLatLng);
            if (dist < minDistance) {
                minDistance = dist;
                closestStop = stop;
            }
        });

        if (closestStop) {
            if (onStopSelect) onStopSelect(closestStop);
        }
    });
    
    mapInstance.locate({ enableHighAccuracy: true });
  };

  return (
    <View className="flex-1 w-full h-full relative">
      <link 
        rel="stylesheet" 
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" 
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" 
        crossOrigin="" 
      />
      <MapContainer center={position} zoom={13} style={{ height: '100vh', width: '100%' }} preferCanvas={true}>

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationMarker 
            isMapCardActive={!!selectedStop} 
            isMapCardCollapsed={isStopCardCollapsed}
            flyToLocation={flyToLocation} 
        />
        <MapEventsHandler onViewportChanged={onViewportChanged} onMapReady={setMapInstance} />
        {markers}
        {vehicleMarkers}
      </MapContainer>
      
      {/* Locate Me Button */}
      <TouchableOpacity
        className="absolute top-4 right-4 bg-white p-2 rounded shadow-md z-[1000] border border-gray-300"
        onPress={() => {
           if (mapInstance) {
             console.log("Manual location request triggered");
             mapInstance.locate({ enableHighAccuracy: true })
                .on('locationfound', (e) => {
                    flyToLocation(e.latlng, mapInstance, !!selectedStop, isStopCardCollapsed);
                })
                .on('locationerror', (e) => {
                    console.warn("Manual Location access denied or failed:", e.message);
                });
           }
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
          <circle cx="12" cy="12" r="3" fill="#3B82F6"/>
        </svg>
      </TouchableOpacity>

      {/* Find Closest Stop Button */}
      <TouchableOpacity
        className="absolute top-16 right-4 bg-white p-2 rounded shadow-md z-[1000] border border-gray-300 mt-2"
        onPress={handleFindClosestStop}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="3" width="22" height="15" rx="2" ry="2"></rect>
          <path d="M6 18v3"></path>
          <path d="M18 18v3"></path>
          <path d="M10 11h4"></path>
          <path d="M12 11v-3"></path>
        </svg>
      </TouchableOpacity>
    </View>
  );
}