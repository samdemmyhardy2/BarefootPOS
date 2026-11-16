import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { BedDouble, Minus, Plus, ReceiptText, Trash2, Users, X, Pencil, Search, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Field, Modal, Panel, SelectField } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { money, orderCode, type Order, type Room, type RoomCharge, type RoomChargeKind, type RoomPaymentMethod, type RoomStay } from "../lib/types";
import { moneyRound, roundUpBaht } from "../lib/vat";
import { useAuthStore } from "../stores/authStore";
import { useUiStore } from "../stores/uiStore";
import { hasJobPermission } from "../lib/access";
import { priceFolioCharge, ReceiptPreview, type CheckoutReceipt } from "../components/ReceiptPreview";
import { CashRegister } from "../components/SettleTableDialog";
import { RoomCalendar, type CalendarStay } from "../components/RoomCalendar";

type ModalKind = "room" | "checkin" | "arrival" | "charge" | "settle" | "assign" | null;
type RoomChoice = { id: string; roomNumber: string; status: string; suggested: boolean; available: boolean; reason: string | null };
const dateTime = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const roomLabel = (roomNumber: string) => /^\d+$/.test(roomNumber) ? `Room ${roomNumber}` : roomNumber;
const stayDay = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
};
const HISTORY_PAGE_SIZE = 10;
function dishName(line: { menuItem?: { name?: string | null } | null; itemSnapshot?: unknown }) {
  if (line.menuItem?.name) return line.menuItem.name;
  const copy = line.itemSnapshot;
  if (copy && typeof copy === "object" && !Array.isArray(copy) && typeof (copy as { name?: unknown }).name === "string") return (copy as { name: string }).name;
  return "Removed dish";
}
function QuantityStepper({ value, name, onChange }: { value: number; name: string; onChange: (value: number) => void }) {
  return <div className="flex h-8 items-center rounded-lg bg-[#fff4f9] p-0.5">
    <button type="button" aria-label={`Decrease ${name}`} onClick={() => onChange(Math.max(1, value - 1))} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white"><Minus size={12} /></button>
    <span className="w-6 text-center text-[11px] font-bold text-ink">{value}</span>
    <button type="button" aria-label={`Increase ${name}`} onClick={() => onChange(Math.min(99, value + 1))} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white"><Plus size={12} /></button>
  </div>;
}
function RoomDishRow({ line, editable, onRemove, onQuantity }: { line: { id?: string; quantity: number; unitPrice?: number | string | null; subtotal?: number | string | null; menuItem?: { name?: string | null; price?: number | string | null } | null; itemSnapshot?: unknown; modifierSelections?: { groupName: string; options: { name: string }[] }[]; detail?: string | null; removedAt?: string | null; removalReason?: string | null }; editable: boolean; onRemove?: (reason: string) => Promise<void>; onQuantity?: (quantity: number) => Promise<void> }) {
  const removed = Boolean(line.removedAt);
  const reveal = 56;
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(line.quantity);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const drag = useRef<{ pointer: number; startX: number; startOffset: number; moved: boolean } | null>(null);
  useEffect(() => { setOffset(open ? -reveal : 0); }, [open]);
  const name = dishName(line);
  const amount = Number(line.subtotal ?? Number(line.unitPrice ?? line.menuItem?.price ?? 0) * line.quantity);
  const detail = line.detail || line.modifierSelections?.map((selection) => `${selection.groupName}: ${selection.options.map((option) => option.name).join(", ")}`).join(" · ");
  const body = <div className={`px-1 py-1 ${removed ? "text-[#a398a0]" : "text-muted"}`}>
    <div className="flex justify-between gap-2 text-xs">
      <span className={removed ? "line-through" : ""}>{line.quantity} × {name}{detail ? <small className={`block pl-4 text-[10px] ${removed ? "line-through" : ""}`}>{detail}</small> : null}</span>
      <span className="flex shrink-0 items-center gap-2">
        {editable && !removed && onQuantity && !editing && <button type="button" onClick={() => { setDraft(line.quantity); setEditing(true); setRemoving(false); setOpen(false); }} className="text-[10px] font-bold text-[#d20b79]">Edit</button>}
        <span className={removed ? "line-through" : ""}>{money(Number.isFinite(amount) ? amount : 0)}</span>
      </span>
    </div>
    {removed && <p className="mt-0.5 text-[10px] leading-4 text-[#8d939c]">Removed · {line.removalReason || "No reason given"}</p>}
    {editing && onQuantity && <form className="mt-2 flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); if (busy) return; if (draft === line.quantity) { setEditing(false); return; } setBusy(true); setNote(""); void onQuantity(draft).then(() => setEditing(false)).catch((cause: unknown) => setNote(errorMessage(cause))).finally(() => setBusy(false)); }}>
      <QuantityStepper value={draft} name={name} onChange={setDraft} />
      <button type="submit" disabled={busy} className="h-8 rounded-lg bg-[#2a2430] px-2.5 text-[11px] font-bold text-white disabled:opacity-40">Save</button>
    </form>}
    {removing && onRemove && <form className="mt-2 flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); const next = reason.trim(); if (!next || busy) return; setBusy(true); setNote(""); void onRemove(next).then(() => { setRemoving(false); setOpen(false); setReason(""); }).catch((cause: unknown) => setNote(errorMessage(cause))).finally(() => setBusy(false)); }}>
      <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this dish removed?" maxLength={240} className="h-8 min-w-0 flex-1 rounded-lg border border-[#eadfe6] bg-white px-2 text-[11px] text-ink outline-none focus:border-[#ed168c]" />
      <button type="submit" disabled={busy || !reason.trim()} className="h-8 rounded-lg bg-[#2a2430] px-2.5 text-[11px] font-bold text-white disabled:opacity-40">Done</button>
    </form>}
    {note && <p className="mt-1 text-[10px] text-rose-700">{note}</p>}
  </div>;
  if (!editable || removed || !onRemove) return <div className="ml-6 mt-1">{body}</div>;
  return <div className="relative ml-6 mt-1 overflow-hidden rounded-lg">
    <button type="button" onClick={() => { setRemoving(true); setEditing(false); setOpen(false); }} className="absolute inset-y-0 right-0 grid w-14 place-items-center bg-rose-600 text-white" aria-label={`Remove ${name}`}><Trash2 size={16} /></button>
    <div className="relative bg-white" style={{ transform: `translateX(${offset}px)`, transition: dragging ? "none" : "transform 180ms ease", touchAction: "pan-y" }}
      onPointerDown={(event) => { if (event.button !== 0 || (event.target as HTMLElement).closest("input, button, textarea, form")) return; drag.current = { pointer: event.pointerId, startX: event.clientX, startOffset: offset, moved: false }; setDragging(true); event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={(event) => { const current = drag.current; if (!current || current.pointer !== event.pointerId) return; const delta = event.clientX - current.startX; if (Math.abs(delta) > 8) current.moved = true; setOffset(Math.min(0, Math.max(-reveal, current.startOffset + delta))); }}
      onPointerUp={(event) => { const current = drag.current; if (!current || current.pointer !== event.pointerId) return; drag.current = null; setDragging(false); if (!current.moved) { if (open) setOpen(false); return; } const shouldOpen = current.startOffset + (event.clientX - current.startX) < -reveal / 2; setOpen(shouldOpen); setOffset(shouldOpen ? -reveal : 0); }}
      onPointerCancel={() => { drag.current = null; setDragging(false); setOffset(open ? -reveal : 0); }}
    >{body}</div>
  </div>;
}

function ChargeQuantityRow({ quantity, unitPrice, onSave }: { quantity: number; unitPrice: number | string; onSave: (quantity: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(quantity);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  return <div className="ml-6 mt-1 text-xs text-muted">
    <div className="flex items-center justify-between gap-2"><span>{quantity} × {money(unitPrice)}</span>{!editing && <button type="button" onClick={() => { setDraft(quantity); setEditing(true); }} className="text-[10px] font-bold text-[#d20b79]">Edit</button>}</div>
    {editing && <form className="mt-2 flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); if (busy) return; if (draft === quantity) { setEditing(false); return; } setBusy(true); setNote(""); void onSave(draft).then(() => setEditing(false)).catch((cause: unknown) => setNote(errorMessage(cause))).finally(() => setBusy(false)); }}>
      <QuantityStepper value={draft} name="quantity" onChange={setDraft} />
      <button type="submit" disabled={busy} className="h-8 rounded-lg bg-[#2a2430] px-2.5 text-[11px] font-bold text-white disabled:opacity-40">Save</button>
    </form>}
    {note && <p className="mt-1 text-[10px] text-rose-700">{note}</p>}
  </div>;
}
function chargeDish(line: { name?: string; quantity?: number; amount?: number | string; detail?: string | null; orderItemId?: string; unit?: number; removedAt?: string | null; removalReason?: string | null }, index: number) {
  return { id: line.orderItemId ? `${line.orderItemId}:${line.unit ?? index}` : `line-${index}`, quantity: line.quantity && line.quantity > 0 ? line.quantity : 1, subtotal: line.amount, menuItem: { name: line.name || "Item" }, detail: line.detail, removedAt: line.removedAt, removalReason: line.removalReason };
}
function plainTable(value: string) {
  return value.replace(/^table\s+/i, "").trim();
}
function stayDayKey(value?: string | null) {
  if (!value) return "";
  const when = new Date(value);
  return Number.isNaN(when.getTime()) ? "" : `${when.getFullYear()}-${when.getMonth()}-${when.getDate()}`;
}
function needsSignature(charge: RoomCharge) {
  return charge.kind === "RESTAURANT_ORDER" && !charge.signatureData;
}
function chargeTable(charge: RoomCharge, order?: Order) {
  const raw = order?.table?.tableNumber ? String(order.table.tableNumber) : charge.description.match(/^Table\s+(.+?)(?:\s+restaurant\b|\s+·|\s*:|$)/i)?.[1] ?? "";
  return plainTable(raw);
}
type RoomTabRow =
  | { kind: "single"; charge: RoomCharge; order?: Order }
  | { kind: "table"; key: string; table: string; when: string; charges: RoomCharge[]; orders: Order[] };
function groupRoomCharges(charges: RoomCharge[], orders: Order[]): RoomTabRow[] {
  const orderFor = (charge: RoomCharge) => charge.orderId ? orders.find((order) => order.id === charge.orderId) : undefined;
  const rows: RoomTabRow[] = [];
  const index = new Map<string, number>();
  for (const charge of charges) {
    const order = orderFor(charge);
    const table = charge.kind === "RESTAURANT_ORDER" && !charge.billNumber ? chargeTable(charge, order) : "";
    const when = charge.occurredAt || order?.createdAt || "";
    const key = table ? `${table}:${stayDayKey(when)}` : "";
    if (!key) {
      rows.push({ kind: "single", charge, order });
      continue;
    }
    const at = index.get(key);
    if (at == null) {
      index.set(key, rows.length);
      rows.push({ kind: "table", key, table, when, charges: [charge], orders: order ? [order] : [] });
    } else {
      const row = rows[at];
      if (row.kind === "table") {
        row.charges.push(charge);
        if (order && !row.orders.some((entry) => entry.id === order.id)) row.orders.push(order);
      }
    }
  }
  return rows;
}
function groupPaidOrders(orders: Order[], splitOrderIds: Set<string>) {
  const rows: { key: string; table: string; when: string; orders: Order[] }[] = [];
  const index = new Map<string, number>();
  for (const order of orders) {
    const table = !splitOrderIds.has(order.id) && order.table?.tableNumber ? plainTable(String(order.table.tableNumber)) : "";
    const when = order.createdAt;
    const key = table ? `${table}:${stayDayKey(when)}` : `order:${order.id}`;
    const at = index.get(key);
    if (at == null) {
      index.set(key, rows.length);
      rows.push({ key, table, when, orders: [order] });
    } else rows[at].orders.push(order);
  }
  return rows;
}

type PageResponse<T> = {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export function RoomsPage() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalKind>(null);
  const [assignStay, setAssignStay] = useState<CalendarStay | null>(null);
  const [assignRoomId, setAssignRoomId] = useState("");
  const [assignChoices, setAssignChoices] = useState<RoomChoice[]>([]);
  const [choicesLoading, setChoicesLoading] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [focusedRoomId, setFocusedRoomId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<RoomStay | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [stayHistoryValue, setStayHistory] = useState<RoomStay[]>([]);
  const [, setHistoryPage] = useState(1);
  const [, setHistoryTotalPages] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [roomHistoryOpen, setRoomHistoryOpen] = useState(false);
  const roomHistoryRef = useRef<HTMLElement>(null);
  const [signFor, setSignFor] = useState<{ ids: string[]; label: string } | null>(null);
  const [signName, setSignName] = useState("");
  const [signData, setSignData] = useState("");
  const [drawing, setDrawing] = useState(false);
  const signCanvasRef = useRef<HTMLCanvasElement>(null);
  const [, setHistoryLoadingMore] = useState(false);
  const [selectedStayId, setSelectedStayId] = useState<string | null>(null);
  const historyRequestRef = useRef(0);
  const preferredStayRef = useRef<string | null>(null);
  const [checkoutReceipt, setCheckoutReceipt] = useState<CheckoutReceipt | null>(null);
  const [roomNumber, setRoomNumber] = useState("");
  const [guestName, setGuestName] = useState("");
  const [occupants, setOccupants] = useState("");
  const [arrivalDate, setArrivalDate] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [expectedCheckoutAt, setExpectedCheckoutAt] = useState("");
  const [leaveTime, setLeaveTime] = useState("");
  const [guestNotes, setGuestNotes] = useState("");
  const [cashOnly, setCashOnly] = useState(false);
  const [chargeLimit, setChargeLimit] = useState("");
  const [chargeKind, setChargeKind] = useState<RoomChargeKind>("WATER");
  const [chargeDescription, setChargeDescription] = useState("");
  const [chargeQuantity, setChargeQuantity] = useState("1");
  const [chargePrice, setChargePrice] = useState("");
  const [commissionItemId, setCommissionItemId] = useState<string | null>(null);
  const [commissionItems, setCommissionItems] = useState<{ id: string; name: string; price: number; commission: number }[]>([]);
  const [roomPaymentMethod, setRoomPaymentMethod] = useState<RoomPaymentMethod>("CASH");
  const [cashOpen, setCashOpen] = useState(false);
  const [tendered, setTendered] = useState("");
  const [settlingChargeIds, setSettlingChargeIds] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deskView, setDeskView] = useState<"folios" | "calendar">("folios");
  const [calendarToken, setCalendarToken] = useState(0);
  const [roomFilter, setRoomFilter] = useState<"ALL" | "OCCUPIED" | "ARRIVING" | "DEPARTING" | "VACANT">("ALL");
  const [roomSearch, setRoomSearch] = useState("");
  const [editMode, setEditMode] = useState(false);
  const currentUser = useAuthStore((state) => state.user);
  const isAdmin = currentUser?.role === "ADMIN";
  const canManageStays = hasJobPermission(currentUser, "ROOM_MANAGE");
  const canManageFolios = hasJobPermission(currentUser, "ROOM_FOLIO");
  const notify = useUiStore((state) => state.notify);
  const restaurantName = useUiStore((state) => state.restaurantName);
  const restaurantLogoUrl = useUiStore((state) => state.restaurantLogoUrl);

  const createFolioReceipt = (stay: RoomStay): CheckoutReceipt => ({
    locationLabel: `Room ${stay.room?.roomNumber ?? ""} · Folio checkout`,
    orders: stay.orders ?? [],
    folioCharges: stay.charges ?? [],
    paymentMethod: Number(stay.balanceDue ?? stay.folioTotal ?? 0) > 0 ? "ROOM_CHECKOUT" : stay.payments?.length ? stay.payments[stay.payments.length - 1].method : "ROOM_CHECKOUT",
    receiptKind: "STAY_CHECKOUT",
    room: stay.room ? { roomNumber: stay.room.roomNumber, guestName: stay.primaryGuestName, guestNames: [...new Set([stay.primaryGuestName, ...stay.occupants.map((occupant) => occupant.name)])] } : null,
    totalAmount: Number(stay.grossTotal ?? stay.folioTotal ?? (stay.charges ?? []).reduce((sum, charge) => sum + Number(charge.amount), 0)),
    checkedOutAt: stay.checkedOutAt ?? new Date().toISOString(),
    cashierName: currentUser?.name ?? "Restaurant staff",
  });
  const openOrderReceipt = (order: Order) => setCheckoutReceipt({
    tableNumber: order.table?.tableNumber,
    locationLabel: order.type === "ROOM_SERVICE" || !order.table ? "Room service" : `Table ${order.table.tableNumber}`,
    orders: [order],
    paymentMethod: order.paymentMethod,
    room: null,
    rooms: order.roomGuestsSnapshot?.length ? order.roomGuestsSnapshot : order.roomStay?.room ? [{ roomNumber: order.roomStay.room.roomNumber, guestName: order.roomStay.primaryGuestName, guestNames: [...new Set([order.roomStay.primaryGuestName, ...order.roomStay.occupants.map((occupant) => occupant.name)])] }] : [],
    totalAmount: Number(order.totalAmount),
    checkedOutAt: order.paidAt ?? order.updatedAt,
    cashierName: order.paidBy?.name ?? order.waiter?.name ?? currentUser?.name ?? "Restaurant staff",
    ...(order.paymentMethod === "ROOM_CHECKOUT" && order.roomCharge?.signatureData ? { signature: { name: order.roomCharge.signedByName || "Guest", data: order.roomCharge.signatureData } } : {}),
  });
  const openOrdersReceipt = (list: Order[]) => {
    if (list.length <= 1) {
      if (list[0]) openOrderReceipt(list[0]);
      return;
    }
    const first = list[0];
    const table = first.table?.tableNumber ? plainTable(String(first.table.tableNumber)) : "";
    const rooms = list.flatMap((order) => order.roomGuestsSnapshot?.length ? order.roomGuestsSnapshot : order.roomStay?.room ? [{ roomNumber: order.roomStay.room.roomNumber, guestName: order.roomStay.primaryGuestName, guestNames: [...new Set([order.roomStay.primaryGuestName, ...order.roomStay.occupants.map((occupant) => occupant.name)])] }] : []);
    setCheckoutReceipt({
      tableNumber: table || first.table?.tableNumber,
      locationLabel: table ? `Table ${table}` : list.every((order) => order.type === "ROOM_SERVICE" || !order.table) ? "Room service" : "Restaurant",
      orders: list,
      folioCharges: list.map((order) => ({
        id: order.id,
        orderId: order.id,
        kind: "RESTAURANT_ORDER" as const,
        description: table ? `Table ${table} restaurant order` : order.type === "ROOM_SERVICE" || !order.table ? "Room service" : "Restaurant order",
        quantity: 1,
        unitPrice: order.totalAmount,
        amount: order.totalAmount,
        occurredAt: order.createdAt,
        signedByName: order.roomCharge?.signedByName ?? null,
        signatureData: order.roomCharge?.signatureData ?? null,
      })),
      paymentMethod: first.paymentMethod,
      room: null,
      rooms,
      totalAmount: list.reduce((sum, order) => sum + Number(order.totalAmount), 0),
      checkedOutAt: list.map((order) => order.paidAt ?? order.updatedAt).sort().slice(-1)[0] ?? new Date().toISOString(),
      cashierName: first.paidBy?.name ?? first.waiter?.name ?? currentUser?.name ?? "Restaurant staff",
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Room[]>("/rooms");
      setRooms([...data].sort((left, right) => String(left.roomNumber).localeCompare(String(right.roomNumber), undefined, { numeric: true, sensitivity: "base" })));
      setCalendarToken((token) => token + 1);
      setFocusedRoomId((current) => current && data.some((room) => room.id === current) ? current : null);
    }
    catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const openRoom = (room?: Room) => {
    setEditingRoom(room ?? null);
    setRoomNumber(room ? String(room.roomNumber) : "");
    setError("");
    setModal("room");
  };
  const saveRoom = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const payload = { roomNumber: roomNumber.trim() };
      if (editingRoom) await api.patch(`/rooms/${editingRoom.id}`, payload);
      else await api.post("/rooms", payload);
      setModal(null); notify(editingRoom ? "Room updated." : "Room added."); await load();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const deleteRoom = async (room: Room) => {
    if (!window.confirm(`Permanently delete room ${room.roomNumber}, all guest stays and folio charges, and all linked room-service orders? This cannot be undone.`)) return;
    setError("");
    try {
      await api.delete(`/rooms/${room.id}?deleteHistory=true`);
      setRooms((current) => current.filter((item) => item.id !== room.id));
      notify(`Room ${room.roomNumber} and its history were permanently deleted.`);
    } catch (e) { setError(errorMessage(e)); }
  };
  const changeRoomStatus = async (room: Room, status: Room["status"]) => {
    setError("");
    try {
      const { data } = await api.patch<Room>(`/rooms/${room.id}/status`, { status });
      setRooms((current) => current.map((item) => item.id === room.id ? { ...item, ...data, stays: item.stays } : item));
      notify(`Room ${room.roomNumber} marked ${status.toLowerCase().replace(/_/g, " ")}.`);
    } catch (e) { setError(errorMessage(e)); }
  };
  const checkIn = async (event: FormEvent) => {
    event.preventDefault(); if (!selectedRoom) return; setBusy(true); setError("");
    try {
      const names = occupants.split(/[\n,]/).map((value) => value.trim()).filter(Boolean);
      await api.post(`/rooms/${selectedRoom.id}/check-in`, { primaryGuestName: guestName, occupants: [guestName, ...names], ...(arrivalDate ? { checkedInAt: atLocal(arrivalDate, arrivalTime).toISOString() } : {}), expectedCheckoutAt: expectedCheckoutAt ? atLocal(expectedCheckoutAt, leaveTime).toISOString() : undefined, guestNotes, cashOnly, chargeLimit: chargeLimit === "" ? null : Number(chargeLimit) });
      setModal(null); setGuestName(""); setOccupants(""); setGuestNotes(""); notify(`Guest checked into room ${selectedRoom.roomNumber}.`); await load();
    } catch (e) {
      setError(errorMessage(e));
    }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (modal !== "charge") return;
    let cancelled = false;
    void api.get<{ id: string; name: string; price: number; commission: number }[]>("/rooms/commission-items")
      .then(({ data }) => { if (!cancelled) setCommissionItems(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setCommissionItems([]); });
    return () => { cancelled = true; };
  }, [modal]);
  const openCheckIn = (room: Room) => {
    setSelectedRoom(room); setGuestName(""); setOccupants(""); setGuestNotes(""); setCashOnly(false); setChargeLimit("");
    const now = new Date();
    const start = localDay(now);
    setArrivalDate(start); setArrivalTime(localTime(now));
    setExpectedCheckoutAt(nextDay(start)); setLeaveTime(localTime(now));
    setError(""); setModal("checkin");
  };
  const openArrival = (room: Room, date?: string) => {
    setSelectedRoom(room); setGuestName(""); setOccupants(""); setGuestNotes(""); setCashOnly(false); setChargeLimit("");
    const now = new Date();
    const start = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localDay(now);
    const time = localTime(now);
    setArrivalDate(start); setArrivalTime(time);
    setExpectedCheckoutAt(nextDay(start)); setLeaveTime(time);
    setError(""); setModal("arrival");
  };
  const addCharge = async (event: FormEvent) => {
    event.preventDefault();
    const stayId = timeline?.id ?? selectedStayId ?? selectedRoom?.stays?.[0]?.id;
    if (!stayId) return;
    setBusy(true); setError("");
    try {
      await api.post(`/rooms/stays/${stayId}/charges`, { kind: chargeKind, description: chargeDescription, quantity: Number(chargeQuantity), unitPrice: Number(chargePrice), ...(commissionItemId ? { commissionItemId } : {}) });
      setModal(null); setCommissionItemId(null); setChargeDescription(""); setChargeQuantity("1"); setChargePrice(""); notify("Room usage added to the folio."); await openTimeline(stayId); await load();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const loadStayHistory = useCallback(async (roomId: string, page = 1, append = false) => {
    const requestId = ++historyRequestRef.current;
    if (append) setHistoryLoadingMore(true);
    else setHistoryLoading(true);
    try {
      const response = await api.get<PageResponse<RoomStay> | RoomStay[]>(
        `/rooms/${roomId}/stays?page=${page}&limit=${HISTORY_PAGE_SIZE}`,
      );
      if (requestId !== historyRequestRef.current) return;

      // Support the expected paginated response and the legacy array response.
      // This prevents a response-shape mismatch from setting stayHistoryValue to undefined.
      const payload = response?.data;
      const pageRows: RoomStay[] = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : [];
      const responsePage = !Array.isArray(payload) && Number.isFinite(payload?.page)
        ? payload.page
        : page;
      const responseTotalPages = !Array.isArray(payload) && Number.isFinite(payload?.totalPages)
        ? payload.totalPages
        : 1;

      setStayHistory((current) => {
        const safeCurrent = Array.isArray(current) ? current : [];
        if (!append) return pageRows;
        const known = new Set(safeCurrent.map((stay) => stay.id));
        return [...safeCurrent, ...pageRows.filter((stay) => !known.has(stay.id))];
      });
      setHistoryPage(responsePage);
      setHistoryTotalPages(responseTotalPages);
      return pageRows;
    } catch (e) {
      if (requestId === historyRequestRef.current) setError(errorMessage(e));
      return undefined;
    } finally {
      if (requestId === historyRequestRef.current) {
        setHistoryLoading(false);
        setHistoryLoadingMore(false);
      }
    }
  }, []);

  const openAssign = (stay: CalendarStay) => {
    setAssignStay(stay);
    setAssignRoomId("");
    setAssignChoices([]);
    setError("");
    setModal("assign");
    setChoicesLoading(true);
    void (async () => {
      try {
        const { data } = await api.get<RoomChoice[]>(`/rooms/stays/${stay.id}/room-choices`);
        setAssignChoices(data);
        const first = data.find((room) => room.available && room.suggested) ?? data.find((room) => room.available);
        setAssignRoomId(first?.id ?? "");
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setChoicesLoading(false);
      }
    })();
  };
  const assignRoom = async () => {
    if (!assignStay || !assignRoomId) return;
    const choice = assignChoices.find((room) => room.id === assignRoomId);
    setBusy(true);
    setError("");
    try {
      await api.post(`/rooms/stays/${assignStay.id}/assign`, { roomId: assignRoomId });
      notify(`${assignStay.guestName} assigned to ${roomLabel(choice?.roomNumber ?? "")}.`);
      setModal(null);
      setAssignStay(null);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const moveGuest = async (stay: CalendarStay, room: { id: string; roomNumber: string }) => {
    await api.post(`/rooms/stays/${stay.id}/assign`, { roomId: room.id });
    notify(`${stay.guestName} assigned to ${roomLabel(room.roomNumber)}.`);
    await load();
  };
  const openTimeline = async (stayId: string) => {
    setSelectedStayId(stayId);
    setTimeline(null);
    setTimelineLoading(true);
    setError("");

    try {
      const { data } = await api.get<RoomStay>(
        `/rooms/stays/${stayId}/timeline`
      );
      setTimeline(data);
    } catch (e) {
      setTimeline(null);
      setError(errorMessage(e));
    } finally {
      setTimelineLoading(false);
    }
  };
  const removeRoomDish = async (orderId: string, itemId: string, reason: string) => {
    await api.patch(`/orders/${orderId}/items/${itemId}/remove`, { reason });
    const stayId = selectedStayId ?? timeline?.id;
    if (!stayId) return;
    const { data } = await api.get<RoomStay>(`/rooms/stays/${stayId}/timeline`);
    setTimeline(data);
  };
  const removeChargeLine = async (chargeId: string, orderItemId: string, unit: number, reason: string) => {
    await api.patch(`/rooms/charges/${chargeId}/lines/remove`, { orderItemId, unit, reason });
    const stayId = selectedStayId ?? timeline?.id;
    if (!stayId) return;
    const { data } = await api.get<RoomStay>(`/rooms/stays/${stayId}/timeline`);
    setTimeline(data);
  };
  const rememberStay = (stay: RoomStay) => setTimeline(stay);
  const setChargeLineQuantity = async (chargeId: string, orderItemId: string, unit: number, quantity: number) => {
    const { data } = await api.patch<RoomStay>(`/rooms/charges/${chargeId}/lines/quantity`, { orderItemId, unit, quantity });
    rememberStay(data);
  };
  const setChargedItemQuantity = async (chargeId: string, itemId: string, quantity: number) => {
    const { data } = await api.patch<RoomStay>(`/rooms/charges/${chargeId}/items/${itemId}/quantity`, { quantity });
    rememberStay(data);
  };
  const saveChargeQuantity = async (chargeId: string, quantity: number) => {
    const { data } = await api.patch<RoomStay>(`/rooms/charges/${chargeId}/quantity`, { quantity });
    rememberStay(data);
  };
  const openSign = (ids: string[], label: string) => {
    setSignName(timeline?.primaryGuestName ?? "");
    setSignData("");
    setDrawing(false);
    setSignFor({ ids, label });
  };
  const saveSign = async () => {
    if (!signFor || !signName.trim() || !signData) return;
    setBusy(true);
    setError("");
    try {
      let latest: RoomStay | null = null;
      for (const id of signFor.ids) {
        const { data } = await api.patch<RoomStay>(`/rooms/charges/${id}/signature`, { signedByName: signName.trim(), signatureData: signData });
        latest = data;
      }
      if (latest) setTimeline(latest);
      setSignFor(null);
      notify("Signature saved on the room tab.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const signPoint = (event: { clientX: number; clientY: number }) => {
    const canvas = signCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  };
  const focusRoom = (room: Room) => {
    setFocusedRoomId(room.id);
    setTimeline(null);
    setStayHistory([]);
    setSelectedStayId(null);
    setHistoryPage(1);
    setHistoryTotalPages(1);
    setError("");
  };
  const checkOut = async () => {
    if (!timeline) return;
    if (Number(timeline.balanceDue ?? timeline.folioTotal ?? 0) > 0) {
      setSettlingChargeIds(null);
      setSelectedRoom(focusedRoom);
      setRoomPaymentMethod("CASH");
      setTendered("");
      setCashOpen(true);
      setModal("settle");
      return;
    }
    if (!window.confirm(`Check out ${timeline.primaryGuestName}?`)) return;
    setBusy(true); setError("");
    try {
      const { data } = await api.post<RoomStay>(`/rooms/stays/${timeline.id}/check-out`);
      setTimeline(data);
      setCheckoutReceipt(createFolioReceipt(data));
      notify("Guest checked out. Room folio closed."); await load();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const settleTab = async () => {
    if (!timeline) return;
    setBusy(true); setError("");
    try {
      const singleBill = Boolean(settlingChargeIds?.length);
      const { data } = await api.post<RoomStay>(`/rooms/stays/${timeline.id}/settle`, { method: roomPaymentMethod, ...(settlingChargeIds?.length ? { chargeIds: settlingChargeIds } : {}) });
      setTimeline(data); setSettlingChargeIds(null); setCashOpen(false); setTendered(""); notify(singleBill ? `Bill settled by ${roomPaymentMethod === "CARD" ? "card" : "cash"}.` : `Room tab settled by ${roomPaymentMethod.toLowerCase()}.`); setModal(null); await load();
    } catch (e) {
      setError(errorMessage(e));
    }
    finally { setBusy(false); }
  };
  const activeRooms = rooms.filter((room) => guestInRoom(room) && room.status !== "MAINTENANCE" && room.status !== "ARCHIVED").length;
  const todayKey = new Date().toLocaleDateString();
  const isToday = (value?: string | null) => value ? new Date(value).toLocaleDateString() === todayKey : false;
  const arrivingRooms = rooms.filter((room) => { const stay = guestInRoom(room); return !!stay && isToday(stay.checkedInAt); }).length;
  const departingRooms = rooms.filter((room) => { const stay = guestInRoom(room); return !!stay && isToday(stay.expectedCheckoutAt); }).length;
  const vacantRooms = rooms.filter((room) => !guestInRoom(room) && room.status !== "MAINTENANCE" && room.status !== "ARCHIVED").length;
  const visibleRooms = rooms.filter((room) => {
    const stay = guestInRoom(room);
    const matchesFilter = roomFilter === "ALL" ||
      (roomFilter === "OCCUPIED" && !!stay) ||
      (roomFilter === "VACANT" && !stay && room.status !== "MAINTENANCE" && room.status !== "ARCHIVED") ||
      (roomFilter === "ARRIVING" && !!stay && isToday(stay.checkedInAt)) ||
      (roomFilter === "DEPARTING" && !!stay && isToday(stay.expectedCheckoutAt));
    const query = roomSearch.trim().toLowerCase();
    return matchesFilter && (!query || String(room.roomNumber).toLowerCase().includes(query) || stay?.primaryGuestName.toLowerCase().includes(query) || stay?.occupants.some((guest) => guest.name.toLowerCase().includes(query)));
  });
  const focusedRoom = rooms.find((room) => room.id === focusedRoomId) ?? null;
  // Defensive guard for stale React Fast Refresh state or unexpected runtime values.
  const safeStayHistory = Array.isArray(stayHistoryValue) ? stayHistoryValue : [];
  const pastStays = safeStayHistory.filter((stay) => {
    if (isInHouse(stay)) return false;
    if (stay.checkedOutAt || stay.cancelledAt) return true;
    const end = stayTime(stay.expectedCheckoutAt);
    return end != null && end <= Date.now();
  }).sort((left, right) => (right.checkedOutAt ?? right.cancelledAt ?? right.checkedInAt).localeCompare(left.checkedOutAt ?? left.cancelledAt ?? left.checkedInAt));
  const shownStays = (() => {
    const current = staysOnThisRoom(safeStayHistory);
    const inRoom = focusedRoom ? guestInRoom(focusedRoom) : null;
    return inRoom && !current.some((stay) => stay.id === inRoom.id) ? [inRoom, ...current] : current;
  })();
  const focusedStay = safeStayHistory.find((stay) => stay.id === selectedStayId)
    ?? (focusedRoom ? guestInRoom(focusedRoom) : null)
    ?? shownStays.find((stay) => !stay.checkedOutAt)
    ?? null;
  const isFocusedStayActive = !!focusedStay && !focusedStay.checkedOutAt && !focusedStay.cancelledAt;
  const vatPercent = useUiStore((state) => state.vatPercent);
  const settlingBill = Boolean(settlingChargeIds?.length);
  const openChargesForDue = (timeline?.charges ?? []).filter((charge) => !charge.settledAt && charge.kind !== "ROOM_FEE");
  const settleCharges = settlingBill ? openChargesForDue.filter((charge) => settlingChargeIds?.includes(charge.id)) : openChargesForDue;
  const dueFor = (charges: typeof openChargesForDue) => {
    const priced = charges.map((charge) => priceFolioCharge(charge, charge.orderId ? timeline?.orders?.find((order) => order.id === charge.orderId) : undefined, vatPercent));
    const vat = moneyRound(priced.reduce((sum, row) => sum + row.vat, 0));
    const exact = moneyRound(priced.reduce((sum, row) => sum + row.total, 0));
    return { vat, total: vat > 0 ? roundUpBaht(exact) : exact };
  };
  const openDue = dueFor(openChargesForDue);
  const settlingDue = dueFor(settleCharges);
  const settleAmount = settlingDue.total;
  const settleVat = settlingDue.vat;

  useEffect(() => {
    if (!focusedRoomId) {
      historyRequestRef.current += 1;
      setStayHistory([]);
      setSelectedStayId(null);
      setTimeline(null);
      setRoomHistoryOpen(false);
      setHistoryPage(1);
      setHistoryTotalPages(1);
      return;
    }

    let cancelled = false;
    const roomId = focusedRoomId;
    setStayHistory([]);
    setSelectedStayId(null);
    setTimeline(null);
    setRoomHistoryOpen(false);
    setHistoryPage(1);
    setHistoryTotalPages(1);
    void (async () => {
      const rows = await loadStayHistory(roomId, 1, false);
      if (cancelled || !rows) return;
      const preferred = preferredStayRef.current;
      preferredStayRef.current = null;
      const shown = staysOnThisRoom(rows);
      const defaultStay = (preferred && rows.find((stay) => stay.id === preferred)) ?? shown.find((stay) => isInHouse(stay)) ?? shown.find((stay) => !stay.checkedOutAt) ?? shown[0] ?? null;
      if (preferred) void openTimeline(preferred);
      else if (defaultStay) void openTimeline(defaultStay.id);
      else {
        setSelectedStayId(null);
        setTimeline(null);
      }
    })();
    return () => { cancelled = true; };
  }, [focusedRoomId, loadStayHistory]);
  return <>
    <div className="page-enter min-h-full w-full">
      <div className="mb-5 flex items-center justify-between gap-4"><div><h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">Rooms</h1><p className="mt-1 text-[11px] text-muted">Who’s staying, what’s on their tab, and who arrives or leaves today.</p></div><div className="flex shrink-0 items-center gap-2">{isAdmin && <button type="button" onClick={() => setEditMode((value) => !value)} title={editMode ? "Done editing rooms" : "Edit rooms"} className={`grid h-9 w-9 place-items-center rounded-xl border ${editMode ? "border-[#f01898] bg-pink-50 text-[#d20b79]" : "border-line bg-white text-muted hover:text-ink"}`}><Pencil size={14} /></button>}{canManageStays && <button type="button" disabled={!rooms.some((room) => roomIsEmpty(room))} onClick={() => { const available = rooms.find((room) => roomIsEmpty(room)); if (available) openCheckIn(available); }} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#f01898] px-3.5 text-[11px] font-bold text-white shadow-sm disabled:opacity-50"><Plus size={13} /> Check in</button>}</div></div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      <div className="mb-4 inline-flex rounded-lg bg-[#fff4f9] p-0.5">{(["folios", "calendar"] as const).map((view) => <button key={view} type="button" onClick={() => setDeskView(view)} className={`h-8 rounded-md px-3 text-[11px] font-bold ${deskView === view ? "bg-white text-ink shadow-sm" : "text-muted"}`}>{view === "calendar" ? "Calendar" : "Room"}</button>)}</div>
      {deskView === "calendar" && <RoomCalendar reloadToken={calendarToken} onVacant={(roomId, date) => { const room = rooms.find((item) => item.id === roomId); if (canManageStays && room && roomIsEmpty(room)) openArrival(room, date); }} onUnassigned={openAssign} onMove={canManageStays ? moveGuest : undefined} onStay={(roomId, stayId) => { const room = rooms.find((item) => item.id === roomId); if (!room) return; preferredStayRef.current = stayId; if (focusedRoomId === roomId) void openTimeline(stayId); else focusRoom(room); }} />}
      {deskView === "folios" && <>
      <div className="mb-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
        <Panel className="flex items-center gap-2.5 rounded-2xl p-3"><BedDouble size={16} className="text-[#ec1593]" /><div><p className="text-sm font-extrabold leading-none">{rooms.length}</p><p className="mt-1 text-[9px] text-muted">Total rooms</p></div></Panel>
        <Panel className="flex items-center gap-2.5 rounded-2xl p-3"><Users size={16} className="text-rose-500" /><div><p className="text-sm font-extrabold leading-none">{activeRooms}</p><p className="mt-1 text-[9px] text-muted">Occupied</p></div></Panel>
        <Panel className="flex items-center gap-2.5 rounded-2xl p-3"><ArrowDownToLine size={16} className="text-emerald-600" /><div><p className="text-sm font-extrabold leading-none">{arrivingRooms}</p><p className="mt-1 text-[9px] text-muted">Arriving today</p></div></Panel>
        <Panel className="flex items-center gap-2.5 rounded-2xl p-3"><ArrowUpFromLine size={16} className="text-emerald-600" /><div><p className="text-sm font-extrabold leading-none">{departingRooms}</p><p className="mt-1 text-[9px] text-muted">Departing today</p></div></Panel>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2"><div className="flex flex-1 flex-wrap gap-1.5">{(["ALL", "OCCUPIED", "ARRIVING", "DEPARTING", "VACANT"] as const).map((filter) => { const count = filter === "ALL" ? rooms.length : filter === "OCCUPIED" ? activeRooms : filter === "ARRIVING" ? arrivingRooms : filter === "DEPARTING" ? departingRooms : vacantRooms; const label = filter === "ALL" ? "All" : filter === "OCCUPIED" ? "Occupied" : filter === "ARRIVING" ? "Arriving" : filter === "DEPARTING" ? "Departing" : "Vacant"; return <button key={filter} type="button" onClick={() => setRoomFilter(filter)} className={`rounded-lg px-2.5 py-1.5 text-[9px] font-bold transition ${roomFilter === filter ? "bg-[#f01898] text-white" : "bg-white text-muted hover:bg-pink-50 hover:text-[#bf0c73]"}`}>{label}{filter !== "ALL" && <span className="ml-1 opacity-70">{count}</span>}</button>; })}</div><label className="flex h-8 w-full items-center gap-2 rounded-lg border border-line bg-white px-2.5 text-muted sm:w-48"><Search size={12} /><input value={roomSearch} onChange={(event) => setRoomSearch(event.target.value)} placeholder="Search room or surname" className="w-full bg-transparent text-[10px] text-ink outline-none placeholder:text-muted" /></label></div>
      {loading ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="aspect-[262/178] min-h-[178px] animate-pulse rounded-2xl bg-white" />)}</div> : rooms.length ? visibleRooms.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{visibleRooms.map((room) => {
        const stay = guestInRoom(room);
        const badge = roomBadge(room);
        const tabTotal = Number(stay?.folioTotal ?? (stay?.charges ?? []).reduce((sum, charge) => sum + Number(charge.amount), 0));
        const stripeColor = badge.label === "Vacant" ? "#19bf8f" : badge.label === "Under maintenance" ? "#ffb11b" : badge.label === "Archived" ? "#b8b2b6" : badge.label === "Arriving" ? "#f6c4de" : badge.label === "Departing" ? "#f3c56b" : "#ff6685";
        return <Panel key={room.id} className="flex min-h-[178px] flex-col overflow-hidden rounded-[15px] border border-[#f1dfe7] bg-white shadow-[0_3px_12px_rgba(63,29,46,0.035)] transition-shadow hover:shadow-card">
          <div className="h-1.5 w-full" style={{ backgroundColor: stripeColor }} />
          <button type="button" onClick={() => focusRoom(room)} className="flex min-h-0 w-full flex-1 flex-col px-5 pb-4 pt-4 text-left">
            <div className="flex items-center justify-between gap-2"><h3 className="font-display text-lg font-extrabold leading-6">{roomLabel(room.roomNumber)}</h3><span className={`rounded-full px-2.5 py-1.5 text-[9px] font-bold leading-none ${badge.className}`}>{badge.label}</span></div>
            <div className="mt-3 rounded-lg bg-[#fff7fa] px-4 py-3">{stay ? <p className="truncate text-sm font-semibold leading-5 text-ink">{[...new Set([stay.primaryGuestName, ...stay.occupants.map((person) => person.name)])].join(" and ")}</p> : <><p className="text-[11px] leading-4 text-muted">No one checked in</p><p className="mt-0.5 text-[10px] leading-4 text-muted">Ready for the next guest</p></>}</div>
            <div className="mt-auto flex items-center gap-2 pt-2 text-xs"><span className="text-muted">Tab</span><strong className="text-sm text-ink">{stay ? money(tabTotal) : "—"}</strong></div>
          </button>
          {((roomIsEmpty(room) && canManageStays) || (isAdmin && editMode)) && <div className="flex shrink-0 gap-2 px-3.5 pb-3.5">{roomIsEmpty(room) && canManageStays && <button onClick={() => openCheckIn(room)} className="h-8 flex-1 rounded-lg border border-[#f7bfdc] text-[9px] font-bold hover:bg-pink-50">Check in</button>}{isAdmin && editMode && <><button onClick={() => openRoom(room)} className="h-8 flex-1 rounded-lg border border-line text-[9px] font-bold hover:bg-canvas">Edit room</button><button onClick={() => void deleteRoom(room)} aria-label={`Delete room ${room.roomNumber}`} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-600"><Trash2 size={13} /></button></>}</div>}
          {isAdmin && editMode && !stay && <div className="px-3.5 pb-3.5"><SelectField label="Room status" value={room.status} onChange={(event) => void changeRoomStatus(room, event.target.value as Room["status"])}><option value="AVAILABLE">Available to rent</option><option value="MAINTENANCE">Under maintenance</option><option value="ARCHIVED">Archived (keep history)</option></SelectField></div>}
        </Panel>;
      })}{isAdmin && <button type="button" onClick={() => openRoom()} className="flex aspect-[262/178] min-h-[178px] flex-col items-center justify-center rounded-[15px] border border-dashed border-[#f3c6db] bg-white/70 text-center transition hover:border-[#f01898] hover:bg-white"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#ffe4f2] text-[#f01898]"><Plus size={18} /></span><span className="mt-3 text-sm font-bold text-ink">Add room</span><span className="mt-1 text-[11px] text-muted">Set up a new room</span></button>}</div> : <Panel className="p-10 text-center"><p className="text-sm font-semibold">No rooms match this view.</p><p className="mt-1 text-xs text-muted">Change the filter or search term to see other rooms.</p></Panel> : isAdmin ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"><button type="button" onClick={() => openRoom()} className="flex aspect-[262/178] min-h-[178px] flex-col items-center justify-center rounded-[15px] border border-dashed border-[#f3c6db] bg-white/70 text-center transition hover:border-[#f01898] hover:bg-white"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#ffe4f2] text-[#f01898]"><Plus size={18} /></span><span className="mt-3 text-sm font-bold text-ink">Add room</span><span className="mt-1 text-[11px] text-muted">Set up a new room</span></button></div> : <Panel className="p-12 text-center"><BedDouble className="mx-auto text-muted" /><p className="mt-3 font-semibold">No rooms configured</p><p className="mt-1 text-sm text-muted">Add a room to begin managing guest stays and folios.</p></Panel>}

      </>}
      {focusedRoom && createPortal(<div className="fixed inset-0 z-40 flex h-[100dvh] w-screen justify-end bg-[#291923]/35 backdrop-blur-[1px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setFocusedRoomId(null); }}><aside className="flex h-full w-full flex-col overflow-hidden border-l border-line bg-white shadow-float md:w-[min(70vw,960px)] lg:w-[min(60vw,1040px)]"><div className="flex items-center justify-between border-b border-[#f4e6ed] px-6 py-4"><div><div className="flex items-center gap-2"><h2 className="font-display text-2xl font-extrabold">{roomLabel(focusedRoom.roomNumber)}</h2><span className={`rounded-full px-2 py-1 text-xs font-bold ${roomBadge(focusedRoom).className}`}>{roomBadge(focusedRoom).label}</span></div></div><button type="button" onClick={() => setFocusedRoomId(null)} aria-label="Close room details" className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-canvas"><X size={20} /></button></div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <section className="mb-4 rounded-xl border border-[#f2e6ec] p-3.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div><h3 className="text-sm font-extrabold">Who is staying</h3><p className="mt-0.5 text-xs text-muted">Only the guest in this room right now. Later bookings stay on the calendar.</p></div>
              <span className="text-[11px] text-muted">{shownStays.length}{historyLoading ? " · Loading…" : ""}</span>
            </div>
            {historyLoading && safeStayHistory.length === 0 ? <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-[#fbf1f6]" />)}</div>
              : shownStays.length ? <div className="space-y-2">
                {shownStays.map((stay) => {
                  const here = isInHouse(stay);
                  const selected = stay.id === selectedStayId;
                  const guestNames = [...new Set([stay.primaryGuestName, ...(stay.occupants ?? []).map((person) => person.name)])].join(" and ");
                  const label = stay.checkedOutAt ? "Checked out" : here ? "Current" : "Arriving";
                  return <button key={stay.id} type="button" onClick={() => void openTimeline(stay.id)} className={`w-full rounded-lg border p-3 text-left transition ${selected ? "border-[#f01898] bg-pink-50" : "border-[#f1e3ea] hover:bg-[#fff9fc]"}`}>
                    <div className="flex items-start justify-between gap-2"><span className="min-w-0 truncate text-[13px] font-bold">{guestNames || "Guest stay"}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${here ? "bg-emerald-50 text-emerald-700" : stay.checkedOutAt ? "bg-slate-100 text-slate-600" : "bg-[#ffe8f4] text-[#b30d6e]"}`}>{label}</span></div>
                    <p className="mt-1 text-[11px] text-muted">{dateTime(stay.checkedInAt)}{stay.checkedOutAt ? ` · Checked out ${dateTime(stay.checkedOutAt)}` : stay.expectedCheckoutAt ? ` · Expected ${dateTime(stay.expectedCheckoutAt)}` : ""}</p>
                  </button>;
                })}
              </div> : <p className="py-3 text-xs text-muted">{safeStayHistory.length ? "No guest is checked in right now." : "No stays recorded for this room yet."}</p>}
          </section>
          {roomHistoryOpen && <section ref={roomHistoryRef} className="mb-4 rounded-xl border border-[#f2e6ec] p-3.5">
            <div className="mb-2"><h3 className="text-sm font-extrabold">Room history</h3><p className="mt-0.5 text-xs text-muted">Guests who have already left this room.</p></div>
            {historyLoading && safeStayHistory.length === 0 ? <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-[#fbf1f6]" />)}</div>
              : pastStays.length ? <div className="space-y-2">{pastStays.map((stay) => {
                const selected = stay.id === selectedStayId;
                const guestNames = [...new Set([stay.primaryGuestName, ...(stay.occupants ?? []).map((person) => person.name)])].join(" and ");
                const label = stay.cancelledAt ? "Cancelled" : "Checked out";
                return <button key={stay.id} type="button" onClick={() => void openTimeline(stay.id)} className={`w-full rounded-lg border p-3 text-left transition ${selected ? "border-[#f01898] bg-pink-50" : "border-[#f1e3ea] hover:bg-[#fff9fc]"}`}>
                  <div className="flex items-start justify-between gap-2"><span className="min-w-0 truncate text-[13px] font-bold">{guestNames || "Guest stay"}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${stay.cancelledAt ? "bg-slate-100 text-slate-600" : "bg-slate-100 text-slate-600"}`}>{label}</span></div>
                  <p className="mt-1 text-[11px] text-muted">{dateTime(stay.checkedInAt)}{stay.checkedOutAt ? ` · Checked out ${dateTime(stay.checkedOutAt)}` : stay.cancelledAt ? ` · Cancelled ${dateTime(stay.cancelledAt)}` : ""}</p>
                </button>;
              })}</div> : <p className="py-3 text-xs text-muted">No past stays for this room.</p>}
          </section>}
          {focusedStay && timeline ? <>
            {focusedStay.guestNotes && <section className="border-b border-[#f3e7ed] pb-3"><div className="rounded-lg bg-amber-50 px-2.5 py-3 text-[13px] font-medium text-amber-900"><span className="font-bold">Guest note:</span> {focusedStay.guestNotes}</div></section>}
            {(() => {
              const charges = timeline.charges ?? []; const openCharges = charges.filter((charge) => !charge.settledAt); const settledCharges = charges.filter((charge) => !!charge.settledAt); const orders = timeline.orders ?? []; const orderFor = (charge: typeof charges[number]) => charge.orderId ? orders.find((order) => order.id === charge.orderId) : undefined; const openTotal = openDue.total; const paidOrders = orders.filter((order) => order.paymentStatus === "PAID"); const openRows = groupRoomCharges(openCharges, orders); const paidGroups = groupPaidOrders(paidOrders, new Set(settledCharges.flatMap((charge) => charge.billNumber && charge.orderId ? [charge.orderId] : []))); return <>
                <section className="mt-4 rounded-xl border border-[#f2e6ec] px-4 py-3.5"><div className="mb-2 flex items-center justify-between"><div><h3 className="text-sm font-extrabold">Open tab</h3><p className="mt-0.5 text-xs text-muted">{openRows.length ? `${openRows.length} bill${openRows.length === 1 ? "" : "s"} · Tap a bill to review` : "Nothing on the tab"}</p></div><strong className="text-sm">{money(openTotal)}</strong></div>{openRows.length ? <div className="divide-y divide-[#f4e7ed]">{openRows.map((row) => {
                  if (row.kind === "table") {
                    const amount = row.charges.reduce((sum, charge) => sum + Number(charge.amount), 0);
                    return <div key={row.key} className="py-3"><div className="flex items-start justify-between gap-2"><div className="flex min-w-0 gap-2"><ReceiptText size={16} className="mt-0.5 shrink-0 text-muted" /><div className="min-w-0"><p className="truncate text-[13px] font-bold">Table {row.table}</p><p className="mt-0.5 text-xs text-muted">{dateTime(row.when)}</p></div></div><div className="flex shrink-0 items-center gap-2">{row.orders.length > 0 && <button type="button" onClick={() => openOrdersReceipt(row.orders)} className="h-8 rounded-lg border border-[#f0dfe8] px-2.5 text-[11px] font-bold">View</button>}{row.charges.some(needsSignature) && <span className="rounded-full bg-[#fff4e8] px-2 py-0.5 text-[11px] font-bold text-[#a64728]">Unsigned</span>}{isFocusedStayActive && canManageFolios && row.charges.some(needsSignature) && <button type="button" onClick={() => openSign(row.charges.filter(needsSignature).map((charge) => charge.id), `Table ${row.table}`)} className="h-8 rounded-lg border border-[#f2168d] px-2.5 text-[11px] font-bold text-[#f2168d]">Sign</button>}{isFocusedStayActive && canManageFolios && <button type="button" disabled={busy} onClick={() => { const method = timeline?.cashOnly ? "CASH" : roomPaymentMethod; setSettlingChargeIds(row.charges.map((charge) => charge.id)); setSelectedRoom(focusedRoom); setRoomPaymentMethod(method); if (method === "CASH") { setTendered(""); setCashOpen(true); } setModal("settle"); }} className="h-8 rounded-lg bg-[#f01898] px-2.5 text-[11px] font-bold text-white disabled:opacity-40">Settle</button>}<span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">On tab</span><strong className="text-[13px]">{money(amount)}</strong></div></div>{row.charges.map((charge) => { const order = row.orders.find((entry) => entry.id === charge.orderId); return <div key={charge.id}>{charge.lines?.length ? charge.lines.map((line, index) => <RoomDishRow key={`${charge.id}-line-${line.orderItemId ?? index}-${line.unit ?? index}`} line={chargeDish(line, index)} editable={Boolean(canManageFolios && isFocusedStayActive && !charge.settledAt && line.orderItemId && line.unit != null && !line.removedAt)} onRemove={(reason) => removeChargeLine(charge.id, line.orderItemId!, line.unit!, reason)} onQuantity={(quantity) => setChargeLineQuantity(charge.id, line.orderItemId!, line.unit!, quantity)} />) : order?.items?.map((line) => <RoomDishRow key={line.id ?? `${charge.id}-dish`} line={line} editable={Boolean(canManageFolios && isFocusedStayActive && !charge.settledAt && line.id && !line.removedAt)} onRemove={(reason) => removeRoomDish(order.id, line.id!, reason)} onQuantity={(quantity) => setChargedItemQuantity(charge.id, line.id!, quantity)} />)}</div>; })}</div>;
                  }
                  const { charge, order } = row;
                  return <div key={charge.id} className="py-3"><div className="flex items-start justify-between gap-2"><div className="flex min-w-0 gap-2"><ReceiptText size={16} className="mt-0.5 shrink-0 text-muted" /><div className="min-w-0"><p className="truncate text-[13px] font-bold">{charge.billNumber ? `Bill ${charge.billNumber} · ${charge.description}` : `Bill #${order ? orderCode(order) : charge.id.slice(0, 6).toUpperCase()} · ${order ? (order.type === "ROOM_SERVICE" || !order.table ? "Room service" : "Restaurant · Table " + order.table.tableNumber) : charge.kind === "ROOM_FEE" ? "Room fee" : charge.description}`}</p><p className="mt-0.5 text-xs text-muted">{dateTime(order?.createdAt ?? charge.occurredAt)}{needsSignature(charge) ? " · Unsigned" : order ? ` · Signed by ${charge.signedByName || focusedStay.primaryGuestName}` : ""}</p></div></div><div className="flex shrink-0 items-center gap-2">{order && <button type="button" onClick={() => openOrderReceipt(order)} className="h-8 rounded-lg border border-[#f0dfe8] px-2.5 text-[11px] font-bold">View</button>}{needsSignature(charge) && <span className="rounded-full bg-[#fff4e8] px-2 py-0.5 text-[11px] font-bold text-[#a64728]">Unsigned</span>}{isFocusedStayActive && canManageFolios && needsSignature(charge) && <button type="button" onClick={() => openSign([charge.id], charge.billNumber ? `Bill ${charge.billNumber}` : `Room ${focusedRoom.roomNumber}`)} className="h-8 rounded-lg border border-[#f2168d] px-2.5 text-[11px] font-bold text-[#f2168d]">Sign</button>}{isFocusedStayActive && canManageFolios && <button type="button" disabled={busy} onClick={() => { const method = timeline?.cashOnly ? "CASH" : roomPaymentMethod; setSettlingChargeIds([charge.id]); setSelectedRoom(focusedRoom); setRoomPaymentMethod(method); if (method === "CASH") { setTendered(""); setCashOpen(true); } setModal("settle"); }} className="h-8 rounded-lg bg-[#f01898] px-2.5 text-[11px] font-bold text-white disabled:opacity-40">Settle</button>}<span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">On tab</span><strong className="text-[13px]">{money(charge.amount)}</strong></div></div>{charge.lines?.length ? charge.lines.map((line, index) => <RoomDishRow key={`${charge.id}-line-${line.orderItemId ?? index}-${line.unit ?? index}`} line={chargeDish(line, index)} editable={Boolean(canManageFolios && isFocusedStayActive && !charge.settledAt && line.orderItemId && line.unit != null && !line.removedAt)} onRemove={(reason) => removeChargeLine(charge.id, line.orderItemId!, line.unit!, reason)} onQuantity={(quantity) => setChargeLineQuantity(charge.id, line.orderItemId!, line.unit!, quantity)} />) : order?.items.map((line) => <RoomDishRow key={line.id ?? `${charge.id}-dish`} line={line} editable={Boolean(canManageFolios && isFocusedStayActive && !charge.settledAt && line.id && !line.removedAt)} onRemove={(reason) => removeRoomDish(order.id, line.id!, reason)} onQuantity={(quantity) => setChargedItemQuantity(charge.id, line.id!, quantity)} />)}{!order && !charge.lines?.length && (canManageFolios && isFocusedStayActive && charge.kind !== "ROOM_FEE" ? <ChargeQuantityRow quantity={charge.quantity} unitPrice={charge.unitPrice} onSave={(quantity) => saveChargeQuantity(charge.id, quantity)} /> : <div className="ml-6 mt-1 flex justify-between text-xs text-muted"><span>{charge.quantity} × {money(charge.unitPrice)}</span></div>)}</div>;
                })}</div> : <p className="pb-1 text-xs text-muted">No room or restaurant charges are waiting for payment.</p>}</section>
                <section className="mt-4 rounded-xl border border-[#f2e6ec] px-4 py-3.5"><div className="mb-1 flex items-center justify-between"><h3 className="text-sm font-extrabold">History</h3><span className="text-[11px] text-muted">Paid bills stay here for receipts</span></div>{paidOrders.length || settledCharges.length ? <div className="divide-y divide-[#f4e7ed]">{paidGroups.map((group) => {
                  const amount = group.orders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
                  const methods = [...new Set(group.orders.map((order) => order.paymentMethod === "CARD" ? "Card" : order.paymentMethod === "PROMPTPAY" ? "PromptPay" : order.paymentMethod === "ROOM_CHECKOUT" ? "Room" : "Cash"))];
                  const method = methods.length === 1 ? methods[0] : "Paid";
                  const settled = group.orders.some((order) => settledCharges.some((charge) => charge.orderId === order.id));
                  const title = group.table ? `Table ${group.table}` : `Bill #${orderCode(group.orders[0])} · Room service`;
                  return <div key={group.key} className="py-2"><div className="flex items-center justify-between gap-2"><div className="flex min-w-0 gap-2"><ReceiptText size={16} className="mt-0.5 shrink-0 text-muted" /><div className="min-w-0"><p className="truncate text-[13px] font-bold">{title}</p><p className="mt-0.5 text-xs text-muted">{dateTime(group.orders.map((order) => order.paidAt ?? order.updatedAt).sort().slice(-1)[0] ?? group.when)} · {settled ? `Settled · ${method}` : `Paid · ${method}`}</p></div></div><div className="flex shrink-0 items-center gap-2"><button type="button" onClick={() => openOrdersReceipt(group.orders)} className="h-8 rounded-lg border border-[#f0dfe8] px-2.5 text-[11px] font-bold">View</button><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">{settled ? "Settled" : "Paid"} · {method}</span><strong className="text-[13px]">{money(amount)}</strong></div></div>{group.orders.flatMap((order) => order.items?.map((line) => <RoomDishRow key={line.id ?? `${order.id}-history`} line={line} editable={false} onRemove={async () => undefined} />))}</div>;
                })}{settledCharges.filter((charge) => !!charge.lines?.length || !charge.orderId).map((charge) => { const order = orderFor(charge); return <div key={charge.id} className="py-3 text-[13px]"><div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate font-bold">{charge.billNumber ? `Bill ${charge.billNumber} · ${charge.description}` : charge.description}</span><span className="flex shrink-0 items-center gap-2">{order && <button type="button" onClick={() => openOrderReceipt(order)} className="h-8 rounded-lg border border-[#f0dfe8] px-2.5 text-[11px] font-bold">View</button>}{needsSignature(charge) && <span className="rounded-full bg-[#fff4e8] px-2 py-0.5 text-[11px] font-bold text-[#a64728]">Unsigned</span>}{canManageFolios && needsSignature(charge) && <button type="button" onClick={() => openSign([charge.id], charge.billNumber ? `Bill ${charge.billNumber}` : `Room ${focusedRoom.roomNumber}`)} className="h-8 rounded-lg border border-[#f2168d] px-2.5 text-[11px] font-bold text-[#f2168d]">Sign</button>}<span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Settled</span><span>{money(charge.amount)}</span></span></div>{charge.lines?.map((line, index) => <RoomDishRow key={`${charge.id}-paid-${line.orderItemId ?? index}-${line.unit ?? index}`} line={chargeDish(line, index)} editable={false} onRemove={async () => undefined} />)}</div>; })}</div> : <p className="py-3 text-xs text-muted">No settled bills yet.</p>}</section>
                <section className="mt-4 rounded-xl border border-[#f2e6ec] px-4 py-3.5"><h3 className="text-sm font-extrabold">Deposits and payments</h3>{timeline.payments?.length ? timeline.payments.map((payment) => <div key={payment.id} className="mt-2 flex items-start gap-2 border-t border-[#f4e7ed] pt-2"><ReceiptText size={15} className="mt-0.5 shrink-0 text-[#e91488]" /><div className="min-w-0 flex-1"><p className="text-[13px] font-bold">{payment.method === "CARD" ? "Tab settled by card" : "Tab settled by cash"}</p><p className="mt-0.5 text-[11px] text-muted">{dateTime(payment.paidAt)}{payment.receivedBy?.name ? ` · Taken by ${payment.receivedBy.name}` : ""}</p></div><strong className="shrink-0 text-[13px]">{money(payment.amount)}</strong></div>) : <p className="mt-1 text-xs text-muted">No payments recorded</p>}<div className="mt-2 flex justify-between border-t border-[#f4e7ed] pt-2 text-base font-extrabold"><span>Balance</span><span>{money(openTotal)}</span></div></section>
              </>;
            })()}
          </> : <div className="py-12 text-center text-xs text-muted">{timelineLoading ? "Loading room folio…" : focusedStay ? "Select a stay to load its folio." : "No one is checked in. Use Check in to add a guest."}</div>}</div>
        <div className="flex flex-wrap items-center gap-2 border-t border-[#f3e7ed] bg-white px-5 py-2.5">{canManageStays && roomIsEmpty(focusedRoom) && <button type="button" onClick={() => openCheckIn(focusedRoom)} className="h-12 rounded-lg bg-[#f01898] px-5 text-sm font-bold text-white">Check in</button>}<button disabled={!canManageFolios || !isFocusedStayActive || timeline?.cashOnly || !focusedStay} onClick={() => focusedStay && navigate(`/rooms/service/${focusedStay.id}`)} className="h-12 rounded-lg border border-[#f0dfe8] px-5 text-sm font-bold disabled:opacity-40">Room service</button><button disabled={!timeline} onClick={() => timeline && setCheckoutReceipt(createFolioReceipt(timeline))} className="h-12 rounded-lg border border-[#f0dfe8] px-5 text-sm font-bold disabled:opacity-40">View receipt</button><button type="button" aria-expanded={roomHistoryOpen} onClick={() => setRoomHistoryOpen((open) => { const next = !open; if (next) window.setTimeout(() => roomHistoryRef.current?.scrollIntoView({ block: "nearest" }), 0); return next; })} className={`h-12 rounded-lg border px-5 text-sm font-bold ${roomHistoryOpen ? "border-[#f01898] bg-pink-50 text-[#d20b79]" : "border-[#f0dfe8]"}`}>Room history</button><span className="flex-1" />{isFocusedStayActive && canManageFolios && <><button disabled={busy} onClick={() => void checkOut()} className="h-12 rounded-lg border border-[#f0dfe8] px-5 text-sm font-bold disabled:opacity-40">Check out</button>{openDue.total > 0 && <button disabled={busy} onClick={() => { setSettlingChargeIds(null); setSelectedRoom(focusedRoom); setRoomPaymentMethod("CASH"); setTendered(""); setCashOpen(true); setModal("settle"); }} className="h-12 rounded-lg bg-[#f01898] px-5 text-sm font-bold text-white disabled:opacity-40">Settle tab · {money(openDue.total)}</button>}</>}</div></aside></div>, document.body)}

      {modal === "assign" && assignStay && <Modal title="Assign room" onClose={() => { setModal(null); setAssignStay(null); }} footer={<div className="flex items-center justify-between gap-3"><button type="button" onClick={() => { setModal(null); setAssignStay(null); }} className="h-11 rounded-xl border border-line px-5 text-sm font-bold">Cancel</button><button type="button" disabled={busy || choicesLoading || !assignRoomId} onClick={() => void assignRoom()} className="h-11 rounded-xl bg-[#ed168c] px-5 text-sm font-bold text-white disabled:opacity-50">Assign room</button></div>}><div className="space-y-4">
        <div><p className="font-display text-lg font-extrabold">{assignStay.guestName}</p><p className="mt-1 text-xs text-muted">{stayDay(assignStay.startDate)} – {stayDay(assignStay.leaveDate || assignStay.endDate)}{assignStay.roomType ? ` · ${assignStay.roomType}` : ""}{assignStay.confirmationNumber ? ` · ${assignStay.source || "Booking"} ${assignStay.confirmationNumber}` : ""}</p></div>
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {choicesLoading ? <p className="text-sm text-muted">Checking which rooms are free…</p> : <div className="space-y-2">{assignChoices.map((room) => { const unavailable = !room.available || busy; return <div key={room.id} role="button" tabIndex={unavailable ? -1 : 0} aria-disabled={unavailable} onClick={() => { if (!unavailable) setAssignRoomId(room.id); }} onKeyDown={(event) => { if (unavailable || (event.key !== "Enter" && event.key !== " ")) return; event.preventDefault(); setAssignRoomId(room.id); }} className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left ${unavailable ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${assignRoomId === room.id ? "border-[#f01898] bg-pink-50" : "border-line"}`}><span className="min-w-0"><span className="block truncate text-sm font-bold">{roomLabel(room.roomNumber)}</span><span className="mt-0.5 block truncate text-[11px] text-muted">{room.reason ?? (room.suggested ? "Matches this booking" : "Free for these dates")}</span></span></div>; })}</div>}
      </div></Modal>}

      {modal === "room" && <Modal title={editingRoom ? "Edit room" : "New room"} onClose={() => setModal(null)}><form onSubmit={(event) => void saveRoom(event)} className="space-y-5">
        <section>
          <h3 className="text-sm font-bold">Details</h3>
          <p className="mt-1 text-[11px] text-muted">How staff will find it on the Rooms screen</p>
          <div className="mt-4"><Field label="Room name or number" type="text" required maxLength={80} value={roomNumber} onChange={(event) => setRoomNumber(event.target.value)} placeholder="e.g. 16 or Garden Bungalow 4" autoComplete="off" /></div>
        </section>
        <div className="flex items-center justify-between gap-3 pt-1">
          <button type="button" onClick={() => setModal(null)} className="h-11 rounded-xl border border-line px-5 text-sm font-bold">Cancel</button>
          <button disabled={busy || !roomNumber.trim()} className="h-11 rounded-xl bg-[#ed168c] px-5 text-sm font-bold text-white disabled:opacity-50">{editingRoom ? "Save" : "Add room"}</button>
        </div>
      </form></Modal>}

      {modal === "arrival" && <ArrivalCard guestName={guestName} notes={guestNotes} busy={busy} error={error} onGuestName={setGuestName} onNotes={setGuestNotes} onClose={() => setModal(null)} onSubmit={(event) => void checkIn(event)} />}
      {modal === "checkin" && <Modal title="Check in" onClose={() => setModal(null)} footer={<button type="submit" form="stay-form" disabled={busy || !selectedRoom || !guestName.trim()} className="h-11 w-full rounded-xl bg-[#f01898] text-sm font-bold text-white disabled:opacity-50">Check in guest</button>}><form id="stay-form" onSubmit={(event) => void checkIn(event)} className="space-y-3.5">
        <Field label="Guest name" required value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="Guest name" />
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink">Note</span><textarea value={guestNotes} onChange={(event) => setGuestNotes(event.target.value)} rows={3} placeholder="Note" className="w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm outline-none focus:border-[#f01898]" /></label>
      </form></Modal>}
      {modal === "charge" && <Modal title={`Add charge · Room ${selectedRoom?.roomNumber ?? ""}`} onClose={() => setModal(null)}><form onSubmit={(event) => void addCharge(event)} className="space-y-4">{commissionItems.length > 0 && <div><p className="text-[10px] font-semibold text-muted">Commission</p><div className="mt-2 grid grid-cols-2 gap-2">{commissionItems.map((item) => <button type="button" key={item.id} onClick={() => { setCommissionItemId(item.id); setChargeKind("OTHER"); setChargeDescription(item.name); setChargeQuantity("1"); setChargePrice(String(item.price)); }} className={`rounded-xl border px-3 py-3 text-left ${commissionItemId === item.id ? "border-[#f01898] bg-pink-50" : "border-line hover:border-pink-200"}`}><span className="block text-xs font-bold">{item.name}</span><span className="mt-1 block text-[10px] text-muted">Guest pays {money(item.price)} · commission {money(item.commission)}</span></button>)}</div></div>}<p className="text-[10px] font-semibold text-muted">Quick add</p><div className="grid grid-cols-2 gap-2">{[{ name: "Laundry", kind: "OTHER" as const, description: "Laundry, 1 bag", price: "5" }, { name: "Scooter rental", kind: "OTHER" as const, description: "Scooter rental, 1 day", price: "15" }, { name: "Island tour", kind: "OTHER" as const, description: "Island tour", price: "45" }, { name: "Boat transfer", kind: "OTHER" as const, description: "Boat transfer", price: "30" }].map((preset) => <button type="button" key={preset.name} onClick={() => { setCommissionItemId(null); setChargeKind(preset.kind); setChargeDescription(preset.description); setChargeQuantity("1"); setChargePrice(preset.price); }} className={`rounded-xl border px-3 py-3 text-left ${chargeDescription === preset.description ? "border-[#f01898] bg-pink-50" : "border-line hover:border-pink-200"}`}><span className="block text-xs font-bold">{preset.name}</span><span className="mt-1 block text-[10px] text-muted">{money(preset.price)} per unit</span></button>)}</div><Field label="Description" required value={chargeDescription} onChange={(event) => setChargeDescription(event.target.value)} placeholder="Describe this charge" /><div className="grid grid-cols-2 gap-3"><Field label="Quantity" type="number" required min="1" value={chargeQuantity} onChange={(event) => setChargeQuantity(event.target.value)} /><Field label="Price each" type="number" required min="0" step="0.01" readOnly={!!commissionItemId} value={chargePrice} onChange={(event) => setChargePrice(event.target.value)} /></div><div className="flex justify-between border-t border-line pt-3 text-sm"><span className="text-muted">Guest pays</span><strong>{money(Number(chargePrice || 0) * Number(chargeQuantity || 0))}</strong></div>{commissionItemId && <p className="text-[11px] text-muted">The daily report shows only the commission, {money((commissionItems.find((item) => item.id === commissionItemId)?.commission ?? 0) * Number(chargeQuantity || 0))}, after this charge is paid.</p>}<button disabled={busy} className="h-11 w-full rounded-xl bg-[#f01898] text-sm font-bold text-white">Add charge to tab</button></form></Modal>}
      {modal === "settle" && <Modal title={`${settlingBill ? "Settle bill" : "Settle tab"} · Room ${selectedRoom?.roomNumber ?? focusedRoom?.roomNumber ?? ""}`} onClose={() => { setModal(null); setSettlingChargeIds(null); setCashOpen(false); }}><div className="space-y-4"><p className="text-xs text-muted">{settlingBill ? "Choose how the guest paid this bill. It is marked settled and stays on the receipt." : "Choose how the guest paid. The stay remains open and settled bills move to history."}</p><div className="grid grid-cols-2 gap-2">{(["CASH", "CARD"] as const).map((method) => <button key={method} disabled={method === "CARD" && !!timeline?.cashOnly} onClick={() => { setRoomPaymentMethod(method); if (method !== "CASH") setCashOpen(false); }} className={`rounded-xl border p-3 text-sm font-bold disabled:opacity-40 ${roomPaymentMethod === method ? "border-[#f01898] bg-pink-50 text-[#c20d77]" : "border-line"}`}>{method === "CASH" ? "Cash" : "Paid by card"}</button>)}</div><div className="rounded-xl bg-canvas p-4 text-sm font-bold"><div className="flex justify-between"><span>{settlingBill ? "This bill" : "Total with VAT"}</span><span>{money(settleAmount)}</span></div>{settleVat > 0 && <p className="mt-1 text-[11px] font-semibold text-muted">VAT included</p>}</div><button disabled={busy || settleAmount <= 0} onClick={() => { if (roomPaymentMethod === "CASH") { setTendered(""); setCashOpen(true); return; } void settleTab(); }} className="h-11 w-full rounded-xl bg-[#f01898] text-sm font-bold text-white disabled:opacity-50">{roomPaymentMethod === "CASH" ? "Enter cash" : settlingBill ? "Mark settled" : "Settle tab"} · {money(settleAmount)}</button></div></Modal>}
      {cashOpen && modal === "settle" && <CashRegister amount={settleAmount} note={settleVat > 0 ? "VAT included" : undefined} tendered={tendered} setTendered={setTendered} busy={busy} onClose={() => setCashOpen(false)} onConfirm={() => void settleTab()} />}


    </div>
    {checkoutReceipt && <ReceiptPreview receipt={checkoutReceipt} restaurantName={restaurantName} restaurantLogoUrl={restaurantLogoUrl} onClose={() => setCheckoutReceipt(null)} />}
    {signFor && createPortal(<div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSignFor(null); }}>
      <section role="dialog" aria-modal="true" aria-label="Sign the room tab" className="w-full max-w-lg rounded-2xl border border-line bg-white p-5 shadow-float">
        <header className="flex items-start justify-between gap-3"><div><h2 className="font-display text-lg font-bold">Sign {signFor.label}</h2><p className="mt-1 text-[11px] text-muted">{signName || "The guest"}, please sign this room tab.</p></div><button type="button" onClick={() => setSignFor(null)} aria-label="Close signature" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas"><X size={16} /></button></header>
        <label className="mt-4 block text-[10px] font-semibold text-muted">Guest signing<input value={signName} onChange={(event) => setSignName(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-line px-3 text-xs text-ink outline-none focus:border-[#ed168c]" /></label>
        <canvas ref={signCanvasRef} width={900} height={220} onPointerDown={(event) => { const canvas = signCanvasRef.current; const at = signPoint(event); if (!canvas || !at) return; canvas.setPointerCapture(event.pointerId); const ctx = canvas.getContext("2d"); if (!ctx) return; ctx.beginPath(); ctx.moveTo(at.x, at.y); ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.strokeStyle = "#30242b"; setDrawing(true); }} onPointerMove={(event) => { if (!drawing) return; const canvas = signCanvasRef.current; const at = signPoint(event); const ctx = canvas?.getContext("2d"); if (!canvas || !at || !ctx) return; ctx.lineTo(at.x, at.y); ctx.stroke(); setSignData(canvas.toDataURL("image/png")); }} onPointerUp={() => setDrawing(false)} onPointerCancel={() => setDrawing(false)} className="mt-3 h-40 w-full touch-none rounded-lg border border-line bg-[#fffafb]" aria-label="Sign here" />
        <div className="mt-4 flex gap-2"><button type="button" onClick={() => { const canvas = signCanvasRef.current; canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height); setSignData(""); }} className="h-10 flex-1 rounded-lg border border-line text-xs font-bold">Clear</button><button type="button" disabled={busy || !signName.trim() || !signData} onClick={() => void saveSign()} className="h-10 flex-1 rounded-lg bg-[#ed168c] text-xs font-bold text-white disabled:opacity-40">{busy ? "Saving…" : "Sign"}</button></div>
      </section>
    </div>, document.body)}
  </>;
}

function localDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function localTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function atLocal(day: string, time: string) {
  const [year, month, date] = day.split("-").map(Number);
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return new Date(year, month - 1, date, hours, minutes, 0, 0);
}
function nextDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + 1);
  return localDay(date);
}
function stayTime(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}
function isInHouse(stay: Pick<RoomStay, "checkedInAt" | "expectedCheckoutAt" | "checkedOutAt" | "cancelledAt">, now = Date.now()) {
  if (stay.checkedOutAt || stay.cancelledAt) return false;
  const start = stayTime(stay.checkedInAt);
  if (start == null || start > now) return false;
  const end = stayTime(stay.expectedCheckoutAt);
  return end == null || end > now;
}
function guestInRoom(room: Room) {
  return room.stays?.find((stay) => isInHouse(stay)) ?? null;
}
function roomIsEmpty(room: Room) {
  return !guestInRoom(room) && room.status !== "MAINTENANCE" && room.status !== "ARCHIVED";
}
function staysOnThisRoom(stays: RoomStay[], now = Date.now()) {
  return stays.filter((stay) => isInHouse(stay, now));
}
function roomBadge(room: Room) {
  if (room.status === "MAINTENANCE") return { label: "Under maintenance", className: "bg-[#fff1e6] text-[#a85b1c]" };
  if (room.status === "ARCHIVED") return { label: "Archived", className: "bg-[#f6f4f5] text-[#8a8388]" };
  const stay = guestInRoom(room);
  if (!stay) return { label: "Vacant", className: "bg-emerald-50 text-emerald-700" };
  const today = localDay(new Date());
  const onDay = (value?: string | null) => value ? localDay(new Date(value)) === today : false;
  if (onDay(stay.expectedCheckoutAt)) return { label: "Departing", className: "bg-[#fff8e6] text-[#8a5a00]" };
  if (onDay(stay.checkedInAt)) return { label: "Arriving", className: "bg-[#ffe8f4] text-[#b30d6e]" };
  return { label: "Occupied", className: "bg-rose-50 text-rose-700" };
}
function ArrivalCard({ guestName, notes, busy, error, onGuestName, onNotes, onClose, onSubmit }: {
  guestName: string;
  notes: string;
  busy: boolean;
  error: string;
  onGuestName: (value: string) => void;
  onNotes: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return createPortal(<div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/25 p-4" onMouseDown={onClose}>
    <form role="dialog" aria-modal="true" aria-label="Check in" onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-[420px] rounded-2xl border border-[#f3d5e4] bg-white p-4 shadow-[0_16px_40px_rgba(80,30,55,.16)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold text-ink">Check in</p>
        <button type="button" aria-label="Close" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-[#fff4f9]"><X size={16} /></button>
      </div>
      <label className="mt-4 block"><span className="mb-1.5 block text-xs font-semibold text-ink">Guest name</span><input required value={guestName} onChange={(event) => onGuestName(event.target.value)} placeholder="Guest name" className="h-11 w-full rounded-xl border border-line px-3.5 text-sm outline-none focus:border-[#f01898]" /></label>
      <label className="mt-3 block"><span className="mb-1.5 block text-xs font-semibold text-ink">Note</span><textarea value={notes} onChange={(event) => onNotes(event.target.value)} rows={3} placeholder="Note" className="w-full resize-none rounded-xl border border-line px-3.5 py-3 text-sm outline-none focus:border-[#f01898]" /></label>
      {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
      <button disabled={busy || !guestName.trim()} className="mt-3 h-12 w-full rounded-xl bg-[#ed168c] text-sm font-bold text-white disabled:opacity-50">{busy ? "Saving…" : "Check in guest"}</button>
    </form>
  </div>, document.body);
}
