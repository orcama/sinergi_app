"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { apiClient } from "@/lib/api";

export const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  "auth/user-not-found": "Email belum terdaftar",
  "auth/wrong-password": "Password salah",
  "auth/invalid-credential": "Email atau password salah",
  "auth/email-already-in-use": "Email sudah digunakan",
  "auth/popup-closed-by-user": "Login Google dibatalkan",
  "auth/popup-blocked": "Popup Google diblokir browser",
  "auth/cancelled-popup-request": "Login Google dibatalkan",
  "auth/unauthorized-domain": "Domain belum terdaftar untuk login Google",
  "auth/operation-not-allowed": "Metode login Google belum diaktifkan",
  "auth/account-exists-with-different-credential":
    "Email sudah terdaftar dengan metode login lain",
  "auth/network-request-failed": "Gagal terhubung ke internet",
};

export function translateFirebaseError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code && FIREBASE_ERROR_MESSAGES[code]) {
    return FIREBASE_ERROR_MESSAGES[code];
  }
  console.error("Unhandled auth error:", code ?? error);
  return "Terjadi kesalahan. Silakan coba lagi.";
}

async function syncUser(user: User): Promise<void> {
  // Sinkronisasi profil ke backend tidak fatal: login tetap dianggap sukses
  // meskipun backend /auth/sync gagal (mis. server mati atau CORS).
  try {
    await apiClient.post("/auth/sync", null, {
      headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    });
  } catch (err) {
    console.error("syncUser failed:", err);
  }
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginGoogle: () => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await syncUser(cred.user);
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (name.trim()) {
        try {
          await updateProfile(cred.user, { displayName: name.trim() });
        } catch (err) {
          console.error("updateProfile failed:", err);
        }
      }
      await syncUser(cred.user);
    },
    []
  );

  const loginGoogle = useCallback(async () => {
    const cred = await signInWithPopup(auth, googleProvider);
    await syncUser(cred.user);
  }, []);

  const logout = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const getIdToken = useCallback(async () => {
    if (!user) throw new Error("Not authenticated");
    return user.getIdToken();
  }, [user]);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, loginGoogle, register, logout, getIdToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}