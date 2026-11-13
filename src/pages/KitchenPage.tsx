



import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ArrowRight,
  ChefHat,
  Clock3,
  Flame,
  Maximize2,
  Menu,
  MessageCircle,
  Minimize2,
  UtensilsCrossed,
} from "lucide-react";

import {
  EmptyState,
  OrderBadge,
  PageHeader,
  Panel,
} from "../components/ui";

import { playOrderAlert, useOrderStore } from "../stores/orderStore";
import { useUiStore } from "../stores/uiStore";
import { api, errorMessage } from "../lib/api";
import { orderCode, orderLocation } from "../lib/types";

import type {
  Order,
  PrepStation,
  PrepTicket,
} from "../lib/types";

import { formatOrderDuration } from "../lib/orderTiming";
import { mediaSrc } from "../lib/media";

// ============================================================
// TYPES & CONSTANTS
// ============================================================

type QueueEntry = {
  order: Order;
  ticket: PrepTicket | null;
};

type KitchenDish = {
  key: string;
  entry: QueueEntry;
  item: PrepTicket["items"][number];
  groupKey: string;
  label: string;
  detail: string;
  count: number;
  first: boolean;
};

const CARD_GAP = 16;

// ============================================================
// LOCATION HELPERS
// ============================================================

const placeName = (order: Order) => {
  if (order.table) {
    const number = order.table.tableNumber;

    return /^table\b/i.test(number)
      ? number
      : `Table ${number}`;
  }

  return orderLocation(order);
};

const placeGroupKey = (order: Order) =>
  placeName(order).trim().toLowerCase();

// ============================================================
// GROUP DISHES BY TABLE / ROOM
// ============================================================

const kitchenDishes = (
  entries: QueueEntry[],
): KitchenDish[] => {
  const groups = new Map<string, QueueEntry[]>();

  for (const entry of entries) {
    const groupKey = placeGroupKey(entry.order);

    const list = groups.get(groupKey);

    if (list) {
      list.push(entry);
    } else {
      groups.set(groupKey, [entry]);
    }
  }

  const ordered = [...groups.entries()].sort(
    (a, b) => {
      const aTime = Math.min(
        ...a[1].map(
          (entry) =>
            +new Date(
              entry.ticket?.createdAt ??
              entry.order.createdAt,
            ),
        ),
      );

      const bTime = Math.min(
        ...b[1].map(
          (entry) =>
            +new Date(
              entry.ticket?.createdAt ??
              entry.order.createdAt,
            ),
        ),
      );

      return aTime - bTime;
    },
  );

  return ordered.flatMap(
    ([groupKey, groupEntries]) => {
      const dishes = groupEntries.flatMap(
        (entry) => {
          const items = entry.ticket?.items?.length
            ? entry.ticket.items
            : entry.order.items.filter((item) => !item.removedAt).map((item) => ({
              menuItemName: item.menuItem.name,
              quantity: item.quantity,
              imageUrl: item.menuItem.imageUrl,
              modifierSelections:
                item.modifierSelections ?? [],
              removeIngredients:
                item.removeIngredients,
              addExtras: item.addExtras,
              specialNotes: item.specialNotes,
              selectedAllergens:
                item.selectedAllergens,
              kitchenFlag: item.kitchenFlag,
            }));

          return items.flatMap((item, itemIndex) => {
            const copies = Math.max(1, Number(item.quantity) || 1);
            return Array.from({ length: copies }, (_, copy) => ({
              key: `${entry.ticket?.id ?? entry.order.id}-${itemIndex}-${copy}`,
              entry,
              item: { ...item, quantity: 1 },
            }));
          });
        },
      );

      const label = placeName(
        groupEntries[0].order,
      );

      const uniqueTickets = new Set(
        groupEntries.map(
          ({ order, ticket }) =>
            ticket?.id ?? order.id,
        ),
      );

      const count = uniqueTickets.size;

      const detail = `${count} ${count === 1 ? "ticket" : "tickets"
        }`;

      return dishes.map((dish, index) => ({
        ...dish,
        groupKey,
        label,
        detail,
        count,
        first: index === 0,
      }));
    },
  );
};

// GLOBAL KITCHEN BOARD
// ============================================================

