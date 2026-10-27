import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import IconButton from './ui/IconButton';
import { MAP_TILES, useTheme } from '../constants/theme';
import { normalizeColor } from '../utils/format';
import { congestionLabel, occupancyLabel, speedKmh } from '../utils/gtfsEnums';
import { distanceMeters } from '../utils/cluster';

const VICTORIA = [48.4284, -123.3656];

// Fix for Leaflet icon issues in Webpack/Expo
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

const userLocationIconSvg = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMCIgY3k9IjEwIiByPSI4IiBmaWxsPSIjM0I4MkY2IiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiLz48L3N2Zz4=';
const userLocationIcon = new L.Icon({
  iconUrl: userLocationIconSvg,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const vehicleIconCache = {};

function leafletThemeCss(colors, isDark) {
  const shadow = isDark ? 'rgba(0,0,0,0.55)' : 'rgba(15,23,42,0.18)';
  return `
    .leaflet-container { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: ${colors.background}; }
    .leaflet-control-attribution { display: none !important; }
    .leaflet-bar { border: none !important; box-shadow: 0 4px 14px ${shadow}; border-radius: 12px; overflow: hidden; }
    .leaflet-bar a { background: ${colors.surface} !important; color: ${colors.text} !important; border-bottom: 1px solid ${colors.border} !important; width: 36px !important; height: 36px !important; line-height: 36px !important; }
    .leaflet-bar a:hover { background: ${colors.surfaceAlt} !important; }
    .leaflet-popup-content-wrapper { background: ${colors.surface}; color: ${colors.text}; border-radius: 16px; box-shadow: 0 12px 32px ${shadow}; padding: 2px; }
    .leaflet-popup-tip { background: ${colors.surface}; box-shadow: 0 12px 32px ${shadow}; }
    .leaflet-popup-content { margin: 12px 14px; line-height: 1.35; }
    .leaflet-popup-close-button { color: ${colors.muted} !important; }
    .leaflet-tooltip { background: ${colors.surface}; color: ${colors.text}; border: 1px solid ${colors.border}; border-radius: 8px; box-shadow: 0 6px 18px ${shadow}; font-size: 12px; font-weight: 600; }
    .leaflet-tooltip-top:before { border-top-color: ${colors.surface}; }
    .commute-vehicle-icon { background: transparent; border: none; }
    .commute-vehicle-icon > div { box-shadow: 0 3px 10px ${shadow}; }
  `;
}

function MapEventsHandler({ onViewportChanged, onMapReady, onMapPress }) {
  const callbackRef = useRef(onViewportChanged);
  callbackRef.current = onViewportChanged;
  const mapPressRef = useRef(onMapPress);
  mapPressRef.current = onMapPress;

  const emit = (map) => {
    if (!callbackRef.current) return;
    const bounds = map.getBounds();
    callbackRef.current({
      north: bounds.getNorth(),
      east: bounds.getEast(),
      south: bounds.getSouth(),
      west: bounds.getWest(),
    });
  };

  const map = useMapEvents({
    moveend: () => emit(map),
    zoomend: () => emit(map),
    click: () => mapPressRef.current?.(),
  });

  useEffect(() => {
    onMapReady?.(map);
    emit(map);
  }, [map, onMapReady]);

  return null;
}

function LocationMarker({ onLocationFound, onLocationError }) {
  const [position, setPosition] = useState(null);
  const foundRef = useRef(onLocationFound);
  foundRef.current = onLocationFound;
  const errorRef = useRef(onLocationError);
  errorRef.current = onLocationError;

  const map = useMapEvents({
    locationfound(event) {
      setPosition(event.latlng);
      foundRef.current?.(event.latlng);
    },
    locationerror(event) {
      errorRef.current?.(event);
    },
  });

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return;
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((result) => {
        if (result.state === 'granted') map.locate({ enableHighAccuracy: true });
      })
      .catch(() => {});
  }, [map]);

  if (!position) return null;

  return (
    <Marker position={position} icon={userLocationIcon}>
      <Popup>
        <span style={{ fontWeight: 600 }}>You are here</span>
      </Popup>
    </Marker>
  );
}

const StopMarker = React.memo(function StopMarker({ stop, isSelected, onSelect, colors }) {
  const handleClick = useCallback(() => {
    onSelect.current?.(stop);
  }, [stop, onSelect]);

  return (
    <>
      {isSelected && (
        <CircleMarker
          center={[stop.stop_lat, stop.stop_lon]}
          radius={18}
          pathOptions={{
            stroke: false,
            fillColor: colors.accent,
            fillOpacity: 0.18,
            interactive: false,
          }}
        />
      )}
      <CircleMarker
        center={[stop.stop_lat, stop.stop_lon]}
        radius={isSelected ? 9 : 6}
        pathOptions={{
          fillColor: isSelected ? colors.accent : '#10B981',
          color: '#FFFFFF',
          weight: 2,
          fillOpacity: 1,
          interactive: false,
        }}
      />
      <CircleMarker
        center={[stop.stop_lat, stop.stop_lon]}
        radius={18}
        pathOptions={{
          stroke: false,
          fillOpacity: 0,
          interactive: true,
          bubblingMouseEvents: false,
        }}
        eventHandlers={{ click: handleClick }}
      >
        <Tooltip direction="top" offset={[0, -8]} opacity={1}>
          {stop.stop_name}
        </Tooltip>
      </CircleMarker>
    </>
  );
});

