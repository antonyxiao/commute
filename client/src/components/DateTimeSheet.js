import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../constants/theme';
import {
  formatClock,
  formatDateLabel,
  getNowMinutes,
  getVancouverDateKey,
  parseClock,
} from '../utils/format';

function normalizeDate(date) {
  if (!date) return null;
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
  return key === getVancouverDateKey() ? null : date;
}

function addDays(date, days) {
  const base = date ? new Date(date) : new Date();
  base.setDate(base.getDate() + days);
  return normalizeDate(base);
}

function shiftClock(clock, delta) {
  const minutes = parseClock(clock);
  if (minutes < 0) return clock;
  return formatClock(minutes + delta);
}

const SHEET_SHADOW = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.2,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -8 },
  },
  android: { elevation: 20 },
  default: { boxShadow: '0 -12px 38px rgba(15,23,42,0.22)' },
});

const PRESETS = [
  { label: 'Now', offset: null },
  { label: '+30 min', offset: 30 },
  { label: '+1 hr', offset: 60 },
  { label: '+2 hr', offset: 120 },
];

export default function DateTimeSheet({ visible, date, time, onClose, onApply }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [draftDate, setDraftDate] = useState(date);
  const [draftTime, setDraftTime] = useState(time);

  useEffect(() => {
    if (!visible) return;
    setDraftDate(date);
    setDraftTime(time);
  }, [visible, date, time]);

  const nowClock = useMemo(() => formatClock(getNowMinutes()), [visible]);

  const displayTime = draftTime || nowClock;
  const dateLabel = draftDate
    ? draftDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    : 'Today';

  const applyPreset = useCallback((offset) => {
    if (offset === null) {
      setDraftDate(null);
      setDraftTime(null);
      return;
    }

    const total = getNowMinutes() + offset;
    const wrapped = total >= 1440;
    setDraftTime(formatClock(total));
    setDraftDate(wrapped ? addDays(null, 1) : null);
  }, []);

  const activePreset = useMemo(() => {
    if (!draftTime && !draftDate) return 'Now';
    return null;
  }, [draftDate, draftTime]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable
          className="absolute inset-0"
          style={{ backgroundColor: colors.scrim }}
          onPress={onClose}
          accessibilityLabel="Close schedule picker"
        />

        <View
          className="rounded-t-3xl bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800"
          style={[{ paddingBottom: Math.max(insets.bottom, 16) }, SHEET_SHADOW]}
        >
          <View className="items-center pt-3">
            <View className="h-1.5 w-11 rounded-full bg-slate-300 dark:bg-slate-700" />
          </View>

          <View className="flex-row items-center justify-between px-5 pt-4">
            <View>
              <Text className="text-[11px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
                Schedule
              </Text>
              <Text className="text-[22px] font-bold text-slate-900 dark:text-slate-50">
                Choose a time
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          <View className="px-5 pt-5">
            <View className="flex-row items-center justify-between rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-2">
              <Pressable
                onPress={() => setDraftDate((current) => addDays(current, -1))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Previous day"
                className="h-11 w-11 items-center justify-center rounded-xl active:opacity-60"
              >
                <Ionicons name="chevron-back" size={20} color={colors.text} />
              </Pressable>

              <View className="flex-1 items-center">
                <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Date
                </Text>
                <Text className="text-[16px] font-bold text-slate-900 dark:text-slate-50">
                  {dateLabel}
                </Text>
              </View>

              <Pressable
                onPress={() => setDraftDate((current) => addDays(current, 1))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Next day"
                className="h-11 w-11 items-center justify-center rounded-xl active:opacity-60"
              >
                <Ionicons name="chevron-forward" size={20} color={colors.text} />
              </Pressable>
            </View>

            {draftDate && (
              <Pressable
                onPress={() => setDraftDate(null)}
                className="self-center mt-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60"
              >
                <Text className="text-[12px] font-semibold text-blue-700 dark:text-blue-300">
                  Back to today
                </Text>
              </Pressable>
            )}
          </View>

          <View className="px-5 pt-6">
            <View className="flex-row items-center justify-between">
              <Pressable
                onPress={() => setDraftTime((current) => shiftClock(current || nowClock, -15))}
                accessibilityRole="button"
                accessibilityLabel="15 minutes earlier"
                className="h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 active:opacity-70"
              >
                <Ionicons name="remove" size={24} color={colors.text} />
              </Pressable>

              <View className="items-center">
                <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Departure after
                </Text>
                <Text className="text-[40px] font-bold tracking-tight text-slate-900 dark:text-slate-50">
                  {displayTime}
                </Text>
              </View>

              <Pressable
                onPress={() => setDraftTime((current) => shiftClock(current || nowClock, 15))}
                accessibilityRole="button"
                accessibilityLabel="15 minutes later"
                className="h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 active:opacity-70"
              >
                <Ionicons name="add" size={24} color={colors.text} />
              </Pressable>
            </View>
          </View>

          <View className="flex-row flex-wrap px-5 pt-5" style={{ gap: 8 }}>
            {PRESETS.map((preset) => {
              const isActive = activePreset === preset.label;
              return (
                <Pressable
                  key={preset.label}
                  onPress={() => applyPreset(preset.offset)}
                  className={`rounded-full border px-4 py-2 ${
                    isActive
                      ? 'bg-blue-600 border-blue-600 dark:bg-blue-500 dark:border-blue-500'
                      : 'bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700'
                  }`}
                >
                  <Text
                    className={`text-[13px] font-semibold ${
                      isActive
                        ? 'text-white dark:text-slate-950'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="px-5 pt-4">
            <Text className="text-[12px] leading-5 text-slate-500 dark:text-slate-400">
              Live vehicle positions are available for today only. Future dates show the
              published timetable.
            </Text>
          </View>

          <View className="flex-row px-5 pt-4" style={{ gap: 12 }}>
            <Pressable
              onPress={() => {
                onApply(null, null);
                onClose();
              }}
              className="flex-1 items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-700 py-3.5 active:opacity-70"
            >
              <Text className="text-[15px] font-semibold text-slate-700 dark:text-slate-300">
                Reset
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                onApply(draftDate, draftTime || (draftDate ? nowClock : null));
                onClose();
              }}
              className="flex-[2] items-center justify-center rounded-2xl bg-blue-600 dark:bg-blue-500 py-3.5 active:opacity-80"
              accessibilityRole="button"
              accessibilityLabel="Show schedule"
            >
              <Text className="text-[15px] font-bold text-white dark:text-slate-950">
                Show schedule
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
