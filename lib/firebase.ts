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
// Instance di-cache di globalThis agar tidak ter-reset oleh React Fast Refresh.
const GLOBAL_KEY = "__sinergi_firebase_app__";
const g = globalThis as Record<string, unknown>;

const app =
  (g[GLOBAL_KEY] as ReturnType<typeof initializeApp> | undefined) ??
  (getApps().length > 0 ? getApp() : initializeApp(firebaseConfig));
g[GLOBAL_KEY] = app;

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Firefox punya bug IndexedDB yang memicu error "Database is closing/hidden".
// Fallback ke sessionStorage (browserSessionPersistence) untuk menghindarinya;
// browser lain tetap pakai browserLocalPersistence agar login persist.
//
// setPersistence hanya dijalankan SEKALI per sesi browser. Memanggilnya berulang
// (misal saat hot reload / Fast Refresh mengeksekusi ulang module ini) sementara
// IndexedDB masih "closing" memicu error "Database is closing/hidden" di Chrome.
const PERSIST_KEY = "__sinergi_firebase_persistence_";
if (typeof window !== "undefined" && !g[PERSIST_KEY]) {
  g[PERSIST_KEY] = true;
  const persistence = /firefox/i.test(navigator.userAgent)
    ? browserSessionPersistence
    : browserLocalPersistence;
  setPersistence(auth, persistence).catch(() => {
    // non-fatal: fallback ke persistence default Firebase
  });
}