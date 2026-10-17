import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ChefHat,
  Clock3,
  Flame,
  UtensilsCrossed,
} from "lucide-react";
import { EmptyState, OrderBadge, PageHeader, Panel } from "../components/ui";
import { useOrderStore } from "../stores/orderStore";
import { useUiStore } from "../stores/uiStore";
import { errorMessage } from "../lib/api";
import { orderLocation } from "../lib/types";
import { localizedFoodLabels } from "../lib/foodTranslations";
import { formatOrderDuration } from "../lib/orderTiming";

export function KitchenPage() {
  const orders = useOrderStore((state) => state.orders);
  const liveState = useOrderStore((state) => state.liveState);
  const cookAction = useOrderStore((state) => state.cookAction);
  const notify = useUiStore((state) => state.notify);
  const language = useUiStore((state) => state.language);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const queue = useMemo(
    () =>
      orders
        .filter((order) => ["PENDING", "PREPARING"].includes(order.status))
        .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
    [orders],
  );
  const advance = async (id: string, action: "prepare" | "ready") => {
    setBusy(id);
    setError("");
    try {
      await cookAction(id, action);
      notify(
        action === "ready"
          ? "Order is ready. The floor team has been notified."
          : "Order accepted by the kitchen.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Back of house · Kitchen display"
        title="On the pass."
        description="New tickets land here in real time. Start prep, then let the floor know when it’s ready."
        action={
          <div
            className={`flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-bold ${liveState === "live" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${liveState === "live" ? "bg-emerald-500" : "animate-pulse bg-amber-400"}`}
            />
            {liveState === "live"
              ? "Receiving live tickets"
              : "Restoring connection"}
          </div>
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
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Panel className="flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700">
            <Flame size={18} />
          </span>
          <div>
            <p className="font-display text-xl font-bold">
              {queue.filter((order) => order.status === "PENDING").length}
            </p>
            <p className="text-[11px] text-muted">New tickets</p>
          </div>
        </Panel>
        <Panel className="flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700">
            <ChefHat size={18} />
          </span>
          <div>
            <p className="font-display text-xl font-bold">
              {queue.filter((order) => order.status === "PREPARING").length}
            </p>
            <p className="text-[11px] text-muted">In preparation</p>
          </div>
        </Panel>
        <Panel className="flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <UtensilsCrossed size={18} />
          </span>
          <div>
            <p className="font-display text-xl font-bold">
              {orders.filter((order) => order.status === "READY").length}
            </p>
            <p className="text-[11px] text-muted">Ready to run</p>
          </div>
        </Panel>
      </div>
      {queue.length ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {queue.map((order) => (
            <Panel key={order.id} className="overflow-hidden">
              <div
                className={`h-1.5 ${order.status === "PENDING" ? "bg-amber-400" : "bg-sky-400"}`}
              />
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-[22px] font-extrabold tracking-tight">
                        {orderLocation(order)}
                      </span>
                      <OrderBadge status={order.status} />
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-muted">
                      Order #{order.id.slice(-6).toUpperCase()}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-olive">
                      {order.status === "PREPARING" ? "Preparing" : "Waiting to start"}: {formatOrderDuration(order.status === "PREPARING" ? order.preparingAt ?? order.createdAt : order.createdAt, now)}
                    </p>
                  </div>
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                    <Clock3 size={13} />
                    {Math.max(
                      0,
                      Math.floor(
                        (Date.now() - +new Date(order.createdAt)) / 60000,
                      ),
                    )}{" "}
                    min ago
                  </span>
                </div>
                <div className="my-4 space-y-3 border-y border-dashed border-line py-4">
                  {order.items.map((item, index) => (
                    <div
                      key={item.id ?? `${order.id}-${index}`}
                      className="flex gap-3"
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#edf2e9] text-xs font-bold text-olive">
                        {item.quantity}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">
                          {item.menuItem.name}
                        </p>
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
                            {language === "my" ? "ဓာတ်မတည့်မှု:" : language === "th" ? "สารก่อภูมิแพ้:" : "Allergens:"}{" "}
                            {item.selectedAllergens.map((allergen) => {
                              const canonical = item.menuItem.allergens ?? [];
                              const translated = localizedFoodLabels(item.menuItem.allergens, item.menuItem.allergensMy, item.menuItem.allergensTh, language);
                              const index = canonical.indexOf(allergen);
                              return index >= 0 ? translated[index] : allergen;
                            }).join(", ")}
                          </p>
                        ) : null}
                        {item.specialNotes && (
                          <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] italic text-amber-800">
                            “{item.specialNotes}”
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mb-4 flex items-center justify-between text-[11px] text-muted">
                  <span>Placed by {order.waiter?.name}</span>
                  <span>
                    {new Intl.DateTimeFormat("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(new Date(order.createdAt))}
                  </span>
                </div>
                <button
                  disabled={busy === order.id}
                  onClick={() =>
                    void advance(
                      order.id,
                      order.status === "PENDING" ? "prepare" : "ready",
                    )
                  }
                  className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-bold text-white transition disabled:opacity-50 ${order.status === "PENDING" ? "bg-ink hover:bg-[#353c34]" : "bg-olive hover:bg-[#334438]"}`}
                >
                  {busy === order.id
                    ? "Updating ticket…"
                    : order.status === "PENDING"
                      ? "Start preparing"
                      : "Mark ready"}
                  <ArrowRight size={15} />
                </button>
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          <EmptyState
            icon={ChefHat}
            title="Your kitchen is caught up"
            body="New orders will show up here as soon as the floor sends them through."
          />
        </Panel>
      )}
    </div>
  );
}
