import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { BedDouble, Plus, ReceiptText, Trash2, Users, X, Pencil, Search, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Field, Modal, Panel, SelectField } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { money, type Room, type RoomChargeKind, type RoomPaymentMethod, type RoomStay } from "../lib/types";
import { useAuthStore } from "../stores/authStore";
import { useUiStore } from "../stores/uiStore";
import { translate } from "../lib/translations";
import { hasJobPermission } from "../lib/access";
import { ReceiptPreview, type CheckoutReceipt } from "../components/ReceiptPreview";

type ModalKind = "room" | "checkin" | "editStay" | "charge" | "settle" | null;
const dateTime = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const stayDateRange = (from: string, to?: string | null) => {
  const start = new Date(from);
  const end = to ? new Date(to) : null;
  const day = (value: Date) => new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(value);
  const month = (value: Date) => new Intl.DateTimeFormat(undefined, { month: "short" }).format(value);
  if (!end) return `${day(start)} ${month(start)}`;
  return start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
    ? `${day(start)} to ${day(end)} ${month(end)}`
    : `${day(start)} ${month(start)} to ${day(end)} ${month(end)}`;
};
const roomLabel = (roomNumber: string) => /^\d+$/.test(roomNumber) ? `Room ${roomNumber}` : roomNumber;
const HISTORY_PAGE_SIZE = 10;

