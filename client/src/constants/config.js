import { Platform } from 'react-native';

// -----------------------------------------------------------------------------
// MOBILE ACCESS CONFIGURATION (WSL2 / Tunnel)
// -----------------------------------------------------------------------------
// 1. Run this command in a separate terminal to expose your API:
//    npx ngrok http 3000
// 2. Copy the 'Forwarding' URL (e.g., https://abcd-123.ngrok-free.app) below.
// -----------------------------------------------------------------------------
// const TUNNEL_URL = 'https://clint-extemporal-unmatrimonially.ngrok-free.dev'; // <--- PASTE YOUR NGROK URL HERE (e.g., 'https://...')

const API_BASE_URL = 'http://localhost:3000'; // Default for Desktop/Web

// if (TUNNEL_URL) {
//   API_BASE_URL = TUNNEL_URL;
// } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
//   API_BASE_URL = `http://${window.location.hostname}:3000`;
// }

export { API_BASE_URL };
