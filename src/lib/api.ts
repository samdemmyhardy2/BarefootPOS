import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { AUTH_EXPIRED_EVENT } from "./authEvents";
import { cacheable, readResponse, saveResponse, setSavedView } from "./offlineCache";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  headers: { "Content-Type": "application/json" },
  timeout: 15_000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("restaurant-access-token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Offline copies are keyed by path and query only, so a changed LAN address still finds them. */
function offlineKey(config: InternalAxiosRequestConfig) {
  const json = !config.responseType || config.responseType === "json";
  if (config.method?.toLowerCase() !== "get" || !json || !config.url || !cacheable(config.url)) return null;
  return api.getUri({ ...config, baseURL: "" });
}

api.interceptors.response.use(
  (response) => {
    const key = offlineKey(response.config);
    if (key) {
      void saveResponse(key, response.data);
      setSavedView(null);
    }
    return response;
  },
  async (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      localStorage.removeItem("restaurant-access-token");
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    // The server could not be reached: show the last copy this device saved, view-only.
    if (axios.isAxiosError(error) && !error.response && !axios.isCancel(error) && error.config) {
      const key = offlineKey(error.config);
      const saved = key ? await readResponse(key) : null;
      if (saved) {
        setSavedView(saved.savedAt);
        return { data: saved.data, status: 200, statusText: "Saved copy", headers: {}, config: error.config } satisfies AxiosResponse;
      }
    }
    return Promise.reject(error);
  },
);

export function errorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
) {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    const message = data && typeof data === "object" ? (data as { message?: unknown }).message : undefined;
    if (Array.isArray(message)) {
      const text = message.filter((item) => typeof item === "string").join(", ");
      if (text) return text;
    }
    if (typeof message === "string" && message.trim()) return message;
    if (typeof data === "string" && data.trim() && !data.trim().startsWith("<")) return data.trim();
    if (!error.response && typeof navigator !== "undefined" && navigator.onLine === false)
      return "You are offline. Saved data is view-only until the connection returns.";
    if (!error.response)
      return "Could not reach the restaurant server. Check your connection and API URL.";
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
