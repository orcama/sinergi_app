/**
 * Resolve the browser-facing FastAPI origin once for every frontend feature.
 * App Hosting currently supplies NEXT_PUBLIC_BACKEND_URL; the chat-specific
 * variable remains supported for local overrides and backwards compatibility.
 */
const PRODUCTION_BACKEND_URL = "https://api.legal-verse.id";
const LOCAL_BACKEND_URL = "http://127.0.0.1:8001";

type BackendEnv = {
  NEXT_PUBLIC_CHAT_API_URL?: string;
  NEXT_PUBLIC_BACKEND_URL?: string;
  NEXT_PUBLIC_API_BASE_URL?: string;
  NODE_ENV?: string;
};

function isHttpOrigin(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value.trim());
    return (url.protocol === "http:" || url.protocol === "https:") && !!url.host;
  } catch {
    return false;
  }
}

export function resolveBackendUrl(env: BackendEnv): string {
  const configured = [
    env.NEXT_PUBLIC_CHAT_API_URL,
    env.NEXT_PUBLIC_BACKEND_URL,
    env.NEXT_PUBLIC_API_BASE_URL,
  ].find(isHttpOrigin);
  if (configured) return configured.replace(/\/+$/, "");
  return env.NODE_ENV === "production" ? PRODUCTION_BACKEND_URL : LOCAL_BACKEND_URL;
}

export const BACKEND_URL = resolveBackendUrl({
  NEXT_PUBLIC_CHAT_API_URL: process.env.NEXT_PUBLIC_CHAT_API_URL,
  NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL,
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NODE_ENV: process.env.NODE_ENV,
});
