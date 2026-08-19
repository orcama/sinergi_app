import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Singleton: jangan inisialisasi Firebase dua kali saat hot reload.
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Firefox punya bug IndexedDB yang memicu error "Database is closing/hidden".
// Fallback ke sessionStorage (browserSessionPersistence) untuk menghindarinya;
// browser lain tetap pakai browserLocalPersistence agar login persist.
if (typeof window !== "undefined" && /firefox/i.test(navigator.userAgent)) {
  setPersistence(auth, browserSessionPersistence).catch(() => {});
} else if (typeof window !== "undefined") {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
}