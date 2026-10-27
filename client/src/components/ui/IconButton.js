import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../constants/theme';

export default function IconButton({
  name,
  onPress,
  accessibilityLabel,
  variant = 'surface',
  size = 20,
  loading = false,
  disabled = false,
  style,
}) {
  const { colors, isDark } = useTheme();
  const isAccent = variant === 'accent';
  const background = isAccent ? colors.accent : colors.mapOverlay;
  const foreground = isAccent ? colors.onAccent : colors.text;

  const shadow = Platform.select({
    ios: {
      shadowColor: colors.shadow,
      shadowOpacity: isDark ? 0.45 : 0.14,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    android: { elevation: isDark ? 3 : 4 },
    default: {
      boxShadow: isDark
        ? '0 4px 14px rgba(0,0,0,0.5)'
        : '0 4px 14px rgba(15,23,42,0.14)',
    },
  });

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        {
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: background,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.mapOverlayBorder,
          opacity: disabled ? 0.45 : 1,
        },
        shadow,
        pressed && { transform: [{ scale: 0.94 }], opacity: 0.85 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : (
        <Ionicons name={name} size={size} color={foreground} />
      )}
    </Pressable>
  );
}