function KitchenBoard({
  entries,
  cols,
  now,
  busy,
  onPickup,
}: {
  entries: QueueEntry[];
  cols: number;
  now: number;
  busy: string | null;
  onPickup: (
    orderId: string,
    ticketId: string | null,
  ) => void;
}) {
  const dishes = useMemo(
    () => kitchenDishes(entries),
    [entries],
  );
  const groups = useMemo(() => {
    const buckets: { key: string; label: string; dishes: KitchenDish[] }[] = [];
    for (const dish of dishes) {
      const last = buckets[buckets.length - 1];
      if (last?.key === dish.groupKey) last.dishes.push(dish);
      else buckets.push({ key: dish.groupKey, label: dish.label, dishes: [dish] });
    }
    const time = (dish: KitchenDish) => +new Date(dish.entry.ticket?.createdAt ?? dish.entry.order.createdAt);
    return buckets
      .map((group) => ({ ...group, dishes: [...group.dishes].sort((left, right) => time(left) - time(right)) }))
      .sort((left, right) => time(left.dishes[0]) - time(right.dishes[0]));
  }, [dishes]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <section key={group.key} className="relative rounded-[28px] border-2 border-[#f7a8d0] bg-[#fff7fb] px-3 pb-3 pt-5">
            <p className="absolute left-1/2 top-0 z-10 max-w-[80%] -translate-x-1/2 -translate-y-1/2 truncate rounded-full bg-white px-3 text-center text-sm font-extrabold tracking-tight text-[#9a084f]">{group.label}</p>
            <div
              className="grid content-start items-start"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gap: CARD_GAP,
              }}
            >
          {group.dishes.map((dish) => {
            const { order, ticket } = dish.entry;

            const ticketKey =
              ticket?.id ?? order.id;

            const item = dish.item;

            const noteParts = (
              item.specialNotes ?? ""
            )
              .split(" · ")
              .map((part) => part.trim())
              .filter(Boolean);

            const kitchenNotes = noteParts
              .filter((part) =>
                part
                  .toLowerCase()
                  .startsWith("order note:"),
              )
              .map((part) =>
                part.replace(
                  /^order note:\s*/i,
                  "",
                ),
              );

            const otherNotes = noteParts.filter(
              (part) =>
                !part
                  .toLowerCase()
                  .startsWith("order note:"),
            );

            const image =
              item.imageUrl ||
              order.items.find(
                (line) =>
                  line.menuItem.name ===
                  item.menuItemName,
              )?.menuItem.imageUrl ||
              null;

            const minutesAgo = Math.max(0, Math.floor((now - +new Date(order.createdAt)) / 60000));
            const imageHeight = cols === 4 ? "h-44" : "h-56";
            const detailLines = [
              ...(item.modifierSelections ?? []).map((selection) => ({
                key: selection.groupId,
                label: selection.groupName,
                value: selection.options.map((option) => option.name).join(", "),
              })),
              ...(item.removeIngredients ? [{ key: "remove", label: "No", value: item.removeIngredients }] : []),
              ...(item.addExtras ? [{ key: "extra", label: "Extra", value: item.addExtras }] : []),
              ...(item.selectedAllergens?.length ? [{ key: "allergens", label: "Allergens", value: item.selectedAllergens.join(", ") }] : []),
              ...kitchenNotes.map((note) => ({ key: `kitchen-${note}`, label: "Kitchen note", value: note })),
              ...otherNotes.map((note) => ({ key: `note-${note}`, label: "Note", value: note })),
            ];

            return (
              <div
                key={dish.key}
                className="min-w-0 self-start"
              >
                <button
                  type="button"
                  disabled={busy === ticketKey}
                  onClick={() =>
                    onPickup(
                      order.id,
                      ticket?.id ?? null,
                    )
                  }
                  className="flex w-full flex-col rounded-[22px] bg-white text-left shadow-card disabled:opacity-60"
                >
                  <div className={`relative w-full shrink-0 overflow-hidden rounded-t-[22px] bg-gradient-to-b from-[#f8c6e2] via-[#e48cb8] to-[#c45d90] ${imageHeight}`}>
                    {image ? (
                      <img
                        src={mediaSrc(image)}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center text-[#f6d5e6]">
                        <UtensilsCrossed size={42} strokeWidth={1.6} />
                      </div>
                    )}
                    <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[#2b1c27]/75 px-2.5 py-1 text-[11px] font-semibold text-white">
                      <Clock3 size={12} />
                      {minutesAgo} min ago
                    </span>
                  </div>
                  <div className="space-y-1 bg-white px-4 py-3.5">
                    <p className="flex items-start gap-2 font-display text-[1.45rem] font-extrabold leading-normal text-ink">
                      <span className="min-w-0 flex-1 whitespace-normal break-words">{item.menuItemName}</span>
                      {item.kitchenFlag && <MessageCircle className="comment-glow mt-1 h-9 w-9 shrink-0" aria-label="Kitchen comment" />}
                    </p>
                    {detailLines.map((line) => (
                      <p key={line.key} className="text-lg leading-6 text-[#8d7a83]">
                        {line.label}: <span className="font-bold text-[#e21888]">{line.value}</span>
                      </p>
                    ))}
                  </div>
                </button>
              </div>
            );
          })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// KITCHEN PAGE
// ============================================================

export function KitchenPage({
  station,
  standalone = false,
}: {
  station: PrepStation;
  standalone?: boolean;
}) {
  const orders = useOrderStore(
    (state) => state.orders,
  );

  const liveState = useOrderStore(
    (state) => state.liveState,
  );

  const cookAction = useOrderStore(
    (state) => state.cookAction,
  );

  const upsertOrder = useOrderStore(
    (state) => state.upsertOrder,
  );

  const notify = useUiStore(
    (state) => state.notify,
  );

  const setSidebarOpen = useUiStore(
    (state) => state.setSidebarOpen,
  );

  const [busy, setBusy] = useState<string | null>(
    null,
  );

  const [error, setError] = useState("");

  const [now, setNow] = useState(Date.now());

  const [rows, setRows] = useState<3 | 4>(3);

  const [fullScreen, setFullScreen] =
    useState(false);

  const [openOrders, setOpenOrders] = useState<Order[]>([]);

  const [openLive, setOpenLive] = useState<"connecting" | "live" | "offline">("connecting");

  const seenKitchenTickets = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!standalone || station !== "KITCHEN" || openLive !== "live") return;
    const ids = new Set(openOrders.flatMap((order) => {
      if (order.status === "COMPLETED" || order.status === "CANCELLED") return [];
      const tickets = (order.prepTickets ?? []).filter((ticket) => ticket.station === "KITCHEN" && (ticket.status === "PENDING" || ticket.status === "PREPARING"));
      if (tickets.length) return tickets.map((ticket) => ticket.id);
      return ["PENDING", "PREPARING"].includes(order.status) ? [order.id] : [];
    }));
    const seen = seenKitchenTickets.current;
    seenKitchenTickets.current = ids;
    if (!seen) return;
    if ([...ids].some((id) => !seen.has(id))) void playOrderAlert("new");
  }, [openLive, openOrders, standalone, station]);

  useEffect(() => {
    if (!standalone) return;
    let stop = false;
    const load = async () => {
      try {
        const { data } = await api.get<Order[]>("/orders/kitchen/prep-queue");
        if (stop) return;
        setOpenOrders(data);
        setOpenLive("live");
      } catch (reason) {
        if (stop) return;
        setOpenLive("offline");
        setError(errorMessage(reason));
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [standalone]);

  // Update elapsed time.
  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Date.now()),
      1000,
    );

    return () => window.clearInterval(timer);
  }, []);

  // Fullscreen listener.
  useEffect(() => {
    const sync = () =>
      setFullScreen(
        document.fullscreenElement != null,
      );

    document.addEventListener(
      "fullscreenchange",
      sync,
    );

    return () =>
      document.removeEventListener(
        "fullscreenchange",
        sync,
      );
  }, []);

  // Toggle fullscreen.
  const toggleScreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }

    const root = document.documentElement;

    const request =
      root.requestFullscreen?.bind(root) ??
      (
        root as HTMLElement & {
          webkitRequestFullscreen?: () => void;
        }
      ).webkitRequestFullscreen?.bind(root);

    void request?.();
  };

  // ==========================================================
  // PREPARATION QUEUES
  // ==========================================================

  const queues = useMemo<
    Record<PrepStation, QueueEntry[]>
  >(() => {
    const source = standalone ? openOrders : orders;
    const entries = (target: PrepStation) =>
      source
        .flatMap<QueueEntry>((order) => {
          if (
            order.status === "COMPLETED" ||
            order.status === "CANCELLED"
          ) {
            return [];
          }

          const stationTickets = (
            order.prepTickets ?? []
          ).filter(
            (ticket) =>
              ticket.station === target &&
              ["PENDING", "PREPARING"].includes(
                ticket.status,
              ),
          );

          if (stationTickets.length) {
            return stationTickets.map(
              (ticket) => ({
                order,
                ticket,
              }),
            );
          }

          if (
            target === "KITCHEN" &&
            !order.prepTickets?.length &&
            ["PENDING", "PREPARING"].includes(
              order.status,
            ) &&
            order.items.some((item) => !item.removedAt)
          ) {
            return [
              {
                order,
                ticket: null,
              },
            ];
          }

          return [];
        })
        .sort(
          (a, b) =>
            +new Date(
              a.ticket?.createdAt ??
              a.order.createdAt,
            ) -
            +new Date(
              b.ticket?.createdAt ??
              b.order.createdAt,
            ),
        );

    return {
      KITCHEN: entries("KITCHEN"),
      BAR: entries("BAR"),
      NONE: [],
    };
  }, [orders, openOrders, standalone]);

  const queue = queues[station];

  // ==========================================================
  // START PREPARING / MARK READY
  // ==========================================================

  const advance = async (
    targetStation: PrepStation,
    orderId: string,
    ticketId: string | null,
    action: "prepare" | "ready",
  ) => {
    setBusy(ticketId ?? orderId);
    setError("");

    try {
      if (ticketId) {
        const { data } = await api.patch(
          `/orders/${targetStation.toLowerCase()}/tickets/${ticketId}/${action}`,
        );

        upsertOrder(data);
      } else {
        await cookAction(orderId, action);
      }

      notify(
        action === "ready"
          ? `${targetStation === "BAR"
            ? "Bar"
            : "Kitchen"
          } ticket is ready.`
          : `${targetStation === "BAR"
            ? "Bar"
            : "Kitchen"
          } ticket accepted.`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  // ==========================================================
  // PICKUP
  // ==========================================================

  const pickup = async (
    orderId: string,
    ticketId: string | null,
  ) => {
    const ticketKey = ticketId ?? orderId;

    setBusy(ticketKey);
    setError("");

    try {
      const { data } = await api.patch<Order>(
        ticketId
          ? `/orders/kitchen/tickets/${ticketId}/pickup`
          : `/orders/kitchen/orders/${orderId}/pickup`,
      );

      upsertOrder(data);
      if (standalone) {
        setOpenOrders((current) => data.status === "SERVED" || data.status === "COMPLETED" || data.status === "CANCELLED"
          ? current.filter((order) => order.id !== data.id)
          : current.map((order) => order.id === data.id ? data : order));
      }

      notify("Picked up.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  // ==========================================================
  // BAR TICKET CARDS
  // ==========================================================

  const renderTicketCards = (
    targetStation: PrepStation,
    entries: QueueEntry[],
  ) => (
    <div className="grid gap-4 2xl:grid-cols-2">
      {entries.map(({ order, ticket }) => {
        const status =
          ticket?.status ?? order.status;

        const ticketItems =
          ticket?.items ??
          order.items.filter((item) => !item.removedAt).map((item) => ({
            menuItemName: item.menuItem.name,
            quantity: item.quantity,
            modifierSelections:
              item.modifierSelections ?? [],
            removeIngredients:
              item.removeIngredients,
            addExtras: item.addExtras,
            specialNotes: item.specialNotes,
            selectedAllergens:
              item.selectedAllergens,
            kitchenFlag: item.kitchenFlag,
          }));

        const ticketKey =
          ticket?.id ?? order.id;

        return (
          <Panel
            key={ticketKey}
            className="overflow-hidden"
          >
            <div
              className={`h-1.5 ${status === "PENDING"
                ? "bg-amber-400"
                : "bg-sky-400"
                }`}
            />

            <div className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[22px] font-extrabold tracking-tight">
                      {orderLocation(order)}
                    </span>

                    <OrderBadge status={status} />
                  </div>

                  <p className="mt-1 font-mono text-[10px] text-muted">
                    Order #{orderCode(order)}
                  </p>

                  <p className="mt-1 text-[11px] font-semibold text-olive">
                    {status === "PREPARING"
                      ? "Preparing"
                      : "Waiting to start"}
                    :{" "}
                    {formatOrderDuration(
                      status === "PREPARING"
                        ? ticket?.preparingAt ??
                        order.preparingAt ??
                        order.createdAt
                        : order.createdAt,
                      now,
                    )}
                  </p>
                </div>

                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                  <Clock3 size={13} />

                  {Math.max(
                    0,
                    Math.floor(
                      (Date.now() -
                        +new Date(order.createdAt)) /
                      60000,
                    ),
                  )}{" "}
                  min ago
                </span>
              </div>

              <div className="my-4 space-y-3 border-y border-dashed border-line py-4">
                {ticketItems.map((item, index) => {
                  const sourceItem = order.items.find(
                    (line) =>
                      line.menuItem.name ===
                      item.menuItemName,
                  );

                  const barOptions =
                    item.modifierSelections?.flatMap(
                      (selection) =>
                        selection.options.map(
                          (option) => option.name,
                        ),
                    ) ?? [];

                  const isBarModifierTicket =
                    targetStation === "BAR" &&
                    sourceItem?.menuItem.prepStation !==
                    "BAR" &&
                    barOptions.length > 0;

                  return (
                    <div
                      key={`${ticketKey}-${index}`}
                      className="flex gap-3"
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#edf2e9] text-xs font-bold text-olive">
                        {item.quantity}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-bold">
                          <span className="min-w-0">{isBarModifierTicket ? barOptions[0] : item.menuItemName}</span>
                          {item.kitchenFlag && <MessageCircle className="comment-glow h-6 w-6 shrink-0" aria-label="Kitchen comment" />}
                        </p>

                        {isBarModifierTicket ? (
                          <>
                            <div className="ml-3 mt-1 space-y-1 border-l border-[#f3cade] pl-2">
                              {barOptions
                                .slice(1)
                                .map(
                                  (name, optionIndex) => (
                                    <p
                                      key={`${name}-${optionIndex}`}
                                      className="text-base font-semibold leading-5 text-[#4d3b44]"
                                    >
                                      {name}
                                    </p>
                                  ),
                                )}
                            </div>

                            <p className="mt-1 text-[11px] font-semibold text-muted">
                              Part of {item.menuItemName}
                            </p>
                          </>
                        ) : (
                          item.modifierSelections?.map(
                            (selection) => (
                              <p
                                key={selection.groupId}
                                className="mt-1 text-base font-semibold leading-5 text-[#4d3b44]"
                              >
                                {selection.groupName}:{" "}
                                {selection.options
                                  .map(
                                    (option) =>
                                      option.name,
                                  )
                                  .join(", ")}
                              </p>
                            ),
                          )
                        )}

                        {item.removeIngredients && (
                          <p className="mt-1 text-[11px] text-[#ba694b]">
                            No: {item.removeIngredients}
                          </p>
                        )}

                        {item.addExtras && (
                          <p className="mt-1 text-[11px] text-olive">
                            Extra: {item.addExtras}
                          </p>
                        )}

                        {item.selectedAllergens?.length ? (
                          <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-900">
                            Allergens:{" "}
                            {item.selectedAllergens.join(
                              ", ",
                            )}
                          </p>
                        ) : null}

                        {item.specialNotes && (
                          <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] italic text-amber-800">
                            “{item.specialNotes}”
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mb-4 flex items-center justify-between text-[11px] text-muted">
                <span>
                  Placed by {order.waiter?.name}
                </span>

                <span>
                  {new Intl.DateTimeFormat("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(
                    new Date(order.createdAt),
                  )}
                </span>
              </div>

              <button
                disabled={busy === ticketKey}
                onClick={() =>
                  void advance(
                    targetStation,
                    order.id,
                    ticket?.id ?? null,
                    status === "PENDING"
                      ? "prepare"
                      : "ready",
                  )
                }
                className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-bold text-white transition disabled:opacity-50 ${status === "PENDING"
                  ? "bg-ink hover:bg-[#353c34]"
                  : "bg-olive hover:bg-[#334438]"
                  }`}
              >
                {busy === ticketKey
                  ? "Updating ticket…"
                  : status === "PENDING"
                    ? "Start preparing"
                    : "Mark ready"}

                <ArrowRight size={15} />
              </button>
            </div>
          </Panel>
        );
      })}
    </div>
  );

  // ==========================================================
  // PAGE RENDER
  // ==========================================================

  return (
    <div
      className={
        station === "KITCHEN"
          ? "flex min-h-0 flex-1 flex-col"
          : "page-enter"
      }
    >
      <PageHeader
        eyebrow={
          station === "BAR"
            ? "Back of house · Bar display"
            : "Kitchen"
        }
        title={
          station === "BAR"
            ? "At the bar."
            : "Kitchen display"
        }
        description={
          station === "BAR"
            ? "New bar tickets land here in real time. Start prep, then mark each ticket ready."
            : "Each dish is its own card, oldest first."
        }
        action={
          station === "KITCHEN" ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3.5 text-xs font-bold text-ink"
              >
                <Menu size={14} />
                Menu
              </button>
              <span className={`inline-flex h-10 items-center gap-2 rounded-full px-3 text-[11px] font-bold ${openLive === "live" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${openLive === "live" ? "bg-emerald-500" : "animate-pulse bg-amber-400"}`} />
                {openLive === "live" ? "Live" : openLive === "connecting" ? "Connecting" : "Not connected"}
              </span>

              <button
                type="button"
                onClick={() =>
                  setRows((current) =>
                    current === 3 ? 4 : 3,
                  )
                }
                className="inline-flex h-10 items-center rounded-xl border border-line bg-white px-3.5 text-xs font-bold text-ink"
              >
                {rows} rows
              </button>

              <button
                type="button"
                onClick={toggleScreen}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3.5 text-xs font-bold text-ink"
              >
                {fullScreen ? (
                  <>
                    <Minimize2 size={14} />
                    Normal view
                  </>
                ) : (
                  <>
                    <Maximize2 size={14} />
                    Full screen
                  </>
                )}
              </button>
            </div>
          ) : (
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-bold ${liveState === "live"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
                }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${liveState === "live"
                  ? "bg-emerald-500"
                  : "animate-pulse bg-amber-400"
                  }`}
              />

              {liveState === "live"
                ? "Receiving live tickets"
                : liveState === "connecting"
                  ? "Connecting"
                  : "Not connected"}
            </div>
          )
        }
      />

      {/* ERROR */}
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}

      {/* BAR STATISTICS */}
      {station === "BAR" && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Panel className="flex items-center gap-3 p-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700">
              <Flame size={18} />
            </span>

            <div>
              <p className="font-display text-xl font-bold">
                {
                  queue.filter(
                    ({ order, ticket }) =>
                      (ticket?.status ?? order.status) ===
                      "PENDING",
                  ).length
                }
              </p>

              <p className="text-[11px] text-muted">
                New tickets
              </p>
            </div>
          </Panel>

          <Panel className="flex items-center gap-3 p-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700">
              <ChefHat size={18} />
            </span>

            <div>
              <p className="font-display text-xl font-bold">
                {
                  queue.filter(
                    ({ order, ticket }) =>
                      (ticket?.status ?? order.status) ===
                      "PREPARING",
                  ).length
                }
              </p>

              <p className="text-[11px] text-muted">
                In preparation
              </p>
            </div>
          </Panel>

          <Panel className="flex items-center gap-3 p-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <UtensilsCrossed size={18} />
            </span>

            <div>
              <p className="font-display text-xl font-bold">
                {orders.flatMap((order) =>
                  (order.prepTickets ?? []).filter(
                    (ticket) =>
                      ticket.station === station &&
                      ticket.status === "READY",
                  ),
                ).length}
              </p>

              <p className="text-[11px] text-muted">
                Ready to run
              </p>
            </div>
          </Panel>
        </div>
      )}

      {/* KITCHEN / BAR */}
      {station === "KITCHEN" ? (
        queue.length ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <KitchenBoard
              entries={queue}
              cols={rows}
              now={now}
              busy={busy}
              onPickup={(orderId, ticketId) =>
                void pickup(orderId, ticketId)
              }
            />
          </div>
        ) : (
          <Panel>
            <EmptyState
              icon={ChefHat}
              title="Kitchen is caught up"
              body="New kitchen tickets will show here as soon as the floor sends them through."
            />
          </Panel>
        )
      ) : queue.length ? (
        renderTicketCards(station, queue)
      ) : (
        <Panel>
          <EmptyState
            icon={ChefHat}
            title={
              station === "BAR"
                ? "Bar is caught up"
                : "Kitchen is caught up"
            }
            body={`New ${station === "BAR"
              ? "bar"
              : "kitchen"
              } tickets will show here as soon as the floor sends them through.`}
          />
        </Panel>
      )}
    </div>
  );
}

