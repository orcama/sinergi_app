/**
 * Resolve the browser-facing FastAPI origin once for every frontend feature.
 * App Hosting currently supplies NEXT_PUBLIC_BACKEND_URL; the chat-specific
 * variable remains supported for local overrides and backwards compatibility.
 */
export const BACKEND_URL =
  process.env.NEXT_PUBLIC_CHAT_API_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:8001";