type PageResponse<T> = {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalKind>(null);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [focusedRoomId, setFocusedRoomId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<RoomStay | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [stayHistoryValue, setStayHistory] = useState<RoomStay[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [selectedStayId, setSelectedStayId] = useState<string | null>(null);
  const historyScrollRef = useRef<HTMLDivElement | null>(null);
  const historyRequestRef = useRef(0);
  const [checkoutReceipt, setCheckoutReceipt] = useState<CheckoutReceipt | null>(null);
  const [roomNumber, setRoomNumber] = useState("");
  const [guestNames, setGuestNames] = useState<string[]>([""]);
  const [guestName, setGuestName] = useState("");
  const [occupants, setOccupants] = useState("");
  const [expectedCheckoutAt, setExpectedCheckoutAt] = useState("");
  const [guestNotes, setGuestNotes] = useState("");
  const [cashOnly, setCashOnly] = useState(false);
  const [chargeLimit, setChargeLimit] = useState("");
  const [chargeKind, setChargeKind] = useState<RoomChargeKind>("WATER");
  const [chargeDescription, setChargeDescription] = useState("");
  const [chargeQuantity, setChargeQuantity] = useState("1");
  const [chargePrice, setChargePrice] = useState("");
  const [roomPaymentMethod, setRoomPaymentMethod] = useState<RoomPaymentMethod>("CASH");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [roomFilter, setRoomFilter] = useState<"ALL" | "OCCUPIED" | "ARRIVING" | "DEPARTING" | "VACANT">("ALL");
  const [roomSearch, setRoomSearch] = useState("");
  const [editMode, setEditMode] = useState(false);
  const currentUser = useAuthStore((state) => state.user);
  const isAdmin = currentUser?.role === "ADMIN";
  const canManageStays = hasJobPermission(currentUser, "ROOM_MANAGE");
  const canManageFolios = hasJobPermission(currentUser, "ROOM_FOLIO");
  const notify = useUiStore((state) => state.notify);
  const language = useUiStore((state) => state.language);
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Room[]>("/rooms");
      setRooms(data);
      setFocusedRoomId((current) => current && data.some((room) => room.id === current) ? current : null);
    }
    catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const openRoom = (room?: Room) => {
    setEditingRoom(room ?? null);
    setRoomNumber(room ? String(room.roomNumber) : "");
    setGuestNames([""]);
    setError("");
    setModal("room");
  };
  const saveRoom = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const payload = editingRoom ? { roomNumber: roomNumber.trim() } : { roomNumber: roomNumber.trim(), guests: guestNames.map((name) => name.trim()).filter(Boolean) };
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
      await api.post(`/rooms/${selectedRoom.id}/check-in`, { primaryGuestName: guestName, occupants: [guestName, ...names], expectedCheckoutAt: expectedCheckoutAt ? new Date(`${expectedCheckoutAt}T12:00:00`).toISOString() : undefined, guestNotes, cashOnly, chargeLimit: chargeLimit === "" ? null : Number(chargeLimit) });
      setModal(null); setGuestName(""); setOccupants(""); setGuestNotes(""); setFocusedRoomId(selectedRoom.id); notify(`Guest checked into room ${selectedRoom.roomNumber}.`); await load();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const editStay = async (event: FormEvent) => {
    event.preventDefault();
    const stay = selectedRoom?.stays?.[0];
    if (!stay) return;
    setBusy(true); setError("");
    try {
      const names = occupants.split(/[\n,]/).map((value) => value.trim()).filter(Boolean);
      await api.patch<RoomStay>(`/rooms/stays/${stay.id}`, {
        primaryGuestName: guestName,
        occupants: [guestName, ...names],
        expectedCheckoutAt: expectedCheckoutAt ? new Date(`${expectedCheckoutAt}T12:00:00`).toISOString() : null,
        guestNotes,
        cashOnly,
        chargeLimit: chargeLimit === "" ? null : Number(chargeLimit),
      });
      setModal(null); notify("Guest stay updated."); await openTimeline(stay.id); await load();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const openCheckIn = (room: Room) => {
    setSelectedRoom(room); setGuestName(""); setOccupants(""); setGuestNotes(""); setCashOnly(false); setChargeLimit("");
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); setExpectedCheckoutAt(tomorrow.toISOString().slice(0, 10));
    setError(""); setModal("checkin");
  };
  const openEditStay = (room: Room) => {
    const stay = room.stays?.[0]; if (!stay) return;
    setSelectedRoom(room); setGuestName(stay.primaryGuestName);
    setOccupants(stay.occupants.filter((person) => person.name !== stay.primaryGuestName).map((person) => person.name).join("\n"));
    setExpectedCheckoutAt(stay.expectedCheckoutAt?.slice(0, 10) ?? ""); setGuestNotes(stay.guestNotes ?? ""); setCashOnly(stay.cashOnly ?? false); setChargeLimit(stay.chargeLimit == null ? "" : String(stay.chargeLimit));
    setError(""); setModal("editStay");
  };
  const addCharge = async (event: FormEvent) => {
    event.preventDefault(); if (!selectedRoom?.stays[0]) return; setBusy(true); setError("");
    try {
      await api.post(`/rooms/stays/${selectedRoom.stays[0].id}/charges`, { kind: chargeKind, description: chargeDescription, quantity: Number(chargeQuantity), unitPrice: Number(chargePrice) });
      setModal(null); setChargeDescription(""); setChargeQuantity("1"); setChargePrice(""); notify("Room usage added to the folio."); await openTimeline(selectedRoom.stays[0].id); await load();
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

  const loadMoreStayHistory = async () => {
    if (!focusedRoomId || historyLoading || historyLoadingMore || historyPage >= historyTotalPages) return;
    await loadStayHistory(focusedRoomId, historyPage + 1, true);
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
      setSelectedRoom(focusedRoom);
      setRoomPaymentMethod("CASH");
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
      const { data } = await api.post<RoomStay>(`/rooms/stays/${timeline.id}/settle`, { method: roomPaymentMethod });
      setTimeline(data); notify(`Room tab settled by ${roomPaymentMethod.toLowerCase()}.`); setModal(null); await load();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const toggleCashOnly = async () => {
    if (!timeline) return;
    setBusy(true); setError("");
    try {
      await api.patch(`/rooms/stays/${timeline.id}`, { cashOnly: !timeline.cashOnly });
      await openTimeline(timeline.id);
      notify(timeline.cashOnly ? "Room folio charges enabled." : "Guest stay set to cash only.");
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const activeRooms = rooms.filter((room) => room.status === "OCCUPIED").length;
  const todayKey = new Date().toLocaleDateString();
  const isToday = (value?: string | null) => value ? new Date(value).toLocaleDateString() === todayKey : false;
  const arrivingRooms = rooms.filter((room) => room.stays?.[0] && isToday(room.stays[0].checkedInAt)).length;
  const departingRooms = rooms.filter((room) => room.stays?.[0] && isToday(room.stays[0].expectedCheckoutAt)).length;
  const vacantRooms = rooms.filter((room) => room.status === "AVAILABLE").length;
  const visibleRooms = rooms.filter((room) => {
    const stay = room.stays?.[0];
    const matchesFilter = roomFilter === "ALL" ||
      (roomFilter === "OCCUPIED" && room.status === "OCCUPIED") ||
      (roomFilter === "VACANT" && room.status === "AVAILABLE") ||
      (roomFilter === "ARRIVING" && !!stay && isToday(stay.checkedInAt)) ||
      (roomFilter === "DEPARTING" && !!stay && isToday(stay.expectedCheckoutAt));
    const query = roomSearch.trim().toLowerCase();
    return matchesFilter && (!query || String(room.roomNumber).toLowerCase().includes(query) || stay?.primaryGuestName.toLowerCase().includes(query) || stay?.occupants.some((guest) => guest.name.toLowerCase().includes(query)));
  });
  const focusedRoom = rooms.find((room) => room.id === focusedRoomId) ?? null;
  // Defensive guard for stale React Fast Refresh state or unexpected runtime values.
  const safeStayHistory = Array.isArray(stayHistoryValue) ? stayHistoryValue : [];
  const focusedStay = safeStayHistory.find((stay) => stay.id === selectedStayId)
    ?? focusedRoom?.stays?.[0]
    ?? null;
  const isFocusedStayActive = !!focusedStay && !focusedStay.checkedOutAt;

  useEffect(() => {
    if (!focusedRoomId) {
      historyRequestRef.current += 1;
      setStayHistory([]);
      setSelectedStayId(null);
      setTimeline(null);
      setHistoryPage(1);
      setHistoryTotalPages(1);
      return;
    }

    let cancelled = false;
    const roomId = focusedRoomId;
    setStayHistory([]);
    setSelectedStayId(null);
    setTimeline(null);
    setHistoryPage(1);
    setHistoryTotalPages(1);
    void (async () => {
      const rows = await loadStayHistory(roomId, 1, false);
      if (cancelled || !rows) return;
      const defaultStay = rows.find((stay) => !stay.checkedOutAt) ?? rows[0] ?? null;
      if (defaultStay) void openTimeline(defaultStay.id);
      else {
        setSelectedStayId(null);
        setTimeline(null);
      }
    })();
    return () => { cancelled = true; };
  }, [focusedRoomId, loadStayHistory]);
  return <>
    <div className="page-enter min-h-full w-full">
      <div className="mb-5 flex items-center justify-between gap-4"><div><p className="mb-1 text-[9px] font-bold uppercase tracking-[.2em] text-[#ec1593]">Front desk · Guest stays</p><h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">Rooms</h1><p className="mt-1 text-[11px] text-muted">Who’s staying, what’s on their tab, and who arrives or leaves today.</p></div><div className="flex shrink-0 items-center gap-2">{isAdmin && <button type="button" onClick={() => setEditMode((value) => !value)} title={editMode ? "Done editing rooms" : "Edit rooms"} className={`grid h-9 w-9 place-items-center rounded-xl border ${editMode ? "border-[#f01898] bg-pink-50 text-[#d20b79]" : "border-line bg-white text-muted hover:text-ink"}`}><Pencil size={14} /></button>}{canManageStays && <button type="button" disabled={!rooms.some((room) => room.status === "AVAILABLE")} onClick={() => { const available = rooms.find((room) => room.status === "AVAILABLE"); if (available) openCheckIn(available); }} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#f01898] px-3.5 text-[11px] font-bold text-white shadow-sm disabled:opacity-50"><Plus size={13} /> Check in</button>}</div></div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      <div className="mb-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
        <Panel className="flex items-center gap-2.5 rounded-2xl p-3"><BedDouble size={16} className="text-[#ec1593]" /><div><p className="text-sm font-extrabold leading-none">{rooms.length}</p><p className="mt-1 text-[9px] text-muted">Total rooms</p></div></Panel>
        <Panel className="flex items-center gap-2.5 rounded-2xl p-3"><Users size={16} className="text-rose-500" /><div><p className="text-sm font-extrabold leading-none">{activeRooms}</p><p className="mt-1 text-[9px] text-muted">Occupied</p></div></Panel>
        <Panel className="flex items-center gap-2.5 rounded-2xl p-3"><ArrowDownToLine size={16} className="text-emerald-600" /><div><p className="text-sm font-extrabold leading-none">{arrivingRooms}</p><p className="mt-1 text-[9px] text-muted">Arriving today</p></div></Panel>
        <Panel className="flex items-center gap-2.5 rounded-2xl p-3"><ArrowUpFromLine size={16} className="text-emerald-600" /><div><p className="text-sm font-extrabold leading-none">{departingRooms}</p><p className="mt-1 text-[9px] text-muted">Departing today</p></div></Panel>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2"><div className="flex flex-1 flex-wrap gap-1.5">{(["ALL", "OCCUPIED", "ARRIVING", "DEPARTING", "VACANT"] as const).map((filter) => { const count = filter === "ALL" ? rooms.length : filter === "OCCUPIED" ? activeRooms : filter === "ARRIVING" ? arrivingRooms : filter === "DEPARTING" ? departingRooms : vacantRooms; const label = filter === "ALL" ? "All" : filter === "OCCUPIED" ? "Occupied" : filter === "ARRIVING" ? "Arriving" : filter === "DEPARTING" ? "Departing" : "Vacant"; return <button key={filter} type="button" onClick={() => setRoomFilter(filter)} className={`rounded-lg px-2.5 py-1.5 text-[9px] font-bold transition ${roomFilter === filter ? "bg-[#f01898] text-white" : "bg-white text-muted hover:bg-pink-50 hover:text-[#bf0c73]"}`}>{label}{filter !== "ALL" && <span className="ml-1 opacity-70">{count}</span>}</button>; })}</div><label className="flex h-8 w-full items-center gap-2 rounded-lg border border-line bg-white px-2.5 text-muted sm:w-48"><Search size={12} /><input value={roomSearch} onChange={(event) => setRoomSearch(event.target.value)} placeholder="Search room or surname" className="w-full bg-transparent text-[10px] text-ink outline-none placeholder:text-muted" /></label></div>
      {loading ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="aspect-[262/178] min-h-[178px] animate-pulse rounded-2xl bg-white" />)}</div> : rooms.length ? visibleRooms.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{visibleRooms.map((room) => {
        const stay = room.stays?.[0];
        const badge = room.status === "OCCUPIED" ? t("occupied") : room.status === "AVAILABLE" ? "Vacant" : room.status === "MAINTENANCE" ? t("maintenance") : t("archived");
        const badgeStyle = room.status === "OCCUPIED" ? "bg-rose-50 text-rose-700" : room.status === "AVAILABLE" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800";
        const tabTotal = Number(stay?.folioTotal ?? (stay?.charges ?? []).reduce((sum, charge) => sum + Number(charge.amount), 0));
        const stripeColor = room.status === "AVAILABLE" ? "#19bf8f" : room.status === "MAINTENANCE" ? "#ffb11b" : room.status === "ARCHIVED" ? "#b8b2b6" : "#ff6685";
        return <Panel key={room.id} className="flex aspect-[262/178] min-h-[178px] flex-col overflow-hidden rounded-[15px] border border-[#f1dfe7] bg-white shadow-[0_3px_12px_rgba(63,29,46,0.035)] transition-shadow hover:shadow-card">
          <div className="h-1.5 w-full" style={{ backgroundColor: stripeColor }} />
          <button type="button" onClick={() => focusRoom(room)} className="flex min-h-0 w-full flex-1 flex-col px-5 pb-4 pt-4 text-left">
            <div className="flex items-center justify-between gap-2"><h3 className="font-display text-lg font-extrabold leading-6">{roomLabel(room.roomNumber)}</h3><span className={`rounded-full px-2.5 py-1.5 text-[9px] font-bold leading-none ${badgeStyle}`}>{badge}</span></div>
            <div className="mt-3 rounded-lg bg-[#fff7fa] px-4 py-3">{stay ? <><p className="truncate text-sm font-semibold leading-5 text-ink">{[...new Set([stay.primaryGuestName, ...stay.occupants.map((person) => person.name)])].join(" and ")}</p><p className="mt-0.5 text-[10px] leading-4 text-muted">{stay.occupants.length} guest{stay.occupants.length === 1 ? "" : "s"} · {stayDateRange(stay.checkedInAt, stay.expectedCheckoutAt)}</p></> : <><p className="text-[11px] leading-4 text-muted">No one checked in</p><p className="mt-0.5 text-[10px] leading-4 text-muted">Ready for the next guest</p></>}</div>
            <div className="mt-auto flex items-center gap-2 pt-2 text-xs"><span className="text-muted">Tab</span><strong className="text-sm text-ink">{stay ? money(tabTotal) : "—"}</strong></div>
          </button>
          {((!stay && canManageStays && room.status === "AVAILABLE") || (isAdmin && editMode)) && <div className="flex gap-2 px-3.5 pb-3.5">{!stay && canManageStays && room.status === "AVAILABLE" && <button onClick={() => openCheckIn(room)} className="h-8 flex-1 rounded-lg border border-[#f7bfdc] text-[9px] font-bold hover:bg-pink-50">Check in</button>}{isAdmin && editMode && <><button onClick={() => openRoom(room)} className="h-8 flex-1 rounded-lg border border-line text-[9px] font-bold hover:bg-canvas">Edit room</button><button onClick={() => void deleteRoom(room)} aria-label={`Delete room ${room.roomNumber}`} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-600"><Trash2 size={13} /></button></>}</div>}
          {isAdmin && editMode && !stay && <div className="px-3.5 pb-3.5"><SelectField label="Room status" value={room.status} onChange={(event) => void changeRoomStatus(room, event.target.value as Room["status"])}><option value="AVAILABLE">Available to rent</option><option value="MAINTENANCE">Under maintenance</option><option value="ARCHIVED">Archived (keep history)</option></SelectField></div>}
        </Panel>;
      })}{isAdmin && <button type="button" onClick={() => openRoom()} className="flex aspect-[262/178] min-h-[178px] flex-col items-center justify-center rounded-[15px] border border-dashed border-[#f3c6db] bg-white/70 text-center transition hover:border-[#f01898] hover:bg-white"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#ffe4f2] text-[#f01898]"><Plus size={18} /></span><span className="mt-3 text-sm font-bold text-ink">Add room</span><span className="mt-1 text-[11px] text-muted">Set up a new room</span></button>}</div> : <Panel className="p-10 text-center"><p className="text-sm font-semibold">No rooms match this view.</p><p className="mt-1 text-xs text-muted">Change the filter or search term to see other rooms.</p></Panel> : isAdmin ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"><button type="button" onClick={() => openRoom()} className="flex aspect-[262/178] min-h-[178px] flex-col items-center justify-center rounded-[15px] border border-dashed border-[#f3c6db] bg-white/70 text-center transition hover:border-[#f01898] hover:bg-white"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#ffe4f2] text-[#f01898]"><Plus size={18} /></span><span className="mt-3 text-sm font-bold text-ink">Add room</span><span className="mt-1 text-[11px] text-muted">Set up a new room</span></button></div> : <Panel className="p-12 text-center"><BedDouble className="mx-auto text-muted" /><p className="mt-3 font-semibold">No rooms configured</p><p className="mt-1 text-sm text-muted">Add a room to begin managing guest stays and folios.</p></Panel>}

      {focusedRoom && createPortal(<div className="fixed inset-0 z-40 flex h-[100dvh] w-screen justify-end bg-[#291923]/35 backdrop-blur-[1px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setFocusedRoomId(null); }}><aside className="flex h-full w-full flex-col overflow-hidden border-l border-line bg-white shadow-float md:w-[min(70vw,960px)] lg:w-[min(60vw,1040px)]"><div className="flex items-center justify-between border-b border-[#f4e6ed] px-6 py-4"><div><div className="flex items-center gap-2"><h2 className="font-display text-2xl font-extrabold">{roomLabel(focusedRoom.roomNumber)}</h2><span className={`rounded-full px-2 py-1 text-xs font-bold ${focusedRoom.status === "OCCUPIED" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{focusedRoom.status === "OCCUPIED" ? "Occupied" : "Vacant"}</span></div></div><button type="button" onClick={() => setFocusedRoomId(null)} aria-label="Close room details" className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-canvas"><X size={20} /></button></div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <section className="mb-4 rounded-xl border border-[#f2e6ec] p-3.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div><h3 className="text-sm font-extrabold">Stay history</h3><p className="mt-0.5 text-xs text-muted">Select a current or past stay to view its folio.</p></div>
              <span className="text-[11px] text-muted">{safeStayHistory.length}{historyLoading ? " · Loading…" : ""}</span>
            </div>
            {historyLoading && safeStayHistory.length === 0 ? <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-[#fbf1f6]" />)}</div>
              : safeStayHistory.length ? <div ref={historyScrollRef} onScroll={(event) => {
                const el = event.currentTarget;
                if (el.scrollHeight - el.scrollTop - el.clientHeight < 64) void loadMoreStayHistory();
              }} className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {safeStayHistory.map((stay) => {
                  const active = !stay.checkedOutAt;
                  const selected = stay.id === selectedStayId;
                  const guestNames = [...new Set([stay.primaryGuestName, ...(stay.occupants ?? []).map((person) => person.name)])].join(" and ");
                  return <button key={stay.id} type="button" onClick={() => void openTimeline(stay.id)} className={`w-full rounded-lg border p-3 text-left transition ${selected ? "border-[#f01898] bg-pink-50" : "border-[#f1e3ea] hover:bg-[#fff9fc]"}`}>
                    <div className="flex items-start justify-between gap-2"><span className="min-w-0 truncate text-[13px] font-bold">{guestNames || "Guest stay"}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{active ? "Current" : "Checked out"}</span></div>
                    <p className="mt-1 text-[11px] text-muted">{dateTime(stay.checkedInAt)}{stay.checkedOutAt ? ` · Checked out ${dateTime(stay.checkedOutAt)}` : stay.expectedCheckoutAt ? ` · Expected ${dateTime(stay.expectedCheckoutAt)}` : ""}</p>
                  </button>;
                })}
                {historyLoadingMore && <div className="space-y-2 py-1" aria-label="Loading more stays">{Array.from({ length: 2 }, (_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-[#fbf1f6]" />)}</div>}
                {!historyLoadingMore && historyPage < historyTotalPages && <button type="button" onClick={() => void loadMoreStayHistory()} className="w-full rounded-lg py-2 text-xs font-bold text-[#d20b79] hover:bg-pink-50">Load more stays</button>}
                {historyPage >= historyTotalPages && <p className="py-1 text-center text-[10px] text-muted">All stays loaded</p>}
              </div> : <p className="py-3 text-xs text-muted">No stays recorded for this room yet.</p>}
          </section>
          {focusedStay && timeline ? <>
            <section className="border-b border-[#f3e7ed] pb-3"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-pink-100 text-[13px] font-bold text-[#bd0d72]">{focusedStay.primaryGuestName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{[...new Set([focusedStay.primaryGuestName, ...focusedStay.occupants.map((person) => person.name)])].join(" and ")}</p><p className="mt-0.5 text-[13px] text-muted">{focusedStay.occupants.length} guests · {new Date(focusedStay.checkedInAt).toLocaleDateString()}{focusedStay.expectedCheckoutAt ? ` to ${new Date(focusedStay.expectedCheckoutAt).toLocaleDateString()}` : ""}{focusedStay.expectedCheckoutAt ? ` · ${Math.max(1, Math.ceil((new Date(focusedStay.expectedCheckoutAt).getTime() - new Date(focusedStay.checkedInAt).getTime()) / 86400000))} nights` : ""}</p></div>{isFocusedStayActive && <button onClick={() => openEditStay(focusedRoom)} className="shrink-0 text-[13px] font-bold text-[#d20b79]">Edit stay →</button>}</div>{focusedStay.guestNotes && <div className="mt-3 rounded-lg bg-amber-50 px-2.5 py-3 text-[13px] font-medium text-amber-900"><span className="font-bold">Guest note:</span> {focusedStay.guestNotes}</div>}
              <div className="mt-3 flex items-center gap-5"><button type="button" disabled={busy} onClick={() => void toggleCashOnly()} className="flex items-center gap-2 text-left"><span className={`relative h-6 w-11 rounded-full transition ${timeline.cashOnly ? "bg-[#f01898]" : "bg-[#e4d8df]"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${timeline.cashOnly ? "left-6" : "left-1"}`} /></span><span><strong className="block text-[13px]">Cash only</strong><small className="block text-xs text-muted">{timeline.cashOnly ? "Can’t add to the tab" : "Room charges allowed"}</small></span></button><div><strong className="block text-[13px]">Charge limit</strong><small className="block text-xs text-muted">{timeline.chargeLimit == null ? "No limit" : money(timeline.chargeLimit)}</small></div></div></section>
            {(() => {
              const charges = timeline.charges ?? []; const openCharges = charges.filter((charge) => !charge.settledAt); const settledCharges = charges.filter((charge) => !!charge.settledAt); const orders = timeline.orders ?? []; const orderFor = (charge: typeof charges[number]) => charge.orderId ? orders.find((order) => order.id === charge.orderId) : undefined; const openTotal = Number(timeline.balanceDue ?? timeline.folioTotal ?? 0); const paidOrders = orders.filter((order) => order.paymentStatus === "PAID"); return <>
                <section className="mt-4 rounded-xl border border-[#f2e6ec] px-4 py-3.5"><div className="mb-2 flex items-center justify-between"><div><h3 className="text-sm font-extrabold">Open tab</h3><p className="mt-0.5 text-xs text-muted">{openCharges.length ? `${openCharges.length} bill${openCharges.length === 1 ? "" : "s"} · Tap a bill to review` : "Nothing on the tab"}</p></div><strong className="text-sm">{money(openTotal)}</strong></div>{openCharges.length ? <div className="divide-y divide-[#f4e7ed]">{openCharges.map((charge) => { const order = orderFor(charge); return <div key={charge.id} className="py-3"><div className="flex items-start justify-between gap-2"><div className="flex min-w-0 gap-2"><ReceiptText size={16} className="mt-0.5 shrink-0 text-muted" /><div className="min-w-0"><p className="truncate text-[13px] font-bold">Bill #{(order?.id ?? charge.id).slice(0, 6).toUpperCase()} · {order ? `Restaurant · Table ${order.table?.tableNumber ?? "—"}` : charge.kind === "ROOM_FEE" ? "Room fee" : charge.description}</p><p className="mt-0.5 text-xs text-muted">{dateTime(order?.createdAt ?? charge.occurredAt)}{order ? ` · Signed by ${focusedStay.primaryGuestName}` : ""}</p></div></div><div className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">On tab</span><strong className="text-[13px]">{money(charge.amount)}</strong></div></div>{order?.items.map((line) => <div key={line.id} className="ml-6 mt-1 flex justify-between gap-2 text-xs text-muted"><span>{line.quantity} × {line.menuItem.name}{line.modifierSelections?.length ? <small className="block pl-4 text-[10px] text-muted">{line.modifierSelections.map((selection) => `${selection.groupName}: ${selection.options.map((option) => option.name).join(", ")}`).join(" · ")}</small> : null}</span><span>{money(line.subtotal ?? Number(line.unitPrice ?? line.menuItem.price) * line.quantity)}</span></div>)}{!order && <div className="ml-6 mt-1 flex justify-between text-xs text-muted"><span>{charge.quantity} × {money(charge.unitPrice)}</span></div>}</div>; })}</div> : <p className="pb-1 text-xs text-muted">No room or restaurant charges are waiting for payment.</p>}</section>
                <section className="mt-4 rounded-xl border border-[#f2e6ec] px-4 py-3.5"><div className="mb-1 flex items-center justify-between"><h3 className="text-sm font-extrabold">History</h3><span className="text-[11px] text-muted">Paid bills stay here for receipts</span></div>{paidOrders.length || settledCharges.length ? <div className="divide-y divide-[#f4e7ed]">{paidOrders.map((order) => <div key={order.id} className="py-2"><div className="flex items-center justify-between gap-2"><div className="flex min-w-0 gap-2"><ReceiptText size={16} className="mt-0.5 shrink-0 text-muted" /><div className="min-w-0"><p className="truncate text-[13px] font-bold">Bill #{order.id.slice(0, 6).toUpperCase()} · {order.table ? `Restaurant · Table ${order.table.tableNumber}` : "Room service"}</p><p className="mt-0.5 text-xs text-muted">{dateTime(order.paidAt ?? order.updatedAt)} · {order.paymentMethod === "CARD" ? "Paid by card" : "Paid at the table"}</p></div></div><div className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Paid · {order.paymentMethod === "CARD" ? "Card" : "Cash"}</span><strong className="text-[13px]">{money(order.totalAmount)}</strong></div></div>{order.items?.map((line) => <div key={line.id} className="ml-6 mt-1 flex justify-between gap-3 text-xs text-muted"><span>{line.quantity} × {line.menuItem.name}{line.modifierSelections?.length ? <small className="block pl-4 text-[10px] text-muted">{line.modifierSelections.map((selection) => `${selection.groupName}: ${selection.options.map((option) => option.name).join(", ")}`).join(" · ")}</small> : null}</span><span>{money(line.subtotal ?? Number(line.unitPrice ?? line.menuItem.price) * line.quantity)}</span></div>)}</div>)}{settledCharges.filter((charge) => !charge.orderId).map((charge) => <div key={charge.id} className="flex justify-between gap-2 py-3 text-[13px]"><span>{charge.description}</span><span>{money(charge.amount)}</span></div>)}</div> : <p className="py-3 text-xs text-muted">No settled bills yet.</p>}</section>
                <section className="mt-4 rounded-xl border border-[#f2e6ec] px-4 py-3.5"><h3 className="text-sm font-extrabold">Deposits and payments</h3>{timeline.payments?.length ? timeline.payments.map((payment) => <div key={payment.id} className="mt-2 flex items-start gap-2 border-t border-[#f4e7ed] pt-2"><ReceiptText size={15} className="mt-0.5 shrink-0 text-[#e91488]" /><div className="min-w-0 flex-1"><p className="text-[13px] font-bold">{payment.method === "CARD" ? "Tab settled by card" : "Tab settled by cash"}</p><p className="mt-0.5 text-[11px] text-muted">{dateTime(payment.paidAt)}{payment.receivedBy?.name ? ` · Taken by ${payment.receivedBy.name}` : ""}</p></div><strong className="shrink-0 text-[13px]">{money(payment.amount)}</strong></div>) : <p className="mt-1 text-xs text-muted">No payments recorded</p>}<div className="mt-2 flex justify-between border-t border-[#f4e7ed] pt-2 text-base font-extrabold"><span>Balance</span><span>{money(openTotal)}</span></div></section>
              </>;
            })()}
          </> : <div className="py-12 text-center text-xs text-muted">{timelineLoading ? "Loading room folio…" : focusedStay ? "Select a stay to load its folio." : "Choose a stay from the history above."}</div>}</div>
        <div className="flex flex-wrap items-center gap-2 border-t border-[#f3e7ed] bg-white px-5 py-2.5"><button disabled={!canManageFolios || !isFocusedStayActive || timeline?.cashOnly} onClick={() => { setSelectedRoom(focusedRoom); setChargeKind("OTHER"); setChargeDescription(""); setChargeQuantity("1"); setChargePrice(""); setModal("charge"); }} className="h-12 rounded-lg border border-[#f0dfe8] px-5 text-sm font-bold disabled:opacity-40">Add charge</button><button disabled={!timeline} onClick={() => timeline && setCheckoutReceipt(createFolioReceipt(timeline))} className="h-12 rounded-lg border border-[#f0dfe8] px-5 text-sm font-bold disabled:opacity-40">View receipt</button><span className="flex-1" />{isFocusedStayActive && canManageFolios && <><button disabled={busy} onClick={() => void checkOut()} className="h-12 rounded-lg border border-[#f0dfe8] px-5 text-sm font-bold disabled:opacity-40">Check out</button>{Number(timeline?.folioTotal ?? 0) > 0 && <button disabled={busy} onClick={() => { setSelectedRoom(focusedRoom); setRoomPaymentMethod("CASH"); setModal("settle"); }} className="h-12 rounded-lg bg-[#f01898] px-5 text-sm font-bold text-white disabled:opacity-40">Settle tab · {money(timeline?.folioTotal ?? 0)}</button>}</>}</div></aside></div>, document.body)}

      {modal === "room" && <Modal title={editingRoom ? "Edit room" : "New room"} onClose={() => setModal(null)}><form onSubmit={(event) => void saveRoom(event)} className="space-y-5">
        <section>
          <h3 className="text-sm font-bold">Details</h3>
          <p className="mt-1 text-[11px] text-muted">How staff will find it on the Rooms screen</p>
          <div className="mt-4"><Field label="Room name or number" type="text" required maxLength={80} value={roomNumber} onChange={(event) => setRoomNumber(event.target.value)} placeholder="e.g. 16 or Garden Bungalow 4" autoComplete="off" /></div>
        </section>
        {!editingRoom && <section className="border-t border-line pt-5">
          <h3 className="text-sm font-bold">Guests</h3>
          <p className="mt-1 text-[11px] text-muted">Everyone staying in the room, so their orders go on the right tab.</p>
          <div className="mt-4 space-y-3">{guestNames.map((name, index) => <Field key={index} label={index === 0 ? "Guest name" : `Guest ${index + 1}`} type="text" maxLength={120} value={name} onChange={(event) => setGuestNames((current) => current.map((entry, entryIndex) => entryIndex === index ? event.target.value : entry))} placeholder={index === 0 ? "e.g. Emma Clarke" : "Another guest"} autoComplete="off" />)}</div>
          <button type="button" onClick={() => setGuestNames((current) => [...current, ""])} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold"><Plus size={13} /> Add another guest</button>
        </section>}
        <div className="flex items-center justify-between gap-3 pt-1">
          <button type="button" onClick={() => setModal(null)} className="h-11 rounded-xl border border-line px-5 text-sm font-bold">Cancel</button>
          <button disabled={busy || !roomNumber.trim()} className="h-11 rounded-xl bg-[#ed168c] px-5 text-sm font-bold text-white disabled:opacity-50">{editingRoom ? "Save" : "Add room"}</button>
        </div>
      </form></Modal>}

      {(modal === "checkin" || modal === "editStay") && <Modal title={modal === "checkin" ? "Check in" : `Edit stay · Room ${selectedRoom?.roomNumber}`} onClose={() => setModal(null)}><form onSubmit={(event) => void (modal === "checkin" ? checkIn(event) : editStay(event))} className="space-y-3.5">
        {modal === "checkin" && <SelectField label="Room" value={selectedRoom?.id ?? ""} onChange={(event) => setSelectedRoom(rooms.find((room) => room.id === event.target.value) ?? null)}>{rooms.filter((room) => room.status === "AVAILABLE").map((room) => <option key={room.id} value={room.id}>{roomLabel(room.roomNumber)}</option>)}</SelectField>}
        <Field label="Guest name" required value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="Primary guest" />
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink">Additional guests</span><textarea value={occupants} onChange={(event) => setOccupants(event.target.value)} rows={2} placeholder="One name per line" className="w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm outline-none focus:border-[#f01898]" /></label>
        <div className="grid grid-cols-2 gap-3"><Field label="Arrives" type="date" value={modal === "editStay" && selectedRoom?.stays[0] ? selectedRoom.stays[0].checkedInAt.slice(0, 10) : new Date().toISOString().slice(0, 10)} disabled /><Field label="Leaves" type="date" value={expectedCheckoutAt} onChange={(event) => setExpectedCheckoutAt(event.target.value)} /></div>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink">Notes for staff (allergies, dietary, VIP)</span><textarea value={guestNotes} onChange={(event) => setGuestNotes(event.target.value)} rows={2} placeholder="e.g. Peanut allergy, vegetarian" className="w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm outline-none focus:border-[#f01898]" /></label>
        <div className="grid grid-cols-[1fr_1fr] gap-3 rounded-xl border border-line p-3"><label className="flex cursor-pointer items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={cashOnly} onChange={(event) => setCashOnly(event.target.checked)} className="accent-[#f01898]" /> Cash only</label><Field label="Charge limit" type="number" min="0" step="0.01" placeholder="No limit" value={chargeLimit} onChange={(event) => setChargeLimit(event.target.value)} /></div>
        <button disabled={busy || !selectedRoom} className="h-11 w-full rounded-xl bg-[#f01898] text-sm font-bold text-white disabled:opacity-50">{modal === "checkin" ? "Check in guest" : "Save stay details"}</button>
      </form></Modal>}
      {modal === "charge" && <Modal title={`Add charge · Room ${selectedRoom?.roomNumber ?? ""}`} onClose={() => setModal(null)}><form onSubmit={(event) => void addCharge(event)} className="space-y-4"><p className="text-[10px] font-semibold text-muted">Quick add</p><div className="grid grid-cols-2 gap-2">{[{ name: "Laundry", kind: "OTHER" as const, description: "Laundry, 1 bag", price: "5" }, { name: "Scooter rental", kind: "OTHER" as const, description: "Scooter rental, 1 day", price: "15" }, { name: "Island tour", kind: "OTHER" as const, description: "Island tour", price: "45" }, { name: "Boat transfer", kind: "OTHER" as const, description: "Boat transfer", price: "30" }].map((preset) => <button type="button" key={preset.name} onClick={() => { setChargeKind(preset.kind); setChargeDescription(preset.description); setChargeQuantity("1"); setChargePrice(preset.price); }} className={`rounded-xl border px-3 py-3 text-left ${chargeDescription === preset.description ? "border-[#f01898] bg-pink-50" : "border-line hover:border-pink-200"}`}><span className="block text-xs font-bold">{preset.name}</span><span className="mt-1 block text-[10px] text-muted">{money(preset.price)} per unit</span></button>)}</div><Field label="Description" required value={chargeDescription} onChange={(event) => setChargeDescription(event.target.value)} placeholder="Describe this charge" /><div className="grid grid-cols-2 gap-3"><Field label="Quantity" type="number" required min="1" value={chargeQuantity} onChange={(event) => setChargeQuantity(event.target.value)} /><Field label="Price each" type="number" required min="0" step="0.01" value={chargePrice} onChange={(event) => setChargePrice(event.target.value)} /></div><div className="flex justify-between border-t border-line pt-3 text-sm"><span className="text-muted">Amount</span><strong>{money(Number(chargePrice || 0) * Number(chargeQuantity || 0))}</strong></div><button disabled={busy} className="h-11 w-full rounded-xl bg-[#f01898] text-sm font-bold text-white">Add charge to tab</button></form></Modal>}
      {modal === "settle" && <Modal title={`Settle tab · Room ${selectedRoom?.roomNumber ?? focusedRoom?.roomNumber ?? ""}`} onClose={() => setModal(null)}><div className="space-y-4"><p className="text-xs text-muted">Choose how the guest paid. The stay remains open and settled bills move to history.</p><div className="grid grid-cols-2 gap-2">{(["CASH", "CARD"] as const).map((method) => <button key={method} disabled={method === "CARD" && !!timeline?.cashOnly} onClick={() => setRoomPaymentMethod(method)} className={`rounded-xl border p-3 text-sm font-bold disabled:opacity-40 ${roomPaymentMethod === method ? "border-[#f01898] bg-pink-50 text-[#c20d77]" : "border-line"}`}>{method === "CASH" ? "Cash" : "Paid by card"}</button>)}</div><div className="flex justify-between rounded-xl bg-canvas p-4 text-sm font-bold"><span>Tab total</span><span>{money(timeline?.folioTotal ?? 0)}</span></div><button disabled={busy || !timeline?.folioTotal} onClick={() => void settleTab()} className="h-11 w-full rounded-xl bg-[#f01898] text-sm font-bold text-white disabled:opacity-50">Settle tab · {money(timeline?.folioTotal ?? 0)}</button></div></Modal>}


    </div>
    {checkoutReceipt && <ReceiptPreview receipt={checkoutReceipt} restaurantName={restaurantName} restaurantLogoUrl={restaurantLogoUrl} onClose={() => setCheckoutReceipt(null)} />}
  </>;
}
