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
import { api, errorMessage } from "../lib/api";
import { orderLocation } from "../lib/types";
import type { Order, PrepStation, PrepTicket } from "../lib/types";
import { formatOrderDuration } from "../lib/orderTiming";

type QueueEntry = { order: Order; ticket: PrepTicket | null };

export function KitchenPage({ station }: { station: PrepStation }) {
  const orders = useOrderStore((state) => state.orders);
  const liveState = useOrderStore((state) => state.liveState);
  const cookAction = useOrderStore((state) => state.cookAction);
  const upsertOrder = useOrderStore((state) => state.upsertOrder);
  const notify = useUiStore((state) => state.notify);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const queues = useMemo<Record<PrepStation, QueueEntry[]>>(() => {
    const entries = (target: PrepStation) => orders.flatMap<QueueEntry>((order) => {
      const stationTickets = (order.prepTickets ?? []).filter((ticket) => ticket.station === target && ["PENDING", "PREPARING"].includes(ticket.status));
      if (stationTickets.length) return stationTickets.map((ticket) => ({ order, ticket }));
      if (target === "KITCHEN" && !order.prepTickets?.length && ["PENDING", "PREPARING"].includes(order.status)) return [{ order, ticket: null }];
      return [];
    }).sort((a, b) => +new Date(a.ticket?.createdAt ?? a.order.createdAt) - +new Date(b.ticket?.createdAt ?? b.order.createdAt));
    return { KITCHEN: entries("KITCHEN"), BAR: entries("BAR") };
  }, [orders]);
  const queue = queues[station];
  const advance = async (targetStation: PrepStation, orderId: string, ticketId: string | null, action: "prepare" | "ready") => {
    setBusy(ticketId ?? orderId);
    setError("");
    try {
      if (ticketId) {
        const { data } = await api.patch(`/orders/${targetStation.toLowerCase()}/tickets/${ticketId}/${action}`);
        upsertOrder(data);
      } else await cookAction(orderId, action);
      notify(
        action === "ready"
          ? `${targetStation === "BAR" ? "Bar" : "Kitchen"} ticket is ready.`
          : `${targetStation === "BAR" ? "Bar" : "Kitchen"} ticket accepted.`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const pickup = async (orderId: string, ticketId: string | null) => {
    const ticketKey = ticketId ?? orderId;
    setBusy(ticketKey);
    setError("");
    try {
      const { data } = await api.patch<Order>(ticketId ? `/orders/kitchen/tickets/${ticketId}/pickup` : `/orders/kitchen/orders/${orderId}/pickup`);
      upsertOrder(data);
      notify("Picked up. Ticket marked served.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const renderTicketCards = (targetStation: PrepStation, entries: QueueEntry[]) => <div className="grid gap-4 2xl:grid-cols-2">
    {entries.map(({ order, ticket }) => {
      const status = ticket?.status ?? order.status;
      const ticketItems = ticket?.items ?? order.items.map((item) => ({ menuItemName: item.menuItem.name, quantity: item.quantity, modifierSelections: item.modifierSelections ?? [], removeIngredients: item.removeIngredients, addExtras: item.addExtras, specialNotes: item.specialNotes, selectedAllergens: item.selectedAllergens }));
      const ticketKey = ticket?.id ?? order.id;
      if (targetStation === "KITCHEN") return <Panel key={ticketKey} className="overflow-hidden">
        <div className={`h-1.5 ${status === "PENDING" ? "bg-amber-400" : "bg-sky-400"}`} />
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {ticketItems.map((item, index) => {
                const noteParts = (item.specialNotes ?? "").split(" · ").map((part) => part.trim()).filter(Boolean);
                const kitchenNotes = noteParts.filter((part) => part.toLowerCase().startsWith("order note:")).map((part) => part.replace(/^order note:\s*/i, ""));
                const otherNotes = noteParts.filter((part) => !part.toLowerCase().startsWith("order note:"));
                return <div key={`${ticketKey}-${index}`} className={index ? "mt-4" : ""}>
                  <div className="flex items-center gap-2"><span className="font-display text-[22px] font-extrabold tracking-tight">{item.quantity}× {item.menuItemName}</span>{index === 0 && <OrderBadge status={status} />}</div>
                  {item.modifierSelections?.map((selection) => <p key={selection.groupId} className="mt-1 text-[11px] font-medium text-[#6f5964]">{selection.groupName}: {selection.options.map((option) => option.name).join(", ")}</p>)}
                  {item.removeIngredients && <p className="mt-1 text-[11px] text-[#ba694b]">No: {item.removeIngredients}</p>}
                  {item.addExtras && <p className="mt-1 text-[11px] text-olive">Extra: {item.addExtras}</p>}
                  {item.selectedAllergens?.length ? <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-900">Allergens: {item.selectedAllergens.join(", ")}</p> : null}
                  {kitchenNotes.map((note) => <p key={note} className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-900">Kitchen note: {note}</p>)}
                  {otherNotes.map((note) => <p key={note} className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] italic text-amber-800">“{note}”</p>)}
                </div>;
              })}
              <p className="mt-1 font-mono text-[10px] text-muted">Order #{order.id.slice(-6).toUpperCase()}</p>
              <p className="mt-1 text-[11px] font-semibold text-olive">{status === "PREPARING" ? "Preparing" : "Waiting to start"}: {formatOrderDuration(status === "PREPARING" ? ticket?.preparingAt ?? order.preparingAt ?? order.createdAt : order.createdAt, now)}</p>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-muted"><Clock3 size={13} />{Math.max(0, Math.floor((now - +new Date(order.createdAt)) / 60000))} min ago</span>
          </div>
          <div className="my-4 border-y border-dashed border-line py-4">
            <p className="text-sm font-bold">{orderLocation(order)}</p>
          </div>
          <div className="mb-4 flex items-center justify-between text-[11px] text-muted"><span>Placed by {order.waiter?.name}</span><span>{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(order.createdAt))}</span></div>
          <button disabled={busy === ticketKey} onClick={() => void pickup(order.id, ticket?.id ?? null)} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink text-xs font-bold text-white transition hover:bg-[#353c34] disabled:opacity-50">
            {busy === ticketKey ? "Saving…" : "Pickup"}<ArrowRight size={15} />
          </button>
        </div>
      </Panel>;
      return <Panel key={ticketKey} className="overflow-hidden">
        <div className={`h-1.5 ${status === "PENDING" ? "bg-amber-400" : "bg-sky-400"}`} />
        <div className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2"><span className="font-display text-[22px] font-extrabold tracking-tight">{orderLocation(order)}</span><OrderBadge status={status} /></div>
              <p className="mt-1 font-mono text-[10px] text-muted">Order #{order.id.slice(-6).toUpperCase()}</p>
              <p className="mt-1 text-[11px] font-semibold text-olive">{status === "PREPARING" ? "Preparing" : "Waiting to start"}: {formatOrderDuration(status === "PREPARING" ? ticket?.preparingAt ?? order.preparingAt ?? order.createdAt : order.createdAt, now)}</p>
            </div>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted"><Clock3 size={13} />{Math.max(0, Math.floor((Date.now() - +new Date(order.createdAt)) / 60000))} min ago</span>
          </div>
          <div className="my-4 space-y-3 border-y border-dashed border-line py-4">
            {ticketItems.map((item, index) => {
              const sourceItem = order.items.find((line) => line.menuItem.name === item.menuItemName);
              const barOptions = item.modifierSelections?.flatMap((selection) => selection.options.map((option) => option.name)) ?? [];
              const isBarModifierTicket = targetStation === "BAR" && sourceItem?.menuItem.prepStation !== "BAR" && barOptions.length > 0;
              return <div key={`${ticketKey}-${index}`} className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#edf2e9] text-xs font-bold text-olive">{item.quantity}</span>
              <div className="min-w-0 flex-1"><p className="text-sm font-bold">{isBarModifierTicket ? barOptions[0] : item.menuItemName}</p>
                {isBarModifierTicket ? <><div className="ml-3 mt-1 space-y-1 border-l border-[#f3cade] pl-2">{barOptions.slice(1).map((name, optionIndex) => <p key={`${name}-${optionIndex}`} className="text-[11px] font-medium text-[#6f5964]">{name}</p>)}</div><p className="mt-1 text-[11px] font-semibold text-muted">Part of {item.menuItemName}</p></> : item.modifierSelections?.map((selection) => <p key={selection.groupId} className="mt-1 text-[11px] font-medium text-[#6f5964]">{selection.groupName}: {selection.options.map((option) => option.name).join(", ")}</p>)}
                {item.removeIngredients && <p className="mt-1 text-[11px] text-[#ba694b]">No: {item.removeIngredients}</p>}
                {item.addExtras && <p className="mt-1 text-[11px] text-olive">Extra: {item.addExtras}</p>}
                {item.selectedAllergens?.length ? <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-900">Allergens: {item.selectedAllergens.join(", ")}</p> : null}
                {item.specialNotes && <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] italic text-amber-800">“{item.specialNotes}”</p>}
              </div>
            </div>;
            })}
          </div>
          <div className="mb-4 flex items-center justify-between text-[11px] text-muted"><span>Placed by {order.waiter?.name}</span><span>{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(order.createdAt))}</span></div>
          <button disabled={busy === ticketKey} onClick={() => void advance(targetStation, order.id, ticket?.id ?? null, status === "PENDING" ? "prepare" : "ready")} className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-bold text-white transition disabled:opacity-50 ${status === "PENDING" ? "bg-ink hover:bg-[#353c34]" : "bg-olive hover:bg-[#334438]"}`}>
            {busy === ticketKey ? "Updating ticket…" : status === "PENDING" ? "Start preparing" : "Mark ready"}<ArrowRight size={15} />
          </button>
        </div>
      </Panel>;
    })}
  </div>;
  return (
    <div className="page-enter">
      <PageHeader
        eyebrow={station === "BAR" ? "Back of house · Bar display" : "Kitchen · Live tickets"}
        title={station === "BAR" ? "At the bar." : "Kitchen display"}
        description={station === "BAR" ? "New bar tickets land here in real time. Start prep, then mark each ticket ready." : "Kitchen tickets land here. Dishes staff serve straight away stay on the table ticket and are not shown here."}
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
      {station === "BAR" && <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Panel className="flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700">
            <Flame size={18} />
          </span>
          <div>
            <p className="font-display text-xl font-bold">
              {queue.filter(({ order, ticket }) => (ticket?.status ?? order.status) === "PENDING").length}
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
              {queue.filter(({ order, ticket }) => (ticket?.status ?? order.status) === "PREPARING").length}
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
              {orders.flatMap((order) => (order.prepTickets ?? []).filter((ticket) => ticket.station === station && ticket.status === "READY")).length}
            </p>
            <p className="text-[11px] text-muted">Ready to run</p>
          </div>
        </Panel>
      </div>}
      {station === "KITCHEN" ? (queue.length ? renderTicketCards("KITCHEN", queue) : <Panel><EmptyState icon={ChefHat} title="Kitchen is caught up" body="New kitchen tickets will show here as soon as the floor sends them through." /></Panel>) : queue.length ? (
        renderTicketCards(station, queue)
      ) : (
        <Panel>
          <EmptyState
            icon={ChefHat}
            title={station === "BAR" ? "Bar is caught up" : "Kitchen is caught up"}
            body={`New ${station === "BAR" ? "bar" : "kitchen"} tickets will show here as soon as the floor sends them through.`}
          />
        </Panel>
      )}
    </div>
  );
}
