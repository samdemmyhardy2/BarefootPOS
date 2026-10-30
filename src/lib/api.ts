import axios from "axios";
import { AUTH_EXPIRED_EVENT } from "./authEvents";

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

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      localStorage.removeItem("restaurant-access-token");
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
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
    if (!error.response)
      return "Could not reach the restaurant server. Check your connection and API URL.";
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
