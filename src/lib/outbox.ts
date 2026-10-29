import axios from "axios";
import { api, errorMessage } from "./api";

const STORAGE_KEY = "restaurant-outbox";
const CHANGE_EVENT = "restaurant-outbox";

export class SavedLocallyError extends Error {
  constructor() {
    super("Saved on this device. It will send when the connection returns.");
    this.name = "SavedLocallyError";
  }
}

export type OutboxItem = {
  id: string;
  scope: string;
  url: string;
  body: Record<string, unknown>;
  label: string;
  createdAt: string;
  status: "pending" | "blocked";
  lastError?: string;
  dedupeKey?: string;
};

function read(): OutboxItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: OutboxItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function listOutbox() {
  return read();
}

export function dismissOutbox(id: string) {
  write(read().filter((item) => item.id !== id));
}

function remember(item: OutboxItem) {
  const items = read().filter((entry) => entry.id !== item.id);
  items.push(item);
  write(items);
}

function isNetwork(error: unknown) {
  return axios.isAxiosError(error) && !error.response;
}

async function send(item: OutboxItem) {
  const { data } = await api.post(item.url, { ...item.body, clientRequestId: item.id });
  write(read().filter((entry) => entry.id !== item.id));
  return data;
}

export async function postOnce<T>(entry: { scope: string; url: string; body: Record<string, unknown>; label: string; dedupeKey?: string }): Promise<T> {
  if (entry.dedupeKey) {
    const existing = read().find((item) => item.dedupeKey === entry.dedupeKey);
    if (existing?.status === "pending") throw new SavedLocallyError();
    if (existing?.status === "blocked") throw new Error(existing.lastError || "This action is waiting for attention on this device.");
  }
  const item: OutboxItem = {
    id: crypto.randomUUID(),
    scope: entry.scope,
    url: entry.url,
    body: entry.body,
    label: entry.label,
    createdAt: new Date().toISOString(),
    status: "pending",
    dedupeKey: entry.dedupeKey,
  };
  remember(item);
  try {
    return await send(item) as T;
  } catch (error) {
    if (isNetwork(error)) throw new SavedLocallyError();
    const status = axios.isAxiosError(error) ? error.response?.status ?? 0 : 0;
    if (status >= 400 && status < 500) {
      remember({ ...item, status: "blocked", lastError: errorMessage(error) });
    }
    throw error;
  }
}

let flushing = false;
export async function flushOutbox() {
  if (flushing) return;
  flushing = true;
  try {
    for (const item of read().filter((entry) => entry.status === "pending")) {
      try {
        await send(item);
      } catch (error) {
        if (isNetwork(error)) break;
        const status = axios.isAxiosError(error) ? error.response?.status ?? 0 : 0;
        if (status >= 400 && status < 500) remember({ ...item, status: "blocked", lastError: errorMessage(error) });
      }
    }
  } finally {
    flushing = false;
  }
}

export function watchOutbox(onChange: () => void) {
  const refresh = () => onChange();
  const online = () => { void flushOutbox(); };
  window.addEventListener(CHANGE_EVENT, refresh);
  window.addEventListener("online", online);
  const timer = window.setInterval(() => void flushOutbox(), 20000);
  void flushOutbox();
  return () => {
    window.removeEventListener(CHANGE_EVENT, refresh);
    window.removeEventListener("online", online);
    window.clearInterval(timer);
  };
}
