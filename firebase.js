import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: "AIzaSyAT5LE-DOUUP55gNhPna2PoIzunmX2LQak",
  authDomain: "qr-attendance-app-a494d.firebaseapp.com",
  projectId: "qr-attendance-app-a494d",
  storageBucket: "qr-attendance-app-a494d.firebasestorage.app",
  messagingSenderId: "722276991862",
  appId: "1:722276991862:web:1a92b28401206dc6c47057",
  measurementId: "G-6C9Q5F3CJQ"
};

const app = initializeApp(firebaseConfig);

// Initialize Firestore with long-polling for compatibility with mobile carriers
// that block WebChannel streaming connections
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

/** @type {any} */
let auth;

if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  const { initializeAuth, getReactNativePersistence } = require('firebase/auth');
  const ReactNativeAsyncStorage = require('@react-native-async-storage/async-storage').default;
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage)
  });
}

export { auth };