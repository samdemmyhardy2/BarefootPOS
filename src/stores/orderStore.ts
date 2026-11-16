import { create } from "zustand";
import { api } from "../lib/api";
import { listOutbox, postOnce } from "../lib/outbox";
import type { MenuItem, Order, OrderPaymentMethod, OrderStatus } from "../lib/types";

const ORDERS_KEY = "restaurant-orders-cache";
function readCachedOrders(): Order[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ORDERS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed as Order[] : [];
  } catch {
    return [];
  }
}
function writeCachedOrders(orders: Order[]) {
  try { localStorage.setItem(ORDERS_KEY, JSON.stringify(orders)); } catch { /* The ticket is still held in memory for this visit. */ }
}
function deskMenu() {
  const map = new Map<string, MenuItem>();
  try {
    const parsed = JSON.parse(localStorage.getItem("restaurant-order-desk") ?? "null") as { categories?: { name: string; items?: MenuItem[] }[] } | null;
    for (const category of parsed?.categories ?? []) {
      for (const item of category.items ?? []) map.set(item.id, { ...item, category: item.category ?? { id: item.categoryId, name: category.name } });
    }
  } catch { /* Dish names fall back until the menu cache is available. */ }
  return map;
}
function blankDish(id: string): MenuItem {
  return { id, name: "Saved dish", price: 0, allergens: [], allergensMy: [], allergensTh: [], dietaryInfo: [], dietaryInfoMy: [], dietaryInfoTh: [], availableExtras: [], availableExtrasMy: [], availableExtrasTh: [], position: 0, categoryId: "" };
}
function heldOrders(): Order[] {
  const menu = deskMenu();
  return listOutbox().filter((item) => item.status === "pending" && item.scope === "order.create").map((item) => {
    const lines = Array.isArray(item.body.items) ? item.body.items as { menuItemId?: string; quantity?: number; specialNotes?: string }[] : [];
    const orderLines = lines.map((line, index) => {
      const menuItem = (line.menuItemId && menu.get(line.menuItemId)) || blankDish(line.menuItemId || `held-${index}`);
      const quantity = Number(line.quantity) || 1;
      const unitPrice = Number(menuItem.price) || 0;
      return { id: `local-line-${item.id}-${index}`, menuItemId: menuItem.id, quantity, unitPrice, subtotal: unitPrice * quantity, specialNotes: line.specialNotes ?? null, modifierSelections: [], menuItem };
    });
    return {
      id: `local-${item.id}`,
      tableId: typeof item.body.tableId === "string" ? item.body.tableId : null,
      roomStayId: null,
      paymentMethod: "CASH",
      paymentStatus: "UNPAID",
      waiterId: "local",
      waiter: { id: "local", name: "This device" },
      status: "PENDING",
      totalAmount: orderLines.reduce((sum, line) => sum + Number(line.subtotal), 0),
      items: orderLines,
      createdAt: item.createdAt,
      updatedAt: item.createdAt,
    } satisfies Order;
  });
}
function mergeHeldOrders(orders: Order[]) {
  const held = heldOrders();
  const heldIds = new Set(held.map((order) => order.id));
  const kept = orders.filter((order) => !String(order.id).startsWith("local-") || heldIds.has(order.id));
  const seen = new Set(kept.map((order) => order.id));
  return [...held.filter((order) => !seen.has(order.id)), ...kept];
}
import { useAuthStore } from "./authStore";
import { useUiStore } from "./uiStore";

type LiveState = "connecting" | "live" | "offline";
interface OrderState {
  orders: Order[];
  liveState: LiveState;
  loading: boolean;
  source: EventSource | null;
  reconnectTimer: number | null;
  reconnectAttempt: number;
  fetchOrders: () => Promise<void>;
  connectLive: () => Promise<void>;
  disconnectLive: () => void;
  createOrder: (
    location: { tableId?: string; tableSplitId?: string; roomStayId?: string; paymentMethod?: OrderPaymentMethod; type?: "DINE_IN" | "ROOM_SERVICE" | "PICKUP" },
    items: Array<{
      menuItemId: string;
      quantity: number;
      unitPrice?: number;
      removeIngredients?: string;
      addExtras?: string;
      selectedAllergens?: string[];
      modifierSelections?: { groupId: string; optionIds: string[] }[];
      specialNotes?: string;
      kitchenFlag?: boolean;
    }>,
  ) => Promise<Order>;
  changeStatus: (id: string, status: OrderStatus) => Promise<void>;
  cookAction: (
    id: string,
    action: "prepare" | "ready" | "served" | "revert",
  ) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  upsertOrder: (order: Order) => void;
}

