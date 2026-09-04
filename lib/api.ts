import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import { useAuth } from "@/lib/auth-context";
import { auth } from "@/lib/firebase";
import { BACKEND_URL } from "@/lib/backend-url";

export const API_BASE_URL = BACKEND_URL;

let onVerificationRejected: (() => void) | null = null;

export function setVerificationRejectedHandler(handler: (() => void) | null) {
  onVerificationRejected = handler;
}

function api(): AxiosInstance {
  const instance = axios.create({ baseURL: API_BASE_URL });

  instance.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error?.response?.status;
      const detail: unknown = error?.response?.data?.detail;
      if (status === 403 && typeof detail === "string" && detail.includes("verifikasi")) {
        // Status verifikasi berubah di tengah sesi (mis. dicabut admin):
        // minta auth-context memuat ulang status → UI otomatis pindah ke layar
        // "Menunggu Verifikasi".
        onVerificationRejected?.();
      }
      return Promise.reject(error);
    }
  );

  return instance;
}

const client = api();

// Hook: kembalikan axios instance yang sudah terautentikasi.
export function useApi(): AxiosInstance {
  useAuth(); // pastikan AuthProvider sudah siap
  return client;
}

export { client as apiClient };
