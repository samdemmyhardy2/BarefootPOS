import { useEffect, useMemo, useState } from "react";
import { Clock3, Search, ShoppingBag, Trash2 } from "lucide-react";
import { PageHeader, Panel, OrderBadge, EmptyState } from "../components/ui";
import { useOrderStore } from "../stores/orderStore";
import { useAuthStore } from "../stores/authStore";
import { useUiStore } from "../stores/uiStore";
import { errorMessage } from "../lib/api";
import { money } from "../lib/types";
import { orderLocation } from "../lib/types";
import { formatOrderDuration } from "../lib/orderTiming";

const filters = ["All active", "Pending", "Preparing", "Ready", "Served"];

export function OrderTrackerPage() {
  const orders = useOrderStore((state) => state.orders);
  const liveState = useOrderStore((state) => state.liveState);
  const changeStatus = useOrderStore((state) => state.changeStatus);
  const deleteOrder = useOrderStore((state) => state.deleteOrder);
  const isAdmin = useAuthStore((state) => state.user?.role === "ADMIN");
  const notify = useUiStore((state) => state.notify);
  const [filter, setFilter] = useState("All active");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const visible = useMemo(
    () =>
      orders
        .filter((order) => {
          const statusMatch =
            filter === "All active" ||
            order.status.toLowerCase() === filter.toLowerCase();
          const term = search.toLowerCase();
          return (
            statusMatch &&
            (!term ||
              `${orderLocation(order)} ${order.id} ${order.items.map((item) => item.menuItem.name).join(" ")}`
                .toLowerCase()
                .includes(term))
          );
        })
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [orders, filter, search],
  );
  const setDone = async (id: string) => {
    try {
      await changeStatus(id, "COMPLETED");
      notify("Order completed and table released.");
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const remove = async (id: string) => {
    try {
      await deleteOrder(id);
      notify("Order deleted.");
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Service · Live board"
        title="Order tracker"
        description="Follow every ticket from first tap to table. Updates arrive live from the kitchen."
        action={
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-bold ${liveState === "live" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${liveState === "live" ? "bg-emerald-500" : "animate-pulse bg-amber-400"}`}
            />
            {liveState === "live" ? "Live updates" : "Reconnecting"}
          </span>
        }
      />
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="scrollbar-hide flex gap-1 overflow-x-auto">
            {filters.map((item) => (
              <button
                key={item}
                onClick={() => setFilter(item)}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${filter === item ? "bg-olive text-white" : "text-muted hover:bg-canvas hover:text-ink"}`}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:max-w-[250px]">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search table or dish"
              className="h-9 w-full rounded-lg border border-line pl-9 pr-3 text-xs outline-none focus:border-olive"
            />
          </div>
        </div>
        {visible.length ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 sm:p-5">
            {visible.map((order) => (
              <article
                key={order.id}
                className="rounded-2xl border border-line p-4 transition hover:border-olive/30"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-display text-sm font-extrabold">
                      {orderLocation(order)}
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-muted">
                      #{order.id.slice(-6).toUpperCase()}
                    </p>
                  </div>
                  <OrderBadge status={order.status} />
                </div>
                <div className="my-4 space-y-2 border-y border-dashed border-line py-3">
                  {order.items.map((line, index) => (
                    <div
                      key={line.id ?? `${order.id}-${index}`}
                      className="flex gap-2 text-xs"
                    >
                      <span className="w-5 shrink-0 font-bold text-olive">
                        {line.quantity}×
                      </span>
                      <span className="flex-1">
                        {line.menuItem.name}
                        {line.specialNotes && (
                          <span className="mt-1 block text-[10px] italic text-muted">
                            Note: {line.specialNotes}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mb-3 rounded-xl bg-canvas px-3 py-2 text-[10px] text-muted">
                  {order.readyAt ? (
                    <p>Preparation: {formatOrderDuration(order.preparingAt ?? order.createdAt, order.readyAt)}</p>
                  ) : order.status === "PENDING" || order.status === "PREPARING" ? (
                    <p>{order.status === "PREPARING" ? "Preparing" : "Waiting to start"}: {formatOrderDuration(order.preparingAt ?? order.createdAt, now)}</p>
                  ) : null}
                  {order.readyAt && <p className="mt-1">Delivery: {formatOrderDuration(order.readyAt, order.servedAt ?? now)}{order.servedAt ? "" : " · in progress"}</p>}
                  {order.servedAt && <p className="mt-1 font-semibold text-ink">Total to delivery: {formatOrderDuration(order.createdAt, order.servedAt)}</p>}
                </div>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[10px] text-muted">
                    <Clock3 size={12} />
                    {new Intl.DateTimeFormat("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(new Date(order.createdAt))}{" "}
                    · {order.waiter?.name}
                    {order.servedBy?.name ? ` · Collected by ${order.servedBy.name}` : ""}
                  </span>
                  <span className="text-sm font-bold">
                    {money(order.totalAmount)}
                  </span>
                </div>
                {isAdmin && (
                  <div className="mt-4 flex gap-2 border-t border-line pt-3">
                    <button
                      onClick={() => void setDone(order.id)}
                      disabled={["COMPLETED", "CANCELLED"].includes(
                        order.status,
                      )}
                      className="flex-1 rounded-lg bg-[#edf2e9] py-2 text-[11px] font-bold text-olive hover:bg-[#e0e8da] disabled:opacity-40"
                    >
                      Complete order
                    </button>
                    <button
                      onClick={() => void remove(order.id)}
                      className="grid h-8 w-9 place-items-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-600"
                      title="Delete order"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ShoppingBag}
            title="Nothing in this lane"
            body="New tickets and kitchen updates will appear here automatically."
          />
        )}
      </Panel>
    </div>
  );
}
