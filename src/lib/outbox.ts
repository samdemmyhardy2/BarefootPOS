import axios from "axios";
import { api, errorMessage } from "./api";

const STORAGE_KEY = "restaurant-outbox";
const CHANGE_EVENT = "restaurant-outbox";

export class SavedLocallyError extends Error {
  readonly requestId: string;
  constructor(requestId = "") {
    super("Saved on this device. It will send when the connection returns.");
    this.name = "SavedLocallyError";
    this.requestId = requestId;
  }
}

export type OutboxItem = {
  id: string;
  scope: string;
  method?: "post" | "patch" | "delete";
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

export function retargetQueuedTable(fromId: string, toId: string) {
  const current = read();
  const next = current.map((item) => item.scope === "order.create" && item.body.tableId === fromId ? { ...item, body: { ...item.body, tableId: toId } } : item);
  if (next.some((item, index) => item !== current[index])) write(next);
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

export function localUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function offlineNow() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function send(item: OutboxItem) {
  const payload = { ...item.body, clientRequestId: item.id };
  const method = item.method ?? "post";
  const { data } = method === "delete"
    ? await api.delete(item.url)
    : method === "patch"
      ? await api.patch(item.url, payload)
      : await api.post(item.url, payload);
  write(read().filter((entry) => entry.id !== item.id));
  return data;
}

export async function postOnce<T>(entry: { scope: string; method?: OutboxItem["method"]; url: string; body?: Record<string, unknown>; label: string; dedupeKey?: string }): Promise<T> {
  if (entry.dedupeKey) {
    const existing = read().find((item) => item.dedupeKey === entry.dedupeKey);
    if (existing?.status === "pending") throw new SavedLocallyError(existing.id);
    if (existing?.status === "blocked") write(read().filter((item) => item.id !== existing.id));
  }
  const item: OutboxItem = {
    id: localUuid(),
    scope: entry.scope,
    method: entry.method,
    url: entry.url,
    body: entry.body ?? {},
    label: entry.label,
    createdAt: new Date().toISOString(),
    status: "pending",
    dedupeKey: entry.dedupeKey,
  };
  remember(item);
  if (offlineNow()) throw new SavedLocallyError(item.id);
  try {
    return await send(item) as T;
  } catch (error) {
    if (isNetwork(error)) throw new SavedLocallyError(item.id);
    const status = axios.isAxiosError(error) ? error.response?.status ?? 0 : 0;
    if (status >= 400 && status < 500) write(read().filter((entry) => entry.id !== item.id));
    throw error;
  }
}

let flushing = false;
export async function flushOutbox() {
  if (flushing || offlineNow()) return;
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

export function retryOutbox(id: string) {
  const next = read().map((item) => item.id === id && item.status === "blocked" ? { ...item, status: "pending" as const, lastError: undefined } : item);
  write(next);
  void flushOutbox();
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
