import { create } from "zustand";
import { api } from "../lib/api";
import type { Order, OrderPaymentMethod, OrderStatus } from "../lib/types";
import { useAuthStore } from "./authStore";

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
    location: { tableId?: string; roomStayId?: string; paymentMethod?: OrderPaymentMethod },
    items: Array<{
      menuItemId: string;
      quantity: number;
      removeIngredients?: string;
      addExtras?: string;
      selectedAllergens?: string[];
      specialNotes?: string;
    }>,
  ) => Promise<Order>;
  changeStatus: (id: string, status: OrderStatus) => Promise<void>;
  cookAction: (
    id: string,
    action: "prepare" | "ready" | "served",
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

async function playOrderTone(kind: "new" | "ready") {
  try {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;
    const context = new AudioContextConstructor();
    await context.resume();
    const notes = kind === "new" ? [740, 880] : [880, 660, 880];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime + index * 0.16;
      oscillator.frequency.value = frequency;
      oscillator.type = "sine";
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.16, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.14);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.15);
    });
    window.setTimeout(() => void context.close(), 900);
  } catch {
    // Browsers may block audio until a user gesture; realtime order updates remain active.
  }
}

function playRoleNotification(kind: "new" | "ready") {
  const user = useAuthStore.getState().user;
  if (!user) return;
  const title = (user.jobTitle || "").toLowerCase();
  const isCook = /chef|cook|kitchen/.test(title);
  const isWaiter = /waiter|server|welcomer|floor/.test(title) || (!isCook && user.role === "EMPLOYEE");
  if ((kind === "new" && (user.role === "ADMIN" || isCook)) || (kind === "ready" && (user.role === "ADMIN" || isWaiter))) void playOrderTone(kind);
}

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: [],
  liveState: "offline",
  loading: false,
  source: null,
  reconnectTimer: null,
  reconnectAttempt: 0,
  fetchOrders: async () => {
    set({ loading: true });
    try {
      const { data } = await api.get<Order[]>("/orders");
      set({ orders: data });
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
    set({ liveState: "connecting" });
    try {
      const { data } = await api.get<{ streamToken: string }>(
        "/orders/events/token",
      );
      const source = new EventSource(eventSourceUrl(data.streamToken));
      set({ source });
      source.addEventListener("open", () =>
        set({ liveState: "live", reconnectAttempt: 0 }),
      );
      source.addEventListener("snapshot", (raw) => {
        const event = raw as MessageEvent<string>;
        const snapshot = JSON.parse(event.data) as Order[];
        set({ orders: snapshot });
      });
      for (const type of ["created", "updated"]) {
        source.addEventListener(type, (raw) => {
          const order = JSON.parse((raw as MessageEvent<string>).data) as Order;
          if (type === "created") playRoleNotification("new");
          if (type === "updated" && order.status === "READY" && get().orders.find((current) => current.id === order.id)?.status !== "READY") playRoleNotification("ready");
          get().upsertOrder(order);
        });
      }
      source.addEventListener("deleted", (raw) => {
        const { id } = JSON.parse((raw as MessageEvent<string>).data) as {
          id: string;
        };
        set((state) => ({
          orders: state.orders.filter((order) => order.id !== id),
        }));
      });
      source.onerror = () => {
        source.close();
        if (get().source !== source) return;
        const attempt = get().reconnectAttempt + 1;
        const delay = Math.min(1000 * 2 ** Math.min(attempt, 5), 30_000);
        set({ source: null, liveState: "offline", reconnectAttempt: attempt });
        const timer = window.setTimeout(() => {
          void get().connectLive();
        }, delay);
        set({ reconnectTimer: timer });
      };
    } catch {
      const attempt = get().reconnectAttempt + 1;
      const timer = window.setTimeout(
        () => {
          void get().connectLive();
        },
        Math.min(1000 * 2 ** attempt, 30_000),
      );
      set({
        liveState: "offline",
        reconnectAttempt: attempt,
        reconnectTimer: timer,
      });
    }
  },
  disconnectLive: () => {
    const { source, reconnectTimer } = get();
    if (source) source.close();
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    set({
      source: null,
      reconnectTimer: null,
      liveState: "offline",
      reconnectAttempt: 0,
    });
  },
  createOrder: async (location, items) => {
    const { data } = await api.post<Order>("/orders", { ...location, items });
    get().upsertOrder(data);
    return data;
  },
  changeStatus: async (id, status) => {
    const { data } = await api.patch<Order>(`/orders/${id}/status`, { status });
    get().upsertOrder(data);
  },
  cookAction: async (id, action) => {
    const { data } = await api.patch<Order>(`/orders/${id}/${action}`);
    get().upsertOrder(data);
  },
  deleteOrder: async (id) => {
    await api.delete(`/orders/${id}`);
    set((state) => ({
      orders: state.orders.filter((order) => order.id !== id),
    }));
  },
  upsertOrder: (order) =>
    set((state) => {
      const index = state.orders.findIndex((item) => item.id === order.id);
      if (index === -1) return { orders: [order, ...state.orders] };
      const orders = [...state.orders];
      orders[index] = { ...orders[index], ...order };
      return { orders };
    }),
}));
