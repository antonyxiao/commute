import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { cssInterop } from 'nativewind';
import ArrivalRow, { ARRIVAL_ROW_HEIGHT } from './ArrivalRow';
import DateTimeSheet from './DateTimeSheet';
import { useTheme } from '../constants/theme';
import { getSheetHeights } from '../constants/layout';
import { useNow } from '../hooks/useTransitData';
import {
  arrivalSortMinutes,
  formatCountdown,
  formatDateLabel,
  formatStopNumber,
  formatUpdatedAgo,
  getNowMinutes,
  normalizeColor,
  parseClock,
} from '../utils/format';

cssInterop(Animated.View, { className: 'style' });

const ANIMATION_CONFIG = {
  duration: 260,
  easing: Easing.out(Easing.cubic),
};

const SHEET_SHADOW = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
  },
  android: { elevation: 18 },
  default: { boxShadow: '0 -10px 34px rgba(15,23,42,0.18)' },
});

function findNearestSnapPoint(height, velocity, points) {
  'worklet';
  if (Math.abs(velocity) > 550) {
    if (velocity > 0) {
      for (let i = points.length - 1; i >= 0; i -= 1) {
        if (points[i] < height - 1) return points[i];
      }
      return points[0];
    }
    for (let i = 0; i < points.length; i += 1) {
      if (points[i] > height + 1) return points[i];
    }
    return points[points.length - 1];
  }

  let closest = points[0];
  let smallestDistance = Math.abs(height - points[0]);
  for (let i = 1; i < points.length; i += 1) {
    const distance = Math.abs(height - points[i]);
    if (distance < smallestDistance) {
      smallestDistance = distance;
      closest = points[i];
    }
  }
  return closest;
}

