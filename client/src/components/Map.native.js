import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import IconButton from './ui/IconButton';
import { useTheme } from '../constants/theme';
import { buildLeafletHtml } from './map/leafletHtml';
import { distanceMeters } from '../utils/cluster';

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
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const webViewRef = useRef(null);
  const readyRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [userCoords, setUserCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState(null);

  // Freeze the theme used for the first paint; later changes are bridged.
  const initialTheme = useRef({ dark: isDark, colors }).current;
  const html = useMemo(() => buildLeafletHtml(initialTheme), [initialTheme]);

  const noticeTimer = useRef(null);
  const showNotice = useCallback((message) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2800);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    []
  );

  const send = useCallback((message) => {
    if (!readyRef.current || !webViewRef.current) return;
    const json = JSON.stringify(message)
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
    webViewRef.current.injectJavaScript(
      `window.__commute && window.__commute.handle(${json}); true;`
    );
  }, []);

  const syncAll = useCallback(() => {
    send({ type: 'theme', dark: isDark, colors });
    send({ type: 'stops', stops: stops || [] });
    send({ type: 'vehicles', vehicles: vehicles || [] });
    send({ type: 'user', coords: userCoords });
    send({
      type: 'select',
      stop: selectedStop,
      fly: false,
      bottomPadding: bottomObstruction,
    });
  }, [send, isDark, colors, stops, vehicles, userCoords, selectedStop, bottomObstruction]);

  const handleReady = useCallback(() => {
    readyRef.current = true;
    setMapError(null);
    setMapReady(true);
    syncAll();
  }, [syncAll]);

  const handleRetryMap = useCallback(() => {
    readyRef.current = false;
    setMapError(null);
    setMapReady(false);
    webViewRef.current?.reload();
  }, []);

  // Don't leave the user staring at a spinner if the tile/Leaflet CDN is down.
  useEffect(() => {
    const id = setTimeout(() => {
      if (!readyRef.current) {
        setMapError('Map is taking too long to load. Check your connection.');
      }
    }, 12000);
    return () => clearTimeout(id);
  }, []);

  const handleMessage = useCallback(
    (event) => {
      let message;
      try {
        message = JSON.parse(event.nativeEvent.data);
      } catch (error) {
        return;
      }

      switch (message.type) {
        case 'ready':
          handleReady();
          break;
        case 'viewport':
          if (message.bounds) onViewportChanged?.(message.bounds);
          break;
        case 'stop':
          if (message.stop) onStopSelect?.(message.stop);
          break;
        case 'mapPress':
          onMapPress?.();
          break;
        case 'error':
          console.warn('Map error:', message.message);
          setMapReady(false);
          setMapError('Map failed to load. Check your connection.');
          break;
        case 'tileError':
          showNotice('Map tiles failed to load. Check your connection.');
          break;
        default:
          break;
      }
    },
    [handleReady, onViewportChanged, onStopSelect, onMapPress, showNotice]
  );

  useEffect(() => {
    send({ type: 'stops', stops: stops || [] });
  }, [stops, send]);

  useEffect(() => {
    send({ type: 'vehicles', vehicles: vehicles || [] });
  }, [vehicles, send]);

  useEffect(() => {
    send({ type: 'user', coords: userCoords });
  }, [userCoords, send]);

  useEffect(() => {
    send({ type: 'theme', dark: isDark, colors });
  }, [isDark, colors, send]);

  useEffect(() => {
    send({ type: 'bottomPadding', value: bottomObstruction });
  }, [bottomObstruction, send]);

  useEffect(() => {
    send({
      type: 'select',
      stop: selectedStop,
      fly: true,
      bottomPadding: bottomObstruction,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStop?.stop_id, isStopCardCollapsed, send]);

  useEffect(() => {
    if (selectedVehicle?.id) {
      send({ type: 'focusVehicle', id: selectedVehicle.id });
    }
  }, [selectedVehicle?.id, send]);

  // Reuse an existing location permission without prompting on launch.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const existing = await Location.getForegroundPermissionsAsync();
        if (cancelled || existing.status !== 'granted') return;

        const last = await Location.getLastKnownPositionAsync();
        if (!cancelled && last?.coords) setUserCoords(last.coords);
      } catch (error) {
        console.warn('Location setup failed:', error.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const ensureLocation = useCallback(async () => {
    setLocating(true);
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted' && permission.canAskAgain) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (permission.status !== 'granted') {
        showNotice('Location permission is required.');
        return null;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setUserCoords(position.coords);
      return position.coords;
    } catch (error) {
      console.warn('Location lookup failed:', error.message);
      showNotice('Could not get your location.');
      return null;
    } finally {
      setLocating(false);
    }
  }, [showNotice]);

  const handleLocate = useCallback(async () => {
    const coords = userCoords || (await ensureLocation());
    if (!coords) return;

    send({
      type: 'flyTo',
      latitude: coords.latitude,
      longitude: coords.longitude,
      zoom: 16,
    });
  }, [userCoords, ensureLocation, send]);

  const handleNearestStop = useCallback(async () => {
    if (!stops?.length) {
      showNotice('No stops loaded yet — move the map first.');
      return;
    }

    const coords = userCoords || (await ensureLocation());
    if (!coords) return;

    let nearest = null;
    let nearestDistance = Infinity;
    for (const stop of stops) {
      const distance = distanceMeters(coords, {
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
  }, [stops, userCoords, ensureLocation, onStopSelect, showNotice]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={{ flex: 1, backgroundColor: colors.background }}
        originWhitelist={['*']}
        onMessage={handleMessage}
        onError={() => {
          setMapReady(false);
          setMapError('Map failed to load. Check your connection.');
        }}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        bounces={false}
        overScrollMode="never"
        androidLayerType="hardware"
        setSupportMultipleWindows={false}
        allowsLinkPreview={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />

      {!mapReady && (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: colors.background,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 32,
            },
          ]}
          pointerEvents={mapError ? 'auto' : 'none'}
        >
          {mapError ? (
            <View style={{ alignItems: 'center' }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: colors.surfaceAlt,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 12,
                }}
              >
                <Ionicons name="map-outline" size={26} color={colors.muted} />
              </View>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 16,
                  fontWeight: '700',
                  textAlign: 'center',
                }}
              >
                Map unavailable
              </Text>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 13,
                  textAlign: 'center',
                  marginTop: 4,
                  lineHeight: 19,
                }}
              >
                {mapError}
              </Text>
              <Pressable
                onPress={handleRetryMap}
                style={{
                  marginTop: 16,
                  backgroundColor: colors.accent,
                  paddingHorizontal: 22,
                  paddingVertical: 10,
                  borderRadius: 999,
                }}
              >
                <Text
                  style={{ color: colors.onAccent, fontSize: 13, fontWeight: '700' }}
                >
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : (
            <ActivityIndicator color={colors.accent} />
          )}
        </View>
      )}

      <View
        style={{
          position: 'absolute',
          top: insets.top + 12,
          right: 14,
          gap: 10,
          zIndex: 10,
        }}
      >
        <IconButton
          name="locate"
          onPress={handleLocate}
          loading={locating}
          accessibilityLabel="Center on my location"
        />
        <IconButton
          name="navigate-outline"
          onPress={handleNearestStop}
          accessibilityLabel="Find the closest stop"
        />
      </View>

      {notice ? (
        <View
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom:
              bottomObstruction > 0 ? bottomObstruction + 16 : insets.bottom + 16,
            alignItems: 'center',
            zIndex: 10,
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
            <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
            <Text
              style={{
                marginLeft: 6,
                color: colors.text,
                fontSize: 12,
                fontWeight: '600',
              }}
            >
              {notice}
            </Text>
          </View>
        </View>
      ) : null}

      <View
        style={{
          position: 'absolute',
          left: 12,
          bottom:
            bottomObstruction > 0 ? bottomObstruction + 8 : insets.bottom + 8,
          zIndex: 10,
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
          © OpenStreetMap contributors
        </Text>
      </View>
    </View>
  );
}
