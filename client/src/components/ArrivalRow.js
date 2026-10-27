import React, { memo, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../constants/theme';
import {
  arrivalSortMinutes,
  formatCountdown,
  formatDelay,
  normalizeColor,
} from '../utils/format';

export const ARRIVAL_ROW_HEIGHT = 78;

const STATUS_LABELS = {
  CANCELED: 'Canceled',
  SKIPPED: 'Skipped',
  ADDED: 'Added',
  UNSCHEDULED: 'Unscheduled',
};

function Chip({ label, className, textClassName }) {
  return (
    <View className={`rounded-full border px-2 py-[2px] ${className}`}>
      <Text className={`text-[10px] font-bold ${textClassName}`}>{label}</Text>
    </View>
  );
}

function ArrivalRow({ arrival, vehicles, onPress, isToday, nowMinutes }) {
  const { colors } = useTheme();

  const scheduled = arrival.arrival_time || '--:--';
  const realtime = arrival.real_time_arrival;
  const displayClock = realtime || scheduled;
  const minutes = arrivalSortMinutes(arrival);
  const minutesAhead = isToday && minutes >= 0 ? minutes - nowMinutes : null;
  const isPast = minutesAhead !== null && minutesAhead < -1;

  const status = arrival.status || 'SCHEDULED';
  const isCanceled = status === 'CANCELED';
  const isSkipped = status === 'SKIPPED';
  const isAdded = status === 'ADDED';
  const isUnscheduled = status === 'UNSCHEDULED';
  const dimmed = isCanceled || isSkipped || isPast;

  const vehicle = useMemo(
    () => vehicles?.find((item) => item.trip_id === arrival.trip_id),
    [vehicles, arrival.trip_id]
  );
  const canPress = Boolean(vehicle && onPress && !isCanceled && !isSkipped);

  const delayLabel = formatDelay(arrival.delay_minutes);
  const showDelay = delayLabel && arrival.delay_minutes !== 0 && !isCanceled && !isSkipped;
  const isEarly = showDelay && arrival.delay_minutes < 0;

  const routeLabel = arrival.route_short_name || '—';
  const badgeBackground = `#${normalizeColor(arrival.route_color)}`;
  const badgeText = `#${normalizeColor(arrival.route_text_color, 'FFFFFF')}`;
  const headsign = arrival.trip_headsign || arrival.stop_headsign || 'Unknown destination';

  const showCountdown =
    isToday && !isCanceled && !isSkipped && minutesAhead !== null && minutesAhead >= 0;
  const countdownLabel = showCountdown ? formatCountdown(minutesAhead) : displayClock;
  const countdownAccent = showCountdown && minutesAhead <= 10;

  const content = (
    <View
      className={`flex-row items-center border-b border-slate-100 px-4 dark:border-slate-800/70 ${
        dimmed ? 'opacity-60' : ''
      }`}
      style={{ height: ARRIVAL_ROW_HEIGHT }}
    >
      <View style={{ width: 70 }} className="justify-center">
        <Text
          numberOfLines={1}
          className={`text-[17px] font-bold ${
            countdownAccent
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-slate-900 dark:text-slate-100'
          } ${isCanceled || isSkipped ? 'line-through' : ''}`}
        >
          {countdownLabel}
        </Text>
        <Text
          numberOfLines={1}
          className={`text-[11px] font-medium ${
            dimmed ? 'text-slate-400 dark:text-slate-500' : 'text-slate-500 dark:text-slate-400'
          } ${showCountdown && realtime ? 'line-through' : ''}`}
        >
          {showCountdown
            ? displayClock
            : arrival.route_short_name
            ? `Route ${arrival.route_short_name}`
            : ''}
        </Text>
      </View>

      <View
        className="h-10 w-10 items-center justify-center rounded-xl mr-3"
        style={{
          backgroundColor: badgeBackground,
          opacity: dimmed ? 0.45 : 1,
        }}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          className="text-[12px] font-extrabold px-1"
          style={{ color: badgeText }}
        >
          {routeLabel}
        </Text>
      </View>

      <View className="flex-1 justify-center pr-1">
        <Text
          numberOfLines={1}
          className={`text-[15px] font-semibold ${
            isCanceled || isSkipped
              ? 'text-slate-400 line-through dark:text-slate-500'
              : 'text-slate-900 dark:text-slate-100'
          }`}
        >
          {headsign}
        </Text>

        <View className="flex-row items-center flex-wrap mt-1" style={{ gap: 4 }}>
          {vehicle && !isCanceled && !isSkipped && (
            <View className="flex-row items-center">
              <View className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1" />
              <Text className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                LIVE
              </Text>
            </View>
          )}
          {showDelay && (
            <Chip
              label={delayLabel}
              className={
                isEarly
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-900'
                  : 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-900'
              }
              textClassName={
                isEarly
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-amber-700 dark:text-amber-300'
              }
            />
          )}
          {isAdded && (
            <Chip
              label="Added"
              className="bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-900"
              textClassName="text-emerald-700 dark:text-emerald-300"
            />
          )}
          {isUnscheduled && (
            <Chip
              label="Unscheduled"
              className="bg-orange-50 dark:bg-orange-950/60 border-orange-200 dark:border-orange-900"
              textClassName="text-orange-700 dark:text-orange-300"
            />
          )}
          {(isCanceled || isSkipped) && (
            <Chip
              label={STATUS_LABELS[status]}
              className={
                isCanceled
                  ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-900'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
              }
              textClassName={
                isCanceled
                  ? 'text-rose-700 dark:text-rose-300'
                  : 'text-slate-600 dark:text-slate-300'
              }
            />
          )}
        </View>
      </View>

      {canPress && (
        <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: 4 }} />
      )}
    </View>
  );

  if (!canPress) return content;

  return (
    <Pressable
      onPress={() => onPress(arrival, vehicle)}
      accessibilityRole="button"
      accessibilityLabel={`${routeLabel} to ${headsign}, ${countdownLabel}. Show bus on map.`}
      style={({ pressed }) => [
        pressed && { backgroundColor: colors.surfaceAlt },
      ]}
    >
      {content}
    </Pressable>
  );
}

export default memo(ArrivalRow);
