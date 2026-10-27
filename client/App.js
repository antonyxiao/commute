import './global.css';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Ionicons from '@expo/vector-icons/Ionicons';
import Map from './src/components/Map';
import StopCard from './src/components/StopCard';
import { useStops, useStopDetails } from './src/hooks/useTransitData';
import { useTheme } from './src/constants/theme';
import { getMapBottomObstruction, getSheetHeights } from './src/constants/layout';

const shadowStyle = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  android: { elevation: 5 },
  default: { boxShadow: '0 6px 20px rgba(15,23,42,0.16)' },
});

function AppShell() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { colors, isDark } = useTheme();

  const [mapBounds, setMapBounds] = useState(null);
  const [selectedStop, setSelectedStop] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [isStopCardCollapsed, setIsStopCardCollapsed] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  const {
    stops,
    loading: stopsLoading,
    error: stopsError,
    refresh: refreshStops,
  } = useStops(mapBounds);

  const {
    arrivals,
    vehicles,
    loading: arrivalsLoading,
    refreshing,
    error: arrivalsError,
    lastUpdated,
    refetch: refetchStop,
  } = useStopDetails(selectedStop, selectedDate, selectedTime);

  const heights = useMemo(
    () => getSheetHeights(windowHeight, insets.bottom, insets.top),
    [windowHeight, insets.bottom, insets.top]
  );

  const bottomObstruction = useMemo(
    () =>
      getMapBottomObstruction({
        hasStop: Boolean(selectedStop),
        isCollapsed: isStopCardCollapsed,
        heights,
      }),
    [selectedStop, isStopCardCollapsed, heights]
  );

  const handleStopSelect = useCallback((stop) => {
    setSelectedStop(stop);
    setSelectedVehicle(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setIsStopCardCollapsed(false);
  }, []);

  const handleCloseCard = useCallback(() => {
    setSelectedStop(null);
    setSelectedVehicle(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setIsStopCardCollapsed(false);
  }, []);

  const handleArrivalPress = useCallback((arrival, vehicle) => {
    if (vehicle) setSelectedVehicle(vehicle);
  }, []);

  const handleScheduleChange = useCallback((date, time) => {
    setSelectedDate(date);
    setSelectedTime(time);
    if (date) setSelectedVehicle(null);
  }, []);

  const handleViewportChanged = useCallback((bounds) => {
    setMapBounds(bounds);
  }, []);

  const handleMapPress = useCallback(() => {
    if (selectedStop) handleCloseCard();
  }, [selectedStop, handleCloseCard]);

  // Android back button dismisses the stop sheet.
  useEffect(() => {
    if (!selectedStop || Platform.OS === 'web') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleCloseCard();
      return true;
    });
    return () => subscription.remove();
  }, [selectedStop, handleCloseCard]);

  const showEmptyHint =
    !selectedStop && !stopsLoading && !stopsError && stops.length === 0 && mapBounds;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar
        style={isDark ? 'light' : 'dark'}
        translucent
        backgroundColor="transparent"
      />

      <Map
        stops={stops}
        selectedStop={selectedStop}
        vehicles={vehicles}
        selectedVehicle={selectedVehicle}
        onStopSelect={handleStopSelect}
        onViewportChanged={handleViewportChanged}
        onMapPress={handleMapPress}
        isStopCardCollapsed={isStopCardCollapsed}
        bottomObstruction={bottomObstruction}
      />

      {/* Brand / status pill */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + 12,
          left: 14,
          zIndex: 1000,
        }}
        pointerEvents="none"
      >
        <View
          className="flex-row items-center rounded-full border border-slate-200/80 bg-white/95 px-3 py-2 dark:border-slate-700/80 dark:bg-slate-900/95"
          style={shadowStyle}
        >
          <View className="h-7 w-7 items-center justify-center rounded-full bg-blue-600 dark:bg-blue-500">
            <Ionicons name="bus" size={15} color={isDark ? '#0B1220' : '#FFFFFF'} />
          </View>
          <Text className="ml-2 text-[13px] font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Commute
          </Text>
          {stopsLoading ? (
            <ActivityIndicator
              size="small"
              color={colors.accent}
              style={{ marginLeft: 8, transform: [{ scale: 0.75 }] }}
            />
          ) : (
            <View className="ml-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />
          )}
        </View>
      </View>

      {stopsError ? (
        <View
          style={{
            position: 'absolute',
            top: insets.top + 66,
            left: 14,
            right: 14,
            zIndex: 1000,
          }}
        >
          <View
            className="flex-row items-center rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900/60 dark:bg-amber-950/80"
            style={shadowStyle}
          >
            <Ionicons name="warning-outline" size={16} color={colors.warning} />
            <Text
              numberOfLines={2}
              className="ml-2 flex-1 text-[12px] font-medium text-amber-900 dark:text-amber-100"
            >
              {stopsError}
            </Text>
            <Pressable
              onPress={refreshStops}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Retry loading stops"
              className="ml-2 rounded-full bg-amber-900/10 px-3 py-1.5 dark:bg-amber-100/10"
            >
              <Text className="text-[12px] font-bold text-amber-900 dark:text-amber-100">
                Retry
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {showEmptyHint ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: insets.bottom + 28,
            alignItems: 'center',
            zIndex: 900,
          }}
          pointerEvents="none"
        >
          <View
            className="rounded-full border border-slate-200/80 bg-white/95 px-4 py-2 dark:border-slate-700/80 dark:bg-slate-900/95"
            style={shadowStyle}
          >
            <Text className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">
              No stops in this area — zoom in or move the map
            </Text>
          </View>
        </View>
      ) : null}

      {selectedStop ? (
        <StopCard
          stop={selectedStop}
          arrivals={arrivals}
          vehicles={vehicles}
          loading={arrivalsLoading}
          refreshing={refreshing}
          error={arrivalsError}
          lastUpdated={lastUpdated}
          onClose={handleCloseCard}
          onArrivalPress={handleArrivalPress}
          onRetry={refetchStop}
          selectedDate={selectedDate}
          selectedTime={selectedTime}
          onScheduleChange={handleScheduleChange}
          isCollapsed={isStopCardCollapsed}
          setIsCollapsed={setIsStopCardCollapsed}
        />
      ) : null}
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppShell />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
