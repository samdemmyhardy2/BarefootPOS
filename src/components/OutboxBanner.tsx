import { useEffect, useState } from "react";
import { dismissOutbox, listOutbox, retryOutbox, watchOutbox, type OutboxItem } from "../lib/outbox";
import { useOrderStore } from "../stores/orderStore";

export function OutboxBanner() {
  const [items, setItems] = useState<OutboxItem[]>(() => listOutbox());
  const fetchOrders = useOrderStore((state) => state.fetchOrders);
  useEffect(() => watchOutbox(() => {
    setItems(listOutbox());
    void fetchOrders().catch(() => undefined);
  }), [fetchOrders]);
  if (!items.length) return null;
  const waiting = items.filter((item) => item.status === "pending");
  const blocked = items.filter((item) => item.status === "blocked");
  return <div className="mb-4 space-y-2">
    {waiting.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
      <p className="font-bold">{waiting.length === 1 ? "1 action is saved on this device" : `${waiting.length} actions are saved on this device`}</p>
      <p className="mt-1 text-xs">It has not reached the server yet. It will send when the connection returns, and a repeat uses the same request so it is not applied twice.</p>
      <ul className="mt-2 space-y-1 text-xs">{waiting.map((item) => <li key={item.id}>{item.label}</li>)}</ul>
    </div>}
    {blocked.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
      <div><p className="font-bold">{item.label}</p><p className="mt-1 text-xs">{item.lastError || "The server refused this."} It is still saved on this device and was not sent again.</p></div>
      <div className="flex shrink-0 gap-3">{item.scope !== "order.create" && <button type="button" onClick={() => dismissOutbox(item.id)} className="text-xs font-bold underline">Dismiss</button>}<button type="button" onClick={() => retryOutbox(item.id)} className="text-xs font-bold underline">Try again</button></div>
    </div>)}
  </div>;
}
