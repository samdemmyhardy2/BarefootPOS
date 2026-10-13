import { useMemo, useState } from "react";
import { BellRing, Check, Clock3, PackageCheck, Utensils } from "lucide-react";
import { EmptyState, PageHeader, Panel } from "../components/ui";
import { useOrderStore } from "../stores/orderStore";
import { useUiStore } from "../stores/uiStore";
import { orderLocation } from "../lib/types";
import { errorMessage } from "../lib/api";
import { money } from "../lib/types";

export function ReadyOrdersPage() {
  const orders = useOrderStore((state) => state.orders);
  const cookAction = useOrderStore((state) => state.cookAction);
  const notify = useUiStore((state) => state.notify);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const ready = useMemo(
    () =>
      orders
        .filter((order) => order.status === "READY")
        .sort((a, b) => +new Date(a.updatedAt) - +new Date(b.updatedAt)),
    [orders],
  );
  const markServed = async (id: string) => {
    setBusy(id);
    setError("");
    try {
      await cookAction(id, "served");
      notify("Pickup acknowledged. Service team is on it.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Front of house · Handoff"
        title="Ready to run."
        description="The kitchen has called these tickets. Tap when you’ve picked one up for the table."
        action={
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Live handoff
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
      <div className="mb-5 rounded-2xl bg-[#2e4235] px-5 py-4 text-white sm:flex sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-citrus">
            <BellRing size={18} />
          </span>
          <div>
            <p className="text-sm font-bold">
              {ready.length} {ready.length === 1 ? "order is" : "orders are"}{" "}
              ready
            </p>
            <p className="mt-1 text-[11px] text-white/60">
              New kitchen calls appear here instantly.
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px] font-medium text-white/60 sm:mt-0">
          <span className="h-1.5 w-1.5 rounded-full bg-citrus" />
          Kitchen connected
        </div>
      </div>
      {ready.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ready.map((order) => (
            <Panel key={order.id} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line bg-[#f3f7ef] px-5 py-4">
                <div>
                  <p className="font-display text-lg font-extrabold">
                    {orderLocation(order)}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-muted">
                    #{order.id.slice(-6).toUpperCase()}
                  </p>
                </div>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-olive">
                  <PackageCheck size={19} />
                </span>
              </div>
              <div className="p-5">
                <div className="mb-4 flex items-center gap-1.5 text-[11px] text-muted">
                  <Clock3 size={13} />
                  Ready at{" "}
                  {new Intl.DateTimeFormat("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(order.updatedAt))}
                  <span className="mx-1">·</span>
                  {order.waiter?.name}
                </div>
                <div className="space-y-3">
                  {order.items.map((item, index) => (
                    <div
                      key={item.id ?? `${order.id}-${index}`}
                      className="flex gap-3"
                    >
                      <span className="w-7 shrink-0 rounded-lg bg-canvas py-1 text-center text-xs font-bold">
                        {item.quantity}×
                      </span>
                      <div className="flex-1">
                        <p className="text-xs font-bold">
                          {item.menuItem.name}
                        </p>
                        {item.specialNotes && (
                          <p className="mt-1 text-[10px] italic text-muted">
                            {item.specialNotes}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
                  <span className="text-[11px] text-muted">Ticket total</span>
                  <span className="text-sm font-bold">
                    {money(order.totalAmount)}
                  </span>
                </div>
                <button
                  disabled={busy === order.id}
                  onClick={() => void markServed(order.id)}
                  className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-olive text-xs font-bold text-white hover:bg-[#334438] disabled:opacity-50"
                >
                  {busy === order.id
                    ? "Confirming…"
                    : "Picked up · mark served"}
                  <Check size={15} />
                </button>
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          <EmptyState
            icon={Utensils}
            title="No pickup calls yet"
            body="When the kitchen marks an order ready, it will land here. No need to refresh."
          />
        </Panel>
      )}
    </div>
  );
}