function eventSourceUrl(token: string) {
  const base = import.meta.env.VITE_API_URL || "/api";
  const url = new URL(
    `${base.replace(/\/$/, "")}/orders/events`,
    window.location.origin,
  );
  url.searchParams.set("streamToken", token);
  return url.toString();
}

let alertContext: AudioContext | null = null;
let alertEnabled = false;
const alertWatchers = new Set<() => void>();

function alertAudio() {
  const AudioContextConstructor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  alertContext ??= new AudioContextConstructor();
  return alertContext;
}

function markAlerts(enabled: boolean) {
  if (alertEnabled === enabled) return;
  alertEnabled = enabled;
  alertWatchers.forEach((listener) => listener());
}

export function orderAlertsEnabled() {
  return alertEnabled && alertAudio()?.state === "running";
}

export function watchOrderAlerts(listener: () => void) {
  alertWatchers.add(listener);
  return () => { alertWatchers.delete(listener); };
}

/** iPad will not play a later alert until the screen has been tapped once. */
export async function enableOrderAlerts() {
  const context = alertAudio();
  if (!context) return false;
  if (context.state === "suspended") await context.resume().catch(() => undefined);
  const running = context.state === "running";
  markAlerts(running);
  return running;
}

if (typeof window !== "undefined") {
  const prime = () => { void enableOrderAlerts(); };
  window.addEventListener("pointerdown", prime, { passive: true });
  window.addEventListener("touchend", prime, { passive: true });
  window.addEventListener("keydown", prime);
}

export async function playOrderAlert(kind: "new" | "ready") {
  try {
    const context = alertAudio();
    if (!context || context.state !== "running") return;
    const notes = kind === "new" ? [784, 988, 784, 1175, 784, 988, 1175] : [659, 880, 659];
    const start = context.currentTime + 0.02;
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = start + index * 0.17;
      oscillator.type = "square";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.72, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.16);
    });
  } catch {
    // A browser can still block audio until the next tap. The order itself is unaffected.
  }
}

