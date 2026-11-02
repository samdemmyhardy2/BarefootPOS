import { useCallback, useEffect, useRef, useState } from "react";
import { Banknote, BedDouble, CalendarDays, ClipboardList, Printer, RefreshCw, Wallet } from "lucide-react";
import { EmptyState, OrderBadge, PageHeader, Panel } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { money, orderCode, orderLocation, type Order, type OrderLine, type OrderPage, type OrderSalesSummary, type TableBill } from "../lib/types";
import { useUiStore } from "../stores/uiStore";
import { translateUiText } from "../lib/translations";
import { ReceiptPreview, type CheckoutReceipt } from "../components/ReceiptPreview";

const PAGE_SIZE = 10;
type SaleFilter = "TOTAL" | "ROOM" | "CASH";
const localDateBounds = (value: string) => {
  const start = new Date(`${value}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
};
const dateTime = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
function todayInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function groupedSplit(lines: TableBill["lines"]) {
  const groups = new Map<string, { name: string; quantity: number; amount: number; detail: string | null }>();
  for (const line of lines) {
    const key = `${line.name}\0${line.detail ?? ""}`;
    const group = groups.get(key) ?? { name: line.name, detail: line.detail, quantity: 0, amount: 0 };
    group.quantity += 1;
    group.amount = Math.round((group.amount + line.amount) * 100) / 100;
    groups.set(key, group);
  }
  return [...groups.values()];
}
function roomLabel(order: Order, roomNumber: string | number | null | undefined, t: (value: string) => string) {
  if (roomNumber != null && roomNumber !== "") return `${t("Room")} ${roomNumber}`;
  const numbers = [...new Set((order.roomGuestsSnapshot ?? []).map((guest) => guest.roomNumber).filter((number) => number != null && `${number}` !== ""))];
  if (numbers.length) return numbers.map((number) => `${t("Room")} ${number}`).join(", ");
  if (order.roomStay?.room) return `${t("Room")} ${order.roomStay.room.roomNumber}`;
  return t("Walk-in");
}
function payLabel(method: string | null | undefined, status: string | undefined, t: (value: string) => string) {
  if (method === "ROOM_CHECKOUT" || status === "ROOM_FOLIO") return t("On tab");
  if (method === "CARD" && status !== "UNPAID") return t("Paid · Card");
  if (method === "PROMPTPAY" && status !== "UNPAID") return t("Paid · QR");
  if ((method === "CASH" || status === "PAID") && status !== "UNPAID") return t("Paid · Cash");
  return t("Unpaid");
}
function splitItems(split: TableBill): OrderLine[] {
  return groupedSplit(split.lines).map((line, index) => ({
    id: `${split.id}-${index}`,
    menuItemId: `${split.id}-${index}`,
    quantity: line.quantity,
    subtotal: line.amount,
    specialNotes: line.detail,
    menuItem: { id: `${split.id}-${index}`, name: line.name, price: line.amount } as unknown as OrderLine["menuItem"],
  }));
}

export function OrdersPage() {
  const language = useUiStore((state) => state.language);
  const t = (value: string) => translateUiText(language, value);
  const [date, setDate] = useState(todayInputValue);
  const [sale, setSale] = useState<SaleFilter>("TOTAL");
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<OrderSalesSummary | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<CheckoutReceipt | null>(null);
  const restaurantName = useUiStore((state) => state.restaurantName);
  const restaurantLogoUrl = useUiStore((state) => state.restaurantLogoUrl);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const versionRef = useRef(0);
  const loadingRef = useRef(false);

  const fetchPage = useCallback(async (offset: number, version: number) => {
    if (offset === 0) setInitialLoading(true);
    else {
      if (loadingRef.current) return;
      setLoadingMore(true);
    }
    loadingRef.current = true;
    setError("");
    try {
      const params: Record<string, string | number> = { offset, limit: PAGE_SIZE };
      if (date) Object.assign(params, localDateBounds(date));
      if (sale === "ROOM") params.payment = "ROOM";
      if (sale === "CASH") params.payment = "COUNTER";
      const { data } = await api.get<OrderPage>("/orders/page", { params });
      if (version !== versionRef.current) return;
      setOrders((current) => offset === 0 ? data.items : [...current, ...data.items]);
      setTotal(data.total);
      if (data.summary) setSummary(data.summary);
      setHasMore(data.hasMore);
      offsetRef.current = data.offset + data.items.length;
    } catch (cause) {
      if (version === versionRef.current) setError(errorMessage(cause));
    } finally {
      if (version === versionRef.current) {
        loadingRef.current = false;
        setInitialLoading(false);
        setLoadingMore(false);
      }
    }
  }, [date, sale]);

  useEffect(() => {
    const version = ++versionRef.current;
    loadingRef.current = false;
    offsetRef.current = 0;
    setOrders([]);
    setHasMore(true);
    void fetchPage(0, version);
  }, [date, sale, fetchPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || initialLoading || loadingMore || !orders.length) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void fetchPage(offsetRef.current, versionRef.current);
    }, { rootMargin: "180px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchPage, hasMore, initialLoading, loadingMore, orders.length]);

  const refresh = () => { const version = ++versionRef.current; loadingRef.current = false; offsetRef.current = 0; setOrders([]); setHasMore(true); void fetchPage(0, version); };

  return <>
    <div className="page-enter min-h-full w-full">
      <PageHeader eyebrow={t("Service · Order history")} title={t("Order history")} description={t("Browse orders by date, or scroll through the complete order history.")} action={<button type="button" onClick={refresh} disabled={initialLoading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3.5 text-xs font-bold text-ink disabled:opacity-50"><RefreshCw size={14} className={initialLoading ? "animate-spin" : ""} /> {t("Refresh")}</button>} />
      <Panel className="mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full max-w-xs"><label htmlFor="orders-date" className="mb-1.5 flex items-center gap-2 text-xs font-bold text-ink"><CalendarDays size={14} /> {t("Filter by date")}</label><input id="orders-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-10 w-full rounded-lg border border-line bg-white px-3 text-xs text-ink" /></div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted"><span>{date ? t("Orders for selected date") : t("All dates")}</span>{date && <button type="button" onClick={() => setDate("")} className="rounded-lg border border-line px-2.5 py-1.5 font-semibold text-olive hover:bg-canvas">{t("Clear filters")}</button>}</div>
      </Panel>
      <div className="mb-4 grid gap-3 sm:grid-cols-3" role="group" aria-label={t("Total sales")}>
        {([
          { id: "TOTAL", label: "Total sales", amount: summary?.totalAmount, count: summary?.totalCount, icon: Wallet, tint: "bg-[#eef4e8] text-olive", note: "" },
          { id: "ROOM", label: "Room orders", amount: summary?.roomAmount, count: summary?.roomCount, icon: BedDouble, tint: "bg-[#f8edf2] text-[#a85e78]", note: "" },
          { id: "CASH", label: "Cash orders", amount: summary?.cashAmount, count: summary?.cashCount, icon: Banknote, tint: "bg-[#eef1fb] text-[#6774a1]", note: "Cash, card, and QR" },
        ] as const).map(({ id, label, amount, count, icon: Icon, tint, note }) => { const selected = sale === id; return <button key={id} type="button" aria-pressed={selected} onClick={() => setSale(id)} className={`rounded-[22px] border-2 p-4 text-left shadow-card sm:p-5 ${selected ? "border-[#ed168c] bg-[#fff1f8]" : "border-line bg-white hover:border-[#ed168c]/40"}`}><div className="flex items-start justify-between gap-3"><div><p className={`text-xs font-semibold ${selected ? "text-[#ed168c]" : "text-muted"}`}>{t(label)}</p><p className="mt-3 font-display text-[27px] font-bold tracking-[-.045em] text-ink">{summary ? money(amount) : "—"}</p></div><span className={`grid h-10 w-10 place-items-center rounded-[14px] ${tint}`}><Icon size={18} /></span></div><p className="mt-4 border-t border-line pt-3 text-[11px] text-muted">{note ? `${t(note)} · ` : ""}{summary ? `${count} ${t("orders")} · ` : ""}{date ? t("Orders for selected date") : t("All dates")}</p></button>; })}
      </div>
      {error && <div role="alert" className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button type="button" onClick={() => void fetchPage(offsetRef.current, versionRef.current)} className="shrink-0 font-bold underline">{t("Retry")}</button></div>}
      <Panel className="overflow-hidden">
        <div className="border-b border-line px-4 py-4 sm:px-5"><h2 className="font-display text-sm font-bold">{t("Order history")}</h2><p className="mt-1 text-[11px] text-muted">{initialLoading ? t("Loading orders") : `${orders.length} ${t("of")} ${total} ${t("orders")}`}</p></div>
        {initialLoading ? <div className="space-y-3 p-4 sm:p-5">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-[88px] animate-pulse rounded-xl bg-canvas" />)}</div> : orders.length ? <div className="divide-y divide-line">
          {(() => { const seen = new Set<string>(); return orders.flatMap((order) => {
            const splits = (order.splits ?? []).filter((split) => split.status === "SETTLED" && split.lines.some((line) => line.orderId === order.id) && !seen.has(split.id));
            splits.forEach((split) => seen.add(split.id));
            const taken = new Map<string, number>();
            for (const split of order.splits ?? []) if (split.status === "SETTLED") for (const line of split.lines) if (line.orderId === order.id) taken.set(line.orderItemId, (taken.get(line.orderItemId) ?? 0) + 1);
            const remaining = order.items.flatMap((item) => { const used = item.id ? taken.get(item.id) ?? 0 : 0; const left = item.quantity - used; if (left <= 0) return []; const subtotal = Number(item.subtotal ?? Number(item.unitPrice ?? item.menuItem.price) * item.quantity); return [{ ...item, quantity: left, subtotal: Math.round((item.quantity ? subtotal / item.quantity : subtotal) * left * 100) / 100 }]; });
            const rows: ({ kind: "split"; split: TableBill } | { kind: "order"; order: Order })[] = splits.map((split) => ({ kind: "split", split }));
            if (!(remaining.length === 0 && taken.size > 0)) rows.push({ kind: "order", order: taken.size ? { ...order, items: remaining, totalAmount: remaining.reduce((sum, item) => sum + Number(item.subtotal ?? 0), 0) } : order });
            return rows.map((row) => row.kind === "split" ? <article key={row.split.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold">Bill {row.split.number} · {order.table ? `Table ${order.table.tableNumber}` : orderLocation(order)}</h3><span className="text-[10px] text-muted">#{row.split.id.slice(0, 8)}</span><span className="text-[10px] text-muted">{dateTime(row.split.paidAt ?? order.createdAt)}</span></div><p className="mt-1 truncate text-xs text-muted">{groupedSplit(row.split.lines).map((item) => `${item.quantity}× ${item.name}`).join(" · ")}</p><p className="mt-1 text-[10px] font-semibold text-ink">{roomLabel(order, row.split.roomNumber ?? order.roomGuestsSnapshot?.[0]?.roomNumber, t)} · {payLabel(row.split.method, row.split.method === "ROOM_CHECKOUT" ? "ROOM_FOLIO" : "PAID", t)}</p></div><div className="flex items-center justify-between gap-3 sm:justify-end"><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">{row.split.method === "ROOM_CHECKOUT" ? t("On tab") : t("Paid")}</span><span className="min-w-20 text-right text-sm font-extrabold">{money(row.split.amount)}</span><button type="button" onClick={() => setReceipt({ tableNumber: order.table?.tableNumber, locationLabel: `${order.table ? `Table ${order.table.tableNumber}` : orderLocation(order)} · Bill ${row.split.number}`, orders: [{ ...order, id: row.split.id, items: splitItems(row.split), totalAmount: row.split.amount, paymentMethod: row.split.method === "CARD" || row.split.method === "PROMPTPAY" || row.split.method === "ROOM_CHECKOUT" ? row.split.method : "CASH", paymentStatus: row.split.method === "ROOM_CHECKOUT" ? "ROOM_FOLIO" : "PAID" }], paymentMethod: row.split.method === "CARD" || row.split.method === "PROMPTPAY" || row.split.method === "ROOM_CHECKOUT" ? row.split.method : "CASH", room: null, rooms: row.split.roomNumber ? [{ roomNumber: row.split.roomNumber, guestName: row.split.guestName ?? "", guestNames: row.split.guestNames }] : (order.roomGuestsSnapshot ?? []), totalAmount: row.split.amount, checkedOutAt: row.split.paidAt ?? order.updatedAt, cashierName: order.paidBy?.name ?? order.waiter.name, ...(row.split.signatureData ? { signature: { name: row.split.signedByName || "Guest", data: row.split.signatureData } } : {}) })} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[10px] font-bold text-olive hover:bg-canvas"><Printer size={13} /> {t("Receipt")}</button></div></article> : <article key={row.order.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold">{orderLocation(row.order)}</h3><span className="text-[10px] text-muted">#{orderCode(row.order)}</span><span className="text-[10px] text-muted">{dateTime(row.order.createdAt)}</span></div><p className="mt-1 truncate text-xs text-muted">{row.order.items.map((item) => `${item.quantity}× ${item.menuItem.name}`).join(" · ")}</p><p className="mt-1 text-[10px] font-semibold text-ink">{roomLabel(row.order, null, t)} · {payLabel(row.order.paymentMethod, row.order.paymentStatus, t)}</p></div>
            <div className="flex items-center justify-between gap-3 sm:justify-end"><OrderBadge status={row.order.status} /><span className="min-w-20 text-right text-sm font-extrabold">{money(row.order.totalAmount)}</span>{row.order.table && row.order.paymentStatus !== "UNPAID" && <button type="button" onClick={() => setReceipt({ tableNumber: row.order.table!.tableNumber, orders: [row.order], paymentMethod: row.order.paymentMethod, room: null, rooms: row.order.roomGuestsSnapshot?.length ? row.order.roomGuestsSnapshot : row.order.roomStay?.room ? [{ roomNumber: row.order.roomStay.room.roomNumber, guestName: row.order.roomStay.primaryGuestName, guestNames: [...new Set([row.order.roomStay.primaryGuestName, ...row.order.roomStay.occupants.map((occupant) => occupant.name)])] }] : [], totalAmount: Number(row.order.totalAmount), checkedOutAt: row.order.paidAt ?? row.order.updatedAt, cashierName: row.order.paidBy?.name ?? row.order.waiter.name, ...(row.order.paymentMethod === "ROOM_CHECKOUT" && row.order.roomCharge?.signatureData ? { signature: { name: row.order.roomCharge.signedByName || "Guest", data: row.order.roomCharge.signatureData } } : {}) })} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[10px] font-bold text-olive hover:bg-canvas"><Printer size={13} /> {t("Receipt")}</button>}</div>
          </article>); }); })()}
          {loadingMore && <div className="space-y-3 p-4 sm:p-5">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-[76px] animate-pulse rounded-xl bg-canvas" />)}</div>}
          <div ref={sentinelRef} className="h-2" />
          {!hasMore && <p className="px-4 py-5 text-center text-xs text-muted">{t("You’ve reached the end of the order history.")}</p>}
        </div> : <EmptyState icon={ClipboardList} title={t("No orders found")} body={date || sale !== "TOTAL" ? t("No orders match these filters.") : t("Orders will appear here as they are placed.")} />}
      </Panel>
    </div>
    {receipt && <ReceiptPreview receipt={receipt} restaurantName={restaurantName} restaurantLogoUrl={restaurantLogoUrl} onClose={() => setReceipt(null)} />}
  </>;
}
