import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import { useAuth } from "@/lib/auth-context";
import { auth } from "@/lib/firebase";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000";

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

  return instance;
}

const client = api();

// Hook: kembalikan axios instance yang sudah terautentikasi.
export function useApi(): AxiosInstance {
  useAuth(); // pastikan AuthProvider sudah siap
  return client;
}

export { client as apiClient };