function SkeletonRow({ pulseStyle, colors }) {
  return (
    <Animated.View
      style={[
        pulseStyle,
        { height: ARRIVAL_ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
      ]}
    >
      <View style={{ width: 70 }}>
        <View style={{ height: 16, width: 48, borderRadius: 6, backgroundColor: colors.surfaceAlt }} />
        <View style={{ height: 9, width: 32, borderRadius: 5, backgroundColor: colors.surfaceAlt, marginTop: 7 }} />
      </View>
      <View style={{ height: 40, width: 40, borderRadius: 12, backgroundColor: colors.surfaceAlt, marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <View style={{ height: 13, width: '68%', borderRadius: 6, backgroundColor: colors.surfaceAlt }} />
        <View style={{ height: 9, width: '32%', borderRadius: 5, backgroundColor: colors.surfaceAlt, marginTop: 8 }} />
      </View>
    </Animated.View>
  );
}

export default function StopCard({
  stop,
  arrivals,
  vehicles,
  loading,
  refreshing,
  error,
  lastUpdated,
  onClose,
  onArrivalPress,
  onRetry,
  selectedDate,
  selectedTime,
  onScheduleChange,
  isCollapsed,
  setIsCollapsed,
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { colors } = useTheme();
  const now = useNow(15000);

  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [direction, setDirection] = useState('all');
  const flatListRef = useRef(null);

  const heights = useMemo(
    () => getSheetHeights(windowHeight, insets.bottom, insets.top),
    [windowHeight, insets.bottom, insets.top]
  );

  const cardHeight = useSharedValue(heights.collapsed);
  const startHeight = useSharedValue(0);
  const pulse = useSharedValue(0.55);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 850 }), -1, true);
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const animatedStyle = useAnimatedStyle(() => ({ height: cardHeight.value }));

  useEffect(() => {
    const target = isCollapsed ? heights.collapsed : heights.medium;
    cardHeight.value = withTiming(target, ANIMATION_CONFIG);
  }, [isCollapsed, heights.collapsed, heights.medium, cardHeight]);

  useEffect(() => {
    setIsCollapsed(false);
    setIsScheduleOpen(false);
    setDirection('all');
  }, [stop?.stop_id, setIsCollapsed]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-6, 6])
        .onStart(() => {
          startHeight.value = cardHeight.value;
        })
        .onUpdate((event) => {
          const next = startHeight.value - event.translationY;
          cardHeight.value = Math.max(
            heights.collapsed,
            Math.min(heights.expanded, next)
          );
        })
        .onEnd((event) => {
          const target = findNearestSnapPoint(
            cardHeight.value,
            event.velocityY,
            heights.snapPoints
          );
          cardHeight.value = withTiming(target, ANIMATION_CONFIG);
          runOnJS(setIsCollapsed)(target === heights.collapsed);
        }),
    [heights, setIsCollapsed, cardHeight, startHeight]
  );

  const nowMinutes = getNowMinutes(now);
  const minutesRef = useRef(nowMinutes);
  minutesRef.current = nowMinutes;
  const isToday = !selectedDate;

  const directions = useMemo(() => {
    const found = new Set();
    for (const arrival of arrivals || []) {
      if (arrival.direction_id === 0 || arrival.direction_id === 1) {
        found.add(arrival.direction_id);
      }
    }
    return [...found].sort();
  }, [arrivals]);

  const filteredArrivals = useMemo(() => {
    const list = arrivals || [];
    if (direction === 'all') return list;
    return list.filter((arrival) => arrival.direction_id === direction);
  }, [arrivals, direction]);

  const nextArrival = useMemo(() => {
    if (!filteredArrivals?.length) return null;
    if (!isToday) return filteredArrivals[0];
    const target = selectedTime ? parseClock(selectedTime) : nowMinutes;
    return (
      filteredArrivals.find((arrival) => arrivalSortMinutes(arrival) >= target) ||
      filteredArrivals[filteredArrivals.length - 1]
    );
  }, [filteredArrivals, isToday, selectedTime, nowMinutes]);

  const nextSummary = useMemo(() => {
    if (!nextArrival) return null;
    const minutesAhead = arrivalSortMinutes(nextArrival) - nowMinutes;
    return {
      route: nextArrival.route_short_name || '—',
      headsign:
        nextArrival.trip_headsign ||
        nextArrival.stop_headsign ||
        'Unknown destination',
      countdown:
        isToday && minutesAhead >= 0
          ? formatCountdown(minutesAhead)
          : nextArrival.real_time_arrival || nextArrival.arrival_time || '—',
      color: `#${normalizeColor(nextArrival.route_color)}`,
      textColor: `#${normalizeColor(nextArrival.route_text_color, 'FFFFFF')}`,
    };
  }, [nextArrival, isToday, nowMinutes]);

  // Scroll to the next relevant departure when the stop/filters change or the
  // first batch of data arrives. Polling the same stop must not yank the list.
  const scrollKey = `${stop?.stop_id ?? ''}|${
    selectedDate ? selectedDate.toDateString() : ''
  }|${selectedTime ?? ''}|${direction}`;
  const lastScrollKey = useRef(null);

  useEffect(() => {
    if (isCollapsed || !filteredArrivals?.length) return undefined;
    if (lastScrollKey.current === scrollKey) return undefined;
    lastScrollKey.current = scrollKey;

    let target = 0;
    if (isToday) {
      target = selectedTime ? parseClock(selectedTime) : minutesRef.current;
    } else if (selectedTime) {
      target = parseClock(selectedTime);
    }

    let index = filteredArrivals.findIndex(
      (arrival) => arrivalSortMinutes(arrival) >= target
    );
    if (index === -1) index = filteredArrivals.length - 1;

    const id = setTimeout(() => {
      flatListRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0,
      });
    }, 300);

    return () => clearTimeout(id);
  }, [filteredArrivals, scrollKey, isCollapsed, isToday, selectedTime]);

  const keyExtractor = useCallback(
    (item, index) =>
      `${item.trip_id}_${item.stop_sequence ?? index}_${item.arrival_time ?? ''}_${index}`,
    []
  );

  const renderItem = useCallback(
    ({ item }) => (
      <ArrivalRow
        arrival={item}
        vehicles={vehicles}
        onPress={onArrivalPress}
        isToday={isToday}
        nowMinutes={nowMinutes}
      />
    ),
    [vehicles, onArrivalPress, isToday, nowMinutes]
  );

  const getItemLayout = useCallback(
    (_, index) => ({
      length: ARRIVAL_ROW_HEIGHT,
      offset: ARRIVAL_ROW_HEIGHT * index,
      index,
    }),
    []
  );

  const handleScrollToIndexFailed = useCallback((info) => {
    setTimeout(() => {
      flatListRef.current?.scrollToOffset({
        offset: info.averageItemLength * info.index,
        animated: true,
      });
    }, 120);
  }, []);

  const listContentStyle = useMemo(
    () => ({ paddingBottom: Math.max(insets.bottom, 12) }),
    [insets.bottom]
  );

  const handleScheduleToggle = useCallback(
    (open) => {
      setIsScheduleOpen(open);
      if (open) setIsCollapsed(false);
    },
    [setIsCollapsed]
  );

  if (!stop) return null;

  const showSkeletons = loading && arrivals.length === 0;
  const showFatalError = error && arrivals.length === 0 && !loading;

  const noDirectionArrivals =
    !selectedDate &&
    direction !== 'all' &&
    filteredArrivals.length === 0 &&
    arrivals.length > 0;
  const noTimeArrivals =
    !selectedDate &&
    Boolean(selectedTime) &&
    filteredArrivals.length === 0 &&
    !noDirectionArrivals;

  return (
    <>
      <Animated.View
        style={[animatedStyle, SHEET_SHADOW]}
        className="absolute bottom-0 left-0 right-0 overflow-hidden rounded-t-3xl border-t border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <GestureDetector gesture={panGesture}>
          <Animated.View className="px-5 pb-2 pt-2">
            <View className="items-center pb-2">
              <View className="h-1.5 w-11 rounded-full bg-slate-300 dark:bg-slate-700" />
            </View>

            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <View className="flex-row items-center">
                  <Text className="text-[11px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
                    Stop #{formatStopNumber(stop)}
                  </Text>
                  {!isCollapsed && stop.stop_desc ? (
                    <Text
                      numberOfLines={1}
                      className="ml-1.5 flex-1 text-[11px] font-medium text-slate-400 dark:text-slate-500"
                    >
                      · {stop.stop_desc}
                    </Text>
                  ) : null}
                </View>

                <Text
                  numberOfLines={1}
                  className="mt-0.5 text-[21px] font-bold tracking-tight text-slate-900 dark:text-slate-50"
                >
                  {stop.stop_name}
                </Text>

                {isCollapsed && (
                  <View className="mt-1 flex-row items-center">
                    {nextSummary ? (
                      <>
                        <View
                          className="mr-2 rounded-md px-1.5 py-0.5"
                          style={{ backgroundColor: nextSummary.color }}
                        >
                          <Text
                            className="text-[10px] font-extrabold"
                            style={{ color: nextSummary.textColor }}
                          >
                            {nextSummary.route}
                          </Text>
                        </View>
                        <Text
                          numberOfLines={1}
                          className="flex-1 text-[13px] font-medium text-slate-600 dark:text-slate-300"
                        >
                          {nextSummary.headsign}
                        </Text>
                        <Text className="ml-2 text-[13px] font-bold text-blue-600 dark:text-blue-400">
                          {nextSummary.countdown}
                        </Text>
                      </>
                    ) : (
                      <Text className="text-[13px] text-slate-400 dark:text-slate-500">
                        {showSkeletons ? 'Loading arrivals…' : 'No upcoming arrivals'}
                      </Text>
                    )}
                  </View>
                )}
              </View>

              <View className="flex-row items-center" style={{ gap: 6 }}>
                <Pressable
                  onPress={() => setIsCollapsed(!isCollapsed)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={isCollapsed ? 'Expand stop card' : 'Collapse stop card'}
                  className="h-9 w-9 items-center justify-center rounded-full bg-slate-100 active:opacity-60 dark:bg-slate-800"
                >
                  <Ionicons
                    name={isCollapsed ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.textSecondary}
                  />
                </Pressable>
                <Pressable
                  onPress={onClose}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Close stop card"
                  className="h-9 w-9 items-center justify-center rounded-full bg-slate-100 active:opacity-60 dark:bg-slate-800"
                >
                  <Ionicons name="close" size={18} color={colors.textSecondary} />
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </GestureDetector>

        <View
          className="flex-1 px-4"
          pointerEvents={isCollapsed ? 'none' : 'auto'}
        >
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <Pressable
              onPress={() => handleScheduleToggle(true)}
              accessibilityRole="button"
              accessibilityLabel="Change schedule date and time"
              className="flex-1 flex-row items-center rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2.5 active:opacity-70 dark:border-slate-800 dark:bg-slate-800/60"
            >
              <View className="mr-2.5 h-8 w-8 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/60">
                <Ionicons name="calendar-outline" size={16} color={colors.accent} />
              </View>
              <View className="flex-1">
                <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Schedule
                </Text>
                <Text
                  numberOfLines={1}
                  className="text-[14px] font-semibold text-slate-800 dark:text-slate-100"
                >
                  {formatDateLabel(selectedDate)}
                  {selectedTime ? ` · after ${selectedTime}` : ' · live'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>

            <Pressable
              onPress={onRetry}
              disabled={refreshing}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Refresh arrivals"
              className="h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/80 bg-white active:opacity-60 dark:border-slate-800 dark:bg-slate-900"
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons name="refresh" size={18} color={colors.textSecondary} />
              )}
            </Pressable>
          </View>

          <View className="flex-row items-center justify-between pb-1 pt-4">
            <View className="flex-row items-baseline">
              <Text className="text-[17px] font-bold tracking-tight text-slate-900 dark:text-slate-50">
                Arrivals
              </Text>
              <Text className="ml-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                {filteredArrivals.length}
              </Text>
            </View>
            <View className="flex-row items-center">
              {isToday && !error && (
                <View className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
              )}
              <Text className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                {formatUpdatedAgo(lastUpdated, now.getTime())}
              </Text>
            </View>
          </View>

          {directions.length > 1 && (
            <View className="mb-2 flex-row rounded-xl bg-slate-100 p-1 dark:bg-slate-800/70">
              {[
                { value: 'all', label: 'All' },
                { value: 0, label: 'Inbound' },
                { value: 1, label: 'Outbound' },
              ].map((option) => {
                const active = direction === option.value;
                return (
                  <Pressable
                    key={String(option.value)}
                    onPress={() => setDirection(option.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className={`flex-1 items-center rounded-lg py-1.5 ${
                      active ? 'bg-white dark:bg-slate-700' : ''
                    }`}
                  >
                    <Text
                      className={`text-[12px] font-semibold ${
                        active
                          ? 'text-blue-600 dark:text-blue-300'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {error && arrivals.length > 0 && (
            <View className="mb-2 flex-row items-center rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/60 dark:bg-amber-950/40">
              <Ionicons name="warning-outline" size={14} color={colors.warning} />
              <Text numberOfLines={1} className="ml-2 flex-1 text-[11px] font-medium text-amber-800 dark:text-amber-200">
                {error}
              </Text>
              <Pressable onPress={onRetry} hitSlop={6}>
                <Text className="text-[11px] font-bold text-amber-900 dark:text-amber-100">Retry</Text>
              </Pressable>
            </View>
          )}

          {showSkeletons ? (
            <View className="flex-1">
              {[0, 1, 2, 3].map((key) => (
                <SkeletonRow key={key} pulseStyle={pulseStyle} colors={colors} />
              ))}
            </View>
          ) : showFatalError ? (
            <View className="flex-1 items-center justify-center px-6 pb-6">
              <View className="mb-3 h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                <Ionicons name="cloud-offline-outline" size={26} color={colors.muted} />
              </View>
              <Text className="text-center text-[16px] font-bold text-slate-900 dark:text-slate-50">
                Can't reach the transit server
              </Text>
              <Text className="mt-1 text-center text-[13px] leading-5 text-slate-500 dark:text-slate-400">
                {error}
              </Text>
              <Pressable
                onPress={onRetry}
                className="mt-4 rounded-full bg-blue-600 px-5 py-2.5 active:opacity-80 dark:bg-blue-500"
              >
                <Text className="text-[13px] font-bold text-white dark:text-slate-950">
                  Try again
                </Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={filteredArrivals}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              getItemLayout={getItemLayout}
              contentContainerStyle={[
                listContentStyle,
                filteredArrivals.length === 0 && { flexGrow: 1 },
              ]}
              onScrollToIndexFailed={handleScrollToIndexFailed}
              refreshControl={
                Platform.OS === 'web' ? undefined : (
                  <RefreshControl
                    refreshing={Boolean(refreshing)}
                    onRefresh={onRetry}
                    tintColor={colors.accent}
                    colors={[colors.accent]}
                    progressBackgroundColor={colors.surface}
                  />
                )
              }
              removeClippedSubviews
              maxToRenderPerBatch={10}
              windowSize={7}
              initialNumToRender={10}
              extraData={vehicles}
              ListEmptyComponent={
                <View className="flex-1 items-center justify-center px-6 pb-8">
                  <View className="mb-3 h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                    <Ionicons name="bus-outline" size={26} color={colors.muted} />
                  </View>
                  <Text className="text-center text-[16px] font-bold text-slate-900 dark:text-slate-50">
                    {selectedDate
                      ? 'No service on this date'
                      : noDirectionArrivals
                      ? `No ${direction === 0 ? 'inbound' : 'outbound'} arrivals`
                      : noTimeArrivals
                      ? `No arrivals after ${selectedTime}`
                      : 'No more arrivals today'}
                  </Text>
                  <Text className="mt-1 text-center text-[13px] leading-5 text-slate-500 dark:text-slate-400">
                    {selectedDate
                      ? 'Try another day, or jump back to live data.'
                      : noDirectionArrivals
                      ? 'Try the other direction, or show all arrivals.'
                      : noTimeArrivals
                      ? 'Try an earlier time, or show every scheduled departure.'
                      : 'Check back later or select another date.'}
                  </Text>
                  {noTimeArrivals && (
                    <Pressable
                      onPress={() => onScheduleChange(selectedDate, null)}
                      className="mt-4 rounded-full bg-slate-200 px-5 py-2.5 active:opacity-80 dark:bg-slate-800"
                    >
                      <Text className="text-[13px] font-bold text-slate-800 dark:text-slate-100">
                        Show all times
                      </Text>
                    </Pressable>
                  )}
                  {noDirectionArrivals && (
                    <Pressable
                      onPress={() => setDirection('all')}
                      className="mt-4 rounded-full bg-slate-200 px-5 py-2.5 active:opacity-80 dark:bg-slate-800"
                    >
                      <Text className="text-[13px] font-bold text-slate-800 dark:text-slate-100">
                        Show all arrivals
                      </Text>
                    </Pressable>
                  )}
                  {selectedDate && (
                    <Pressable
                      onPress={() => onScheduleChange(null, null)}
                      className="mt-4 rounded-full bg-blue-600 px-5 py-2.5 active:opacity-80 dark:bg-blue-500"
                    >
                      <Text className="text-[13px] font-bold text-white dark:text-slate-950">
                        Back to today
                      </Text>
                    </Pressable>
                  )}
                </View>
              }
            />
          )}
        </View>
      </Animated.View>

      <DateTimeSheet
        visible={isScheduleOpen}
        date={selectedDate}
        time={selectedTime}
        onClose={() => setIsScheduleOpen(false)}
        onApply={onScheduleChange}
      />
    </>
  );
}
