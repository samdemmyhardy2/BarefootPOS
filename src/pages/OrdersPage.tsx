import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, ClipboardList, Printer, RefreshCw } from "lucide-react";
import { EmptyState, OrderBadge, PageHeader, Panel } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { money, orderLocation, type Order, type OrderPage } from "../lib/types";
import { useUiStore } from "../stores/uiStore";
import { translateUiText } from "../lib/translations";
import { ReceiptPreview, type CheckoutReceipt } from "../components/ReceiptPreview";

const PAGE_SIZE = 10;
const localDateBounds = (value: string) => {
  const start = new Date(`${value}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
};
const dateTime = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function OrdersPage() {
  const language = useUiStore((state) => state.language);
  const t = (value: string) => translateUiText(language, value);
  const [date, setDate] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
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
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (offset === 0) setInitialLoading(true);
    else setLoadingMore(true);
    setError("");
    try {
      const params: Record<string, string | number> = { offset, limit: PAGE_SIZE };
      if (date) Object.assign(params, localDateBounds(date));
      const { data } = await api.get<OrderPage>("/orders/page", { params });
      if (version !== versionRef.current) return;
      setOrders((current) => offset === 0 ? data.items : [...current, ...data.items]);
      setTotal(data.total);
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
  }, [date]);

  useEffect(() => {
    const version = ++versionRef.current;
    loadingRef.current = false;
    offsetRef.current = 0;
    setOrders([]);
    setTotal(0);
    setHasMore(true);
    void fetchPage(0, version);
  }, [date, fetchPage]);

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
        <div><label htmlFor="orders-date" className="mb-1.5 flex items-center gap-2 text-xs font-bold text-ink"><CalendarDays size={14} /> {t("Filter by date")}</label><input id="orders-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-10 rounded-lg border border-line bg-white px-3 text-xs text-ink" /></div>
        <div className="flex items-center gap-2 text-xs text-muted"><span>{date ? t("Orders for selected date") : t("All dates")}</span>{date && <button type="button" onClick={() => setDate("")} className="rounded-lg border border-line px-2.5 py-1.5 font-semibold text-olive hover:bg-canvas">{t("Clear date")}</button>}</div>
      </Panel>
      {error && <div role="alert" className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button type="button" onClick={() => void fetchPage(offsetRef.current, versionRef.current)} className="shrink-0 font-bold underline">{t("Retry")}</button></div>}
      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-4 sm:px-5"><div><h2 className="font-display text-sm font-bold">{t("Order history")}</h2><p className="mt-1 text-[11px] text-muted">{initialLoading ? t("Loading orders") : `${orders.length} ${t("of")} ${total} ${t("orders")}`}</p></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-olive-soft text-olive"><ClipboardList size={17} /></span></div>
        {initialLoading ? <div className="space-y-3 p-4 sm:p-5">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-[88px] animate-pulse rounded-xl bg-canvas" />)}</div> : orders.length ? <div className="divide-y divide-line">
          {orders.map((order) => <article key={order.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold">{orderLocation(order)}</h3><span className="text-[10px] text-muted">#{order.id.slice(0, 8)}</span><span className="text-[10px] text-muted">{dateTime(order.createdAt)}</span></div><p className="mt-1 truncate text-xs text-muted">{order.items.map((item) => `${item.quantity}× ${item.menuItem.name}`).join(" · ")}</p><p className="mt-1 text-[10px] font-semibold text-ink">{order.roomGuestsSnapshot?.[0] || order.roomStay?.room ? `${t("Room")} ${order.roomGuestsSnapshot?.[0]?.roomNumber ?? order.roomStay?.room?.roomNumber}` : t("Walk-in")} · {order.paymentStatus === "ROOM_FOLIO" || order.paymentMethod === "ROOM_CHECKOUT" ? t("On tab") : order.paymentStatus === "PAID" && order.paymentMethod === "CASH" ? t("Paid · Cash") : order.paymentStatus === "PAID" && order.paymentMethod === "PROMPTPAY" ? t("Paid · QR") : order.paymentStatus === "PAID" && order.paymentMethod === "CARD" ? t("Paid · Card") : t("Unpaid")}</p></div>
            <div className="flex items-center justify-between gap-3 sm:justify-end"><OrderBadge status={order.status} /><span className="min-w-20 text-right text-sm font-extrabold">{money(order.totalAmount)}</span>{order.table && order.paymentStatus !== "UNPAID" && <button type="button" onClick={() => setReceipt({ tableNumber: order.table!.tableNumber, orders: [order], paymentMethod: order.paymentMethod, room: null, rooms: order.roomGuestsSnapshot?.length ? order.roomGuestsSnapshot : order.roomStay?.room ? [{ roomNumber: order.roomStay.room.roomNumber, guestName: order.roomStay.primaryGuestName, guestNames: [...new Set([order.roomStay.primaryGuestName, ...order.roomStay.occupants.map((occupant) => occupant.name)])] }] : [], totalAmount: Number(order.totalAmount), checkedOutAt: order.paidAt ?? order.updatedAt, cashierName: order.paidBy?.name ?? order.waiter.name, ...(order.paymentMethod === "ROOM_CHECKOUT" && order.roomCharge?.signatureData ? { signature: { name: order.roomCharge.signedByName || "Guest", data: order.roomCharge.signatureData } } : {}) })} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[10px] font-bold text-olive hover:bg-canvas"><Printer size={13} /> {t("Receipt")}</button>}</div>
          </article>)}
          {loadingMore && <div className="space-y-3 p-4 sm:p-5">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-[76px] animate-pulse rounded-xl bg-canvas" />)}</div>}
          <div ref={sentinelRef} className="h-2" />
          {!hasMore && <p className="px-4 py-5 text-center text-xs text-muted">{t("You’ve reached the end of the order history.")}</p>}
        </div> : <EmptyState icon={ClipboardList} title={t("No orders found")} body={date ? t("There are no orders for this date.") : t("Orders will appear here as they are placed.")} />}
      </Panel>
    </div>
    {receipt && <ReceiptPreview receipt={receipt} restaurantName={restaurantName} restaurantLogoUrl={restaurantLogoUrl} onClose={() => setReceipt(null)} />}
  </>;
}
