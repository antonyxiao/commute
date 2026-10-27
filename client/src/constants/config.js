import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = 3000;

/**
 * Resolves the API host automatically:
 * 1. EXPO_PUBLIC_API_URL when explicitly configured.
 * 2. The current browser hostname on web.
 * 3. The Expo dev-server host (your computer's LAN IP) on devices.
 * 4. localhost as a last resort.
 *
 * This removes the need to hand-edit the IP every time the network changes.
 */
function resolveApiBaseUrl() {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/+$/, '');

  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${window.location.hostname}:${API_PORT}`;
  }

  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    '';

  const host = hostUri.split(':')[0];
  if (host) return `http://${host}:${API_PORT}`;

  return `http://localhost:${API_PORT}`;
}

export const API_BASE_URL = resolveApiBaseUrl();
export const POLL_INTERVALS = {
  arrivals: 10000,
  vehicles: 5000,
};