function getVehicleIcon(vehicle, isDark) {
  const routeColor = `#${normalizeColor(vehicle.route_color)}`;
  const routeText = `#${normalizeColor(vehicle.route_text_color, 'FFFFFF')}`;
  const key = `${isDark ? 'd' : 'l'}-${routeColor}-${routeText}-${vehicle.route_short_name}`;

  if (!vehicleIconCache[key]) {
    vehicleIconCache[key] = new L.DivIcon({
      className: 'commute-vehicle-icon',
      html: `<div style="background-color:${routeColor};color:${routeText};width:30px;height:30px;display:flex;justify-content:center;align-items:center;border-radius:9px;font-weight:800;font-size:11px;border:2px solid #fff;">${vehicle.route_short_name ?? ''}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
  }

  return vehicleIconCache[key];
}

export default function Map({
  stops,
  selectedStop,
  vehicles,
  selectedVehicle,
  onStopSelect,
  onViewportChanged,
  onMapPress,
  isStopCardCollapsed,
  bottomObstruction = 0,
}) {
  const { colors, isDark } = useTheme();
  const [mapInstance, setMapInstance] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [notice, setNotice] = useState(null);

  const noticeTimer = useRef(null);
  const pendingNearest = useRef(false);
  const shouldFlyOnLocation = useRef(false);
  const selectedStopId = selectedStop?.stop_id;

  const showNotice = useCallback((message) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2600);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    []
  );

  const flyTo = useCallback(
    (latlng, { zoom = 16, obstructed = true } = {}) => {
      if (!mapInstance) return;

      const targetZoom = Math.max(mapInstance.getZoom(), zoom);
      const offset = obstructed ? bottomObstruction / 2 : 0;
      const point = mapInstance.project(latlng, targetZoom);
      const target = mapInstance.unproject(point.add([0, offset]), targetZoom);
      mapInstance.flyTo(target, targetZoom, { duration: 0.6 });
    },
    [mapInstance, bottomObstruction]
  );

  useEffect(() => {
    if (!selectedStop || !mapInstance) return;
    flyTo([selectedStop.stop_lat, selectedStop.stop_lon], {
      obstructed: true,
      zoom: 16,
    });
  }, [selectedStop?.stop_id, mapInstance, isStopCardCollapsed, flyTo]);

  useEffect(() => {
    if (!selectedVehicle || !mapInstance) return;
    flyTo([selectedVehicle.lat, selectedVehicle.lon], {
      obstructed: Boolean(selectedStop),
      zoom: 16,
    });
  }, [selectedVehicle?.id, mapInstance, flyTo, selectedStop]);

  const findNearestFrom = useCallback(
    (point) => {
      if (!stops?.length) {
        showNotice('No stops loaded yet — move the map first.');
        return;
      }

      let nearest = null;
      let nearestDistance = Infinity;
      for (const stop of stops) {
        const distance = distanceMeters(point, {
          latitude: Number(stop.stop_lat),
          longitude: Number(stop.stop_lon),
        });
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = stop;
        }
      }

      if (!nearest) return;
      if (nearestDistance > 3000) {
        showNotice('No nearby stops in view — move the map closer.');
        return;
      }
      onStopSelect?.(nearest);
    },
    [stops, onStopSelect, showNotice]
  );

  const handleLocationFound = useCallback(
    (latlng) => {
      const point = { latitude: latlng.lat, longitude: latlng.lng };
      setUserLocation(point);

      if (pendingNearest.current) {
        pendingNearest.current = false;
        findNearestFrom(point);
        return;
      }

      if (shouldFlyOnLocation.current) {
        shouldFlyOnLocation.current = false;
        flyTo([latlng.lat, latlng.lng], { obstructed: Boolean(selectedStop), zoom: 17 });
      }
    },
    [flyTo, selectedStop, findNearestFrom]
  );

  const handleLocationError = useCallback(
    (event) => {
      pendingNearest.current = false;
      shouldFlyOnLocation.current = false;
      if (event?.code === 1) {
        showNotice('Location permission is required.');
      } else {
        showNotice('Could not get your location.');
      }
    },
    [showNotice]
  );

  const handleLocate = useCallback(() => {
    if (!mapInstance) return;
    if (userLocation) {
      flyTo([userLocation.latitude, userLocation.longitude], {
        obstructed: Boolean(selectedStop),
        zoom: 17,
      });
      return;
    }
    shouldFlyOnLocation.current = true;
    mapInstance.locate({ enableHighAccuracy: true });
  }, [mapInstance, userLocation, flyTo, selectedStop]);

  const handleNearest = useCallback(() => {
    if (userLocation) {
      findNearestFrom(userLocation);
      return;
    }
    if (mapInstance) {
      pendingNearest.current = true;
      mapInstance.locate({ enableHighAccuracy: true });
    }
  }, [userLocation, findNearestFrom, mapInstance]);

  const onStopSelectRef = useRef(onStopSelect);
  onStopSelectRef.current = onStopSelect;

  const stopMarkers = useMemo(() => {
    if (!stops) return null;
    return stops.map((stop) => (
      <StopMarker
        key={stop.stop_id}
        stop={stop}
        isSelected={stop.stop_id === selectedStopId}
        onSelect={onStopSelectRef}
        colors={colors}
      />
    ));
  }, [stops, selectedStopId, colors]);

  const vehicleMarkers = useMemo(() => {
    const list = Array.isArray(vehicles) ? vehicles : [];
    if (list.length === 0) return null;

    return list.map((vehicle) => {
      const speed = speedKmh(vehicle.speed);
      const occupancy = occupancyLabel(vehicle.occupancy_status);
      const congestion = congestionLabel(vehicle.congestion_level);

      return (
        <Marker
          key={`${vehicle.id}-${isDark ? 'd' : 'l'}`}
          position={[vehicle.lat, vehicle.lon]}
          icon={getVehicleIcon(vehicle, isDark)}
          zIndexOffset={1000}
        >
          <Popup>
            <div style={{ minWidth: 150 }}>
              <div style={{ color: colors.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {vehicle.route_long_name || 'Route'}
              </div>
              <div style={{ color: colors.text, fontWeight: 800, fontSize: 15, marginTop: 2 }}>
                {vehicle.trip_headsign || 'In service'}
              </div>
              <div style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6 }}>
                Speed: {speed === null ? 'N/A' : `${speed} km/h`}
              </div>
              {occupancy ? (
                <div style={{ color: colors.textSecondary, fontSize: 12 }}>
                  Occupancy: {occupancy}
                </div>
              ) : null}
              {congestion ? (
                <div style={{ color: colors.textSecondary, fontSize: 12 }}>
                  Traffic: {congestion}
                </div>
              ) : null}
            </div>
          </Popup>
        </Marker>
      );
    });
  }, [vehicles, isDark, colors]);

  return (
    <View style={{ flex: 1 }}>
      <style>{leafletThemeCss(colors, isDark)}</style>

      <MapContainer
        center={VICTORIA}
        zoom={13}
        zoomControl={false}
        preferCanvas
        attributionControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          key={isDark ? 'dark' : 'light'}
          url={isDark ? MAP_TILES.dark : MAP_TILES.light}
          maxZoom={19}
        />
        <LocationMarker
          onLocationFound={handleLocationFound}
          onLocationError={handleLocationError}
        />
        <MapEventsHandler
          onViewportChanged={onViewportChanged}
          onMapReady={setMapInstance}
          onMapPress={onMapPress}
        />
        {stopMarkers}
        {vehicleMarkers}
      </MapContainer>

      <View
        style={{
          position: 'absolute',
          top: 14,
          right: 14,
          gap: 10,
          zIndex: 1000,
        }}
      >
        <IconButton
          name="add"
          size={18}
          onPress={() => mapInstance?.zoomIn()}
          disabled={!mapInstance}
          accessibilityLabel="Zoom in"
        />
        <IconButton
          name="remove"
          size={18}
          onPress={() => mapInstance?.zoomOut()}
          disabled={!mapInstance}
          accessibilityLabel="Zoom out"
        />
        <IconButton
          name="locate"
          onPress={handleLocate}
          accessibilityLabel="Center on my location"
        />
        <IconButton
          name="navigate-outline"
          onPress={handleNearest}
          accessibilityLabel="Find the closest stop"
        />
      </View>

      {notice ? (
        <View
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: bottomObstruction + 16,
            alignItems: 'center',
            zIndex: 1000,
          }}
          pointerEvents="none"
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: colors.surface,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
              {notice}
            </Text>
          </View>
        </View>
      ) : null}

      <View
        style={{
          position: 'absolute',
          left: 10,
          bottom: bottomObstruction + 8,
          zIndex: 1000,
        }}
        pointerEvents="none"
      >
        <Text
          style={{
            fontSize: 9,
            color: isDark ? colors.muted : '#64748B',
            backgroundColor: isDark ? 'rgba(8,12,18,0.6)' : 'rgba(255,255,255,0.7)',
            paddingHorizontal: 4,
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          {MAP_TILES.attribution}
        </Text>
      </View>
    </View>
  );
}
