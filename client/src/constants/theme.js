import { useColorScheme } from 'react-native';

export const palette = {
  light: {
    background: '#F4F6FA',
    surface: '#FFFFFF',
    surfaceAlt: '#F1F5F9',
    surfaceRaised: '#FFFFFF',
    border: '#E2E8F0',
    borderStrong: '#CBD5E1',
    text: '#0F172A',
    textSecondary: '#475569',
    muted: '#94A3B8',
    accent: '#2563EB',
    accentPressed: '#1D4ED8',
    accentSoft: '#DBEAFE',
    onAccent: '#FFFFFF',
    live: '#059669',
    liveSoft: '#D1FAE5',
    danger: '#E11D48',
    dangerSoft: '#FFE4E6',
    warning: '#D97706',
    warningSoft: '#FEF3C7',
    info: '#0284C7',
    shadow: '#0F172A',
    scrim: 'rgba(15, 23, 42, 0.42)',
    mapOverlay: '#FFFFFF',
    mapOverlayBorder: 'rgba(15, 23, 42, 0.10)',
  },
  dark: {
    background: '#080C12',
    surface: '#10161F',
    surfaceAlt: '#161E29',
    surfaceRaised: '#18212D',
    border: '#26313F',
    borderStrong: '#334155',
    text: '#F1F5F9',
    textSecondary: '#CBD5E1',
    muted: '#7C8CA3',
    accent: '#60A5FA',
    accentPressed: '#3B82F6',
    accentSoft: '#172554',
    onAccent: '#0B1220',
    live: '#34D399',
    liveSoft: '#052E24',
    danger: '#FB7185',
    dangerSoft: '#3F1D24',
    warning: '#FBBF24',
    warningSoft: '#3A2A0A',
    info: '#38BDF8',
    shadow: '#000000',
    scrim: 'rgba(0, 0, 0, 0.62)',
    mapOverlay: '#10161F',
    mapOverlayBorder: 'rgba(255, 255, 255, 0.10)',
  },
};

export const MAP_TILES = {
  light: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
  dark: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  attribution: '© OpenStreetMap contributors © CARTO',
};

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return {
    isDark,
    scheme: isDark ? 'dark' : 'light',
    colors: isDark ? palette.dark : palette.light,
  };
}