let liveAttempt = 0;

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: mergeHeldOrders(readCachedOrders()),
  liveState: "offline",
  loading: false,
  source: null,
  reconnectTimer: null,
  reconnectAttempt: 0,
  fetchOrders: async () => {
    set({ loading: true });
    try {
      const { data } = await api.get<Order[]>("/orders");
      const orders = mergeHeldOrders([...heldOrders(), ...data]);
      writeCachedOrders(orders);
      set({ orders });
    } catch {
      const orders = mergeHeldOrders(get().orders);
      writeCachedOrders(orders);
      set({ orders });
    } finally {
      set({ loading: false });
    }
  },
  connectLive: async () => {
    const current = get().source;
    if (
      current?.readyState === EventSource.OPEN ||
      current?.readyState === EventSource.CONNECTING
    )
      return;
    const attempt = ++liveAttempt;
    set({ liveState: "connecting" });
    try {
      const { data } = await api.get<{ streamToken: string }>(
        "/orders/events/token",
      );
      if (attempt !== liveAttempt) return;
      const latest = get().source;
      if (
        latest?.readyState === EventSource.OPEN ||
        latest?.readyState === EventSource.CONNECTING
      )
        return;
      const source = new EventSource(eventSourceUrl(data.streamToken));
      const stream = source as EventSource & { intentionalClose?: boolean };
      set({ source });
      source.addEventListener("open", () =>
        set({ liveState: "live", reconnectAttempt: 0 }),
      );
      source.addEventListener("snapshot", (raw) => {
        const event = raw as MessageEvent<string>;
        const snapshot = JSON.parse(event.data) as Order[];
        const activeIds = new Set(snapshot.map((order) => order.id));
        set((state) => {
          const orders = mergeHeldOrders([
            ...snapshot,
            ...state.orders.filter((order) => !String(order.id).startsWith("local-") && !activeIds.has(order.id) && (order.status === "COMPLETED" || order.status === "CANCELLED")),
          ]);
          writeCachedOrders(orders);
          return { orders };
        });
      });
      for (const type of ["created", "updated"]) {
        source.addEventListener(type, (raw) => {
          const order = JSON.parse((raw as MessageEvent<string>).data) as Order;
          if (type === "updated" && order.status === "READY" && get().orders.find((current) => current.id === order.id)?.status !== "READY") {
            const user = useAuthStore.getState().user;
            const title = (user?.jobTitle || "").toLowerCase();
            const isCook = /chef|cook|kitchen/.test(title);
            if (user && (user.role === "ADMIN" || !isCook)) {
              const where = order.table?.tableNumber ? `Table ${order.table.tableNumber}` : "A ticket";
              useUiStore.getState().notify(`${where} is ready for pickup.`);
            }
          }
          get().upsertOrder(order);
        });
      }
      source.addEventListener("deleted", (raw) => {
        const { id } = JSON.parse((raw as MessageEvent<string>).data) as {
          id: string;
        };
        set((state) => {
          const orders = mergeHeldOrders(state.orders.filter((order) => order.id !== id));
          writeCachedOrders(orders);
          return { orders };
        });
      });
      source.onerror = () => {
        if (stream.intentionalClose || get().source !== source) return;
        source.close();
        const attempt = get().reconnectAttempt + 1;
        const delay = Math.min(1000 * 2 ** Math.min(attempt, 5), 30_000);
        set({ source: null, liveState: "offline", reconnectAttempt: attempt });
        const timer = window.setTimeout(() => {
          void get().connectLive();
        }, delay);
        set({ reconnectTimer: timer });
      };
    } catch {
      if (attempt !== liveAttempt) return;
      const retry = get().reconnectAttempt + 1;
      const timer = window.setTimeout(
        () => {
          void get().connectLive();
        },
        Math.min(1000 * 2 ** retry, 30_000),
      );
      set({
        liveState: "offline",
        reconnectAttempt: retry,
        reconnectTimer: timer,
      });
    }
  },
  disconnectLive: () => {
    liveAttempt += 1;
    const { source, reconnectTimer } = get();
    if (source) {
      (source as EventSource & { intentionalClose?: boolean }).intentionalClose = true;
      source.close();
    }
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    set({
      source: null,
      reconnectTimer: null,
      liveState: "offline",
      reconnectAttempt: 0,
    });
  },
  createOrder: async (location, items) => {
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    const data = await postOnce<Order>({ scope: "order.create", url: "/orders", body: { ...location, items }, label: `Order · ${count} item${count === 1 ? "" : "s"}` });
    get().upsertOrder(data);
    return data;
  },
  changeStatus: async (id, status) => {
    const { data } = await api.patch<Order>(`/orders/${id}/status`, { status });
    get().upsertOrder(data);
  },
  cookAction: async (id, action) => {
    const data = await postOnce<Order>({ method: "patch", scope: "kitchen.status", url: `/orders/${id}/${action}`, label: `Mark order ${action}`, dedupeKey: `kitchen:${id}:${action}` });
    get().upsertOrder(data);
  },
  deleteOrder: async (id) => {
    await api.delete(`/orders/${id}`);
    set((state) => {
      const orders = mergeHeldOrders(state.orders.filter((order) => order.id !== id));
      writeCachedOrders(orders);
      return { orders };
    });
  },
  upsertOrder: (order) =>
    set((state) => {
      const index = state.orders.findIndex((item) => item.id === order.id);
      const replaced = index === -1 ? [order, ...state.orders] : state.orders.map((item, itemIndex) => itemIndex === index ? { ...item, ...order } : item);
      const orders = mergeHeldOrders(replaced);
      writeCachedOrders(orders);
      return { orders };
    }),
}));
