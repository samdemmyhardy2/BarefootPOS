import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BedDouble, ClipboardList, Plus, ReceiptText, Trash2, UserRound, Users, Wallet } from "lucide-react";
import { Field, Modal, PageHeader, Panel, SelectField } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { money, type Room, type RoomChargeKind, type RoomSize, type RoomStay } from "../lib/types";
import { useAuthStore } from "../stores/authStore";
import { useUiStore } from "../stores/uiStore";
import { translate, translateFacility } from "../lib/translations";
import { hasJobPermission } from "../lib/access";

type ModalKind = "room" | "checkin" | "charge" | null;
const dateTime = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const roomFacilities = ["Air conditioning", "Wi-Fi", "Family-size bed", "Mini fridge", "Television", "Hot water", "Private bathroom", "Balcony", "In-room safe", "Hair dryer"];

export function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalKind>(null);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [timeline, setTimeline] = useState<RoomStay | null>(null);
  const [stayHistory, setStayHistory] = useState<RoomStay[] | null>(null);
  const [roomNumber, setRoomNumber] = useState("");
  const [size, setSize] = useState<RoomSize>("NORMAL");
  const [usageFee, setUsageFee] = useState("0");
  const [facilities, setFacilities] = useState<string[]>([]);
  const [guestName, setGuestName] = useState("");
  const [occupants, setOccupants] = useState("");
  const [chargeKind, setChargeKind] = useState<RoomChargeKind>("WATER");
  const [chargeDescription, setChargeDescription] = useState("");
  const [chargeQuantity, setChargeQuantity] = useState("1");
  const [chargePrice, setChargePrice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const currentUser = useAuthStore((state) => state.user);
  const isAdmin = currentUser?.role === "ADMIN";
  const canManageStays = hasJobPermission(currentUser, "ROOM_MANAGE");
  const canManageFolios = hasJobPermission(currentUser, "ROOM_FOLIO");
  const notify = useUiStore((state) => state.notify);
  const language = useUiStore((state) => state.language);
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get<Room[]>("/rooms"); setRooms(data); }
    catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const openRoom = (room?: Room) => {
    setEditingRoom(room ?? null);
    setRoomNumber(room ? String(room.roomNumber) : "");
    setSize(room?.size ?? "NORMAL");
    setUsageFee(String(room?.usageFee ?? 0));
    setFacilities(room?.facilities ?? []);
    setError("");
    setModal("room");
  };
  const saveRoom = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const payload = { roomNumber: Number(roomNumber), size, usageFee: Number(usageFee), facilities };
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
      await api.post(`/rooms/${selectedRoom.id}/check-in`, { primaryGuestName: guestName, occupants: [guestName, ...names] });
      setModal(null); setGuestName(""); setOccupants(""); notify(`Guest checked into room ${selectedRoom.roomNumber}.`); await load();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const addCharge = async (event: FormEvent) => {
    event.preventDefault(); if (!selectedRoom?.stays[0]) return; setBusy(true); setError("");
    try {
      await api.post(`/rooms/stays/${selectedRoom.stays[0].id}/charges`, { kind: chargeKind, description: chargeDescription, quantity: Number(chargeQuantity), unitPrice: Number(chargePrice) });
      setModal(null); setChargeDescription(""); setChargeQuantity("1"); setChargePrice(""); notify("Room usage added to the folio."); await openTimeline(selectedRoom.stays[0].id); await load();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const openTimeline = async (stayId: string) => {
    setError("");
    try { const { data } = await api.get<RoomStay>(`/rooms/stays/${stayId}/timeline`); setTimeline(data); }
    catch (e) { setError(errorMessage(e)); }
  };
  const openHistory = async (room: Room) => {
    setError("");
    try { const { data } = await api.get<RoomStay[]>(`/rooms/${room.id}/stays`); setStayHistory(data); }
    catch (e) { setError(errorMessage(e)); }
  };
  const checkOut = async () => {
    if (!timeline || !window.confirm(`Check out ${timeline.primaryGuestName}? Folio total: ${money(timeline.folioTotal)}.`)) return;
    setBusy(true); setError("");
    try {
      const { data } = await api.post<RoomStay>(`/rooms/stays/${timeline.id}/check-out`);
      setTimeline(data); notify("Guest checked out. Room folio closed."); await load();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const activeRooms = rooms.filter((room) => room.status === "OCCUPIED").length;
  const timelineEntries = timeline ? [
    ...(timeline.charges ?? []).map((charge) => {
      const order = charge.orderId ? timeline.orders?.find((candidate) => candidate.id === charge.orderId) : undefined;
      return {
        id: charge.id,
        at: charge.occurredAt,
        title: order ? `Restaurant order #${order.id.slice(0, 8)}` : charge.description,
        detail: charge.kind.replace(/_/g, " "),
        amount: Number(charge.amount),
        order,
        paid: false,
      };
    }),
    ...(timeline.orders ?? []).filter((order) => order.paymentMethod === "CASH").map((order) => ({
      id: `cash-${order.id}`,
      at: order.paidAt ?? order.createdAt,
      title: `Restaurant order #${order.id.slice(0, 8)}`,
      detail: "Paid cash",
      amount: Number(order.totalAmount),
      order,
      paid: true,
    })),
  ].sort((a, b) => +new Date(a.at) - +new Date(b.at)) : [];
  return <div className="page-enter min-h-full w-full">
    <PageHeader eyebrow="Front desk · Guest stays" title={t("rooms")} description="Check guests in, record room usage, and review their itemized checkout timeline." action={isAdmin ? <button onClick={() => openRoom()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-olive px-4 text-xs font-bold text-white"><Plus size={15} /> {t("addRoom")}</button> : undefined} />
    {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Panel className="flex items-center gap-3 p-4"><BedDouble className="text-olive" /><div><p className="font-display text-xl font-bold">{rooms.length}</p><p className="text-[11px] text-muted">{t("totalRooms")}</p></div></Panel>
      <Panel className="flex items-center gap-3 p-4"><Users className="text-rose-600" /><div><p className="font-display text-xl font-bold">{activeRooms}</p><p className="text-[11px] text-muted">{t("occupiedRooms")}</p></div></Panel>
      <Panel className="flex items-center gap-3 p-4"><Wallet className="text-emerald-700" /><div><p className="font-display text-xl font-bold">{rooms.filter((room) => room.status === "AVAILABLE").length}</p><p className="text-[11px] text-muted">{t("availableRooms")}</p></div></Panel>
      <Panel className="flex items-center gap-3 p-4"><BedDouble className="text-amber-700" /><div><p className="font-display text-xl font-bold">{rooms.filter((room) => room.status === "MAINTENANCE" || room.status === "ARCHIVED").length}</p><p className="text-[11px] text-muted">Maintenance / archived</p></div></Panel>
    </div>
    {loading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-56 animate-pulse rounded-2xl bg-white" />)}</div> : rooms.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{rooms.map((room) => {
      const stay = room.stays?.[0];
      return <Panel key={room.id} className="overflow-hidden">
        <div className={`h-1.5 ${stay ? "bg-rose-400" : "bg-emerald-500"}`} />
        <div className="p-5">
          <div className="flex items-start justify-between"><div><p className="font-display text-2xl font-extrabold">Room {room.roomNumber}</p><p className="mt-1 text-xs text-muted">{room.size === "FAMILY" ? t("familyRoom") : t("normalRoom")}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${room.status === "OCCUPIED" ? "bg-rose-50 text-rose-700" : room.status === "AVAILABLE" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{room.status === "AVAILABLE" ? t("available") : room.status === "MAINTENANCE" ? t("maintenance") : room.status === "ARCHIVED" ? t("archived") : t("occupied")}</span></div>
          <p className="mt-3 text-xs text-muted">Room usage fee <strong className="text-ink">{money(room.usageFee)}</strong> per stay</p>
          {room.facilities?.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{room.facilities.map((facility) => <span key={facility} className="rounded-full bg-canvas px-2.5 py-1 text-[10px] font-medium text-muted">{translateFacility(language, facility)}</span>)}</div>}
          {stay ? <>
            <div className="mt-4 rounded-xl bg-canvas p-3"><p className="text-xs font-bold">{stay.primaryGuestName}</p><p className="mt-1 text-[10px] text-muted">{stay.occupants.length} registered guest{stay.occupants.length === 1 ? "" : "s"} · Since {dateTime(stay.checkedInAt)}</p></div>
            <div className="mt-3 grid grid-cols-2 gap-2">{canManageFolios && <button onClick={() => { setSelectedRoom(room); setChargeKind("WATER"); setModal("charge"); }} className="rounded-lg border border-line py-2 text-[10px] font-bold hover:bg-canvas">Record usage</button>}<button onClick={() => void openTimeline(stay.id)} className="flex items-center justify-center gap-1 rounded-lg border border-line py-2 text-[10px] font-bold hover:bg-canvas"><ClipboardList size={12} /> Folio timeline</button></div>
          </> : <div className="mt-5 grid grid-cols-2 gap-2">{canManageStays && room.status === "AVAILABLE" && <button onClick={() => { setSelectedRoom(room); setError(""); setModal("checkin"); }} className="flex items-center justify-center gap-2 rounded-xl bg-olive py-2.5 text-xs font-bold text-white hover:bg-[#334438]"><UserRound size={14} /> Check in</button>}<button onClick={() => void openHistory(room)} className="flex items-center justify-center gap-1 rounded-xl border border-line py-2.5 text-[10px] font-bold hover:bg-canvas"><ClipboardList size={12} /> Stay history</button></div>}
          {isAdmin && <div className="mt-3 space-y-2 border-t border-line pt-3">{!stay && <SelectField label="Room status" value={room.status} onChange={(event) => void changeRoomStatus(room, event.target.value as Room["status"])}><option value="AVAILABLE">Available to rent</option><option value="MAINTENANCE">Under maintenance</option><option value="ARCHIVED">Archived (keep history)</option></SelectField>}<div className="flex items-center justify-between"><button onClick={() => openRoom(room)} className="text-[10px] font-semibold text-muted hover:text-olive">Edit room and fee</button><button onClick={() => void deleteRoom(room)} aria-label={`Permanently delete room ${room.roomNumber} and its history`} title="Permanently delete room and history" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button></div></div>}
        </div>
      </Panel>;
    })}</div> : <Panel className="p-12 text-center"><BedDouble className="mx-auto text-muted" /><p className="mt-3 font-semibold">No rooms configured</p><p className="mt-1 text-sm text-muted">Add a room to begin managing guest stays and folios.</p></Panel>}

    {modal === "room" && <Modal title={editingRoom ? t("editRoom") : t("addRoom")} onClose={() => setModal(null)}><form onSubmit={(event) => void saveRoom(event)} className="space-y-4"><Field label={t("roomNumber")} type="number" required min="1" value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} /><SelectField label={t("roomSize")} value={size} onChange={(e) => setSize(e.target.value as RoomSize)}><option value="NORMAL">{t("normal")}</option><option value="FAMILY">{t("family")}</option></SelectField><Field label={t("roomFee")} type="number" required min="0" step="0.01" value={usageFee} onChange={(e) => setUsageFee(e.target.value)} /><p className="-mt-2 text-[10px] text-muted">{t("roomFeeHelp")}</p><fieldset><legend className="mb-2 text-xs font-semibold text-ink">{t("roomFacilities")}</legend><div className="grid grid-cols-2 gap-2">{roomFacilities.map((facility) => <label key={facility} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-[11px] text-ink"><input type="checkbox" checked={facilities.includes(facility)} onChange={(event) => setFacilities((current) => event.target.checked ? [...current, facility] : current.filter((item) => item !== facility))} className="accent-olive" />{translateFacility(language, facility)}</label>)}</div><p className="mt-2 text-[10px] text-muted">{t("selectAmenities")}</p></fieldset><button disabled={busy} className="h-11 w-full rounded-xl bg-olive text-sm font-bold text-white disabled:opacity-50">{editingRoom ? t("saveRoom") : t("addRoom")}</button></form></Modal>}
    {modal === "checkin" && <Modal title={`Check in · Room ${selectedRoom?.roomNumber}`} onClose={() => setModal(null)}><form onSubmit={(event) => void checkIn(event)} className="space-y-4"><Field label="Primary guest" required value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Guest full name" /><label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink">Other people staying in this room</span><textarea value={occupants} onChange={(e) => setOccupants(e.target.value)} rows={3} placeholder="One name per line" className="w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm outline-none focus:border-olive" /></label><p className="-mt-2 text-[10px] text-muted">The primary guest is included automatically. Room fee {money(selectedRoom?.usageFee)} will be posted to checkout.</p><button disabled={busy} className="h-11 w-full rounded-xl bg-olive text-sm font-bold text-white">Check in guests</button></form></Modal>}
    {modal === "charge" && <Modal title={`Record room usage · ${selectedRoom?.stays[0]?.primaryGuestName ?? "Guest"}`} onClose={() => setModal(null)}><form onSubmit={(event) => void addCharge(event)} className="space-y-4"><SelectField label="Usage type" value={chargeKind} onChange={(e) => setChargeKind(e.target.value as RoomChargeKind)}><option value="WATER">Water</option><option value="FOOD">Food</option><option value="OTHER">Other room usage</option></SelectField><Field label="Description" required value={chargeDescription} onChange={(e) => setChargeDescription(e.target.value)} placeholder="e.g. 2 bottles of water" /><div className="grid grid-cols-2 gap-3"><Field label="Quantity" type="number" required min="1" value={chargeQuantity} onChange={(e) => setChargeQuantity(e.target.value)} /><Field label="Price each" type="number" required min="0" step="0.01" value={chargePrice} onChange={(e) => setChargePrice(e.target.value)} /></div><button disabled={busy} className="h-11 w-full rounded-xl bg-olive text-sm font-bold text-white">Add to guest folio</button></form></Modal>}
    {stayHistory && <Modal title="Room stay history" wide onClose={() => setStayHistory(null)}><div className="max-h-[65vh] divide-y divide-line overflow-y-auto">{stayHistory.length ? stayHistory.map((stay) => <div key={stay.id} className="flex flex-wrap items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="text-sm font-bold">{stay.primaryGuestName}</p><p className="mt-1 text-[10px] text-muted">{dateTime(stay.checkedInAt)}{stay.checkedOutAt ? ` → ${dateTime(stay.checkedOutAt)}` : " · In house"} · {stay.occupants.length} guest(s)</p></div><span className="text-xs font-bold">{money((stay.charges ?? []).reduce((sum, charge) => sum + Number(charge.amount), 0))}</span><button onClick={() => { setStayHistory(null); void openTimeline(stay.id); }} className="rounded-lg border border-line px-3 py-2 text-[10px] font-bold hover:bg-canvas">Timeline</button></div>) : <p className="py-8 text-center text-sm text-muted">No previous stays for this room.</p>}</div></Modal>}
    {timeline && <Modal title={`Guest folio · Room ${timeline.room?.roomNumber}`} wide onClose={() => setTimeline(null)}><div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1"><div className="rounded-xl bg-canvas p-4"><p className="font-bold">{timeline.primaryGuestName}</p><p className="mt-1 text-xs text-muted">Guests: {timeline.occupants.map((person) => person.name).join(", ")}</p><p className="mt-1 text-xs text-muted">Check-in {dateTime(timeline.checkedInAt)}{timeline.checkedOutAt ? ` · Check-out ${dateTime(timeline.checkedOutAt)}` : ""}</p></div><div className="flex items-center justify-between"><h3 className="font-display text-sm font-bold">Usage timeline</h3><span className="text-sm font-extrabold">{money(timeline.folioTotal)}</span></div>{timelineEntries.map((entry) => <div key={entry.id} className="flex gap-3 border-l-2 border-line pl-3"><ReceiptText size={14} className="mt-0.5 shrink-0 text-olive" /><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><p className="text-xs font-bold">{entry.title}</p><span className="text-xs font-bold">{money(entry.amount)}</span></div>{entry.order && <><p className="mt-1 text-xs leading-5 text-ink">{entry.order.items.map((line) => `${line.quantity}× ${line.menuItem.name}`).join(", ")}</p><p className="mt-1 text-[10px] text-muted">Table {entry.order.table?.tableNumber ?? "—"} · Served by {entry.order.servedBy?.name ?? "Not recorded"}</p></>}<p className="mt-1 text-[10px] text-muted">{dateTime(entry.at)} · {entry.detail}{entry.paid ? " · settled" : ""}</p></div></div>)}<div className="border-t border-line pt-3"><div className="flex justify-between text-sm font-extrabold"><span>Amount due at checkout</span><span>{money(timeline.folioTotal)}</span></div><p className="mt-1 text-[10px] text-muted">Cash restaurant orders remain in the history but are excluded from the room folio balance.</p></div></div>{!timeline.checkedOutAt && canManageFolios && <button disabled={busy} onClick={() => void checkOut()} className="mt-5 h-11 w-full rounded-xl bg-olive text-sm font-bold text-white">Check out & close folio</button>}</Modal>}
  </div>;
}
