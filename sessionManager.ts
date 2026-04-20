import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';

const TIMEOUT_DURATION = 30 * 60 * 1000; // 30 minutes
const LAST_ACTIVE_KEY = 'lastActiveTime';

let timeoutId: ReturnType<typeof setTimeout> | null = null;

// Save current time as last active
export const updateLastActive = async () => {
  await AsyncStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
};

// Check if session has expired
export const checkSessionTimeout = async () => {
  const lastActive = await AsyncStorage.getItem(LAST_ACTIVE_KEY);
  if (!lastActive) return;

  const elapsed = Date.now() - parseInt(lastActive);
  if (elapsed >= TIMEOUT_DURATION) {
    await handleAutoLogout();
  }
};

// Handle auto logout
export const handleAutoLogout = async () => {
  await AsyncStorage.removeItem(LAST_ACTIVE_KEY);
  await signOut(auth);
  router.replace('/screens/auth/LoginScreen' as any);
};

// Start inactivity timer
export const startInactivityTimer = () => {
  resetInactivityTimer();
};

// Reset timer on user activity
export const resetInactivityTimer = () => {
  if (timeoutId) clearTimeout(timeoutId);
  updateLastActive();
  timeoutId = setTimeout(async () => {
    await handleAutoLogout();
  }, TIMEOUT_DURATION);
};

// Clear timer on logout
export const clearInactivityTimer = () => {
  if (timeoutId) clearTimeout(timeoutId);
  timeoutId = null;
};