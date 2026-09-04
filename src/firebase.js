import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging, isSupported } from 'firebase/messaging';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: 'AIzaSyA2oIL-WXWvzt1Ct256JF0_590CUpdXd_o',
  authDomain: 'billtracker-256ef.firebaseapp.com',
  projectId: 'billtracker-256ef',
  storageBucket: 'billtracker-256ef.firebasestorage.app',
  messagingSenderId: '1031129338488',
  appId: '1:1031129338488:web:836df1828ba619e674938d',
  measurementId: 'G-YYX20TJ1ST',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
// The functions live in us-central1 (the default), same as the schedulers.
export const functions = getFunctions(app);

export const FCM_VAPID_KEY = import.meta.env.VITE_FCM_VAPID_KEY || '';

// Lazily resolve messaging — Safari and some browsers don't support it
export const messaging = isSupported().then((ok) => (ok ? getMessaging(app) : null));
