import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { BedDouble, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { useUiStore } from "../stores/uiStore";

type CloudbedsRoom = { roomID: string; roomName: string; roomTypeName: string; rate?: number; weekendRate?: number };
type CloudbedsStay = {
  reservationID: string;
  subReservationID: string | null;
  roomID: string | null;
  roomName: string | null;
  guestName: string;
  startDate: string;
  endDate: string;
  status: string;
  roomStatus: string;
  adults: string;
  children: string;
  balance: number;
  sourceName: string;
  tone?: string;
  arriveTime?: string;
  leaveTime?: string;
};
type CalendarResponse = {
  configured: boolean;
  from: string;
  to: string;
  rooms: CloudbedsRoom[];
  stays: CloudbedsStay[];
};

const DAY = 72;
const LABEL = 196;
const SPANS = [[7, "Week"], [14, "2 weeks"], [31, "Month"], [62, "Year"]] as const;

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
function dayIndex(value: string, origin: string) {
  return Math.round((parseDate(value).getTime() - parseDate(origin).getTime()) / 86400000);
}
function formatDay(value: string, withYear = false) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) }).format(parseDate(value));
}
function guestCount(stay: CloudbedsStay) {
  return Number(stay.adults || 0) + Number(stay.children || 0);
}
function stayCaption(stay: CloudbedsStay, showArrive: boolean, showLeave: boolean) {
  const parts = [
    showArrive ? `Arrives ${stay.arriveTime || "14:00"}` : "",
    showLeave ? `Leaves ${stay.leaveTime || "12:00"}` : "",
    `${guestCount(stay)} guest${guestCount(stay) === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return parts.join(" · ");
}
function occupiedOn(stays: CloudbedsStay[], roomIDs: Set<string>, day: string) {
  return stays.filter((stay) => stay.roomID && roomIDs.has(stay.roomID) && stay.startDate <= day && stay.endDate > day).length;
}
function dayRate(rooms: CloudbedsRoom[], day: Date) {
  const weekend = day.getDay() === 5 || day.getDay() === 6;
  const rates = rooms.map((room) => (weekend ? room.weekendRate : room.rate) || room.rate).filter((rate): rate is number => typeof rate === "number");
  return rates.length ? Math.min(...rates) : null;
}
function baht(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

const tone: Record<string, string> = {
  pink: "border-[#f6c4de] bg-[#ffe8f4] text-[#b30d6e]",
  blue: "border-[#b9ddf5] bg-[#e7f4fc] text-[#1d6794]",
  yellow: "border-[#f0e0a4] bg-[#fff6d6] text-[#8a6810]",
  orange: "border-[#f6d2b4] bg-[#fff1e6] text-[#a85b1c]",
  grey: "border-[#e6e1e4] bg-[#f6f4f5] text-[#8a8388]",
  not_checked_in: "border-[#f6c4de] bg-[#ffe8f4] text-[#b30d6e]",
  in_house: "border-[#b9ddf5] bg-[#e7f4fc] text-[#1d6794]",
  checked_out: "border-[#e6e1e4] bg-[#f6f4f5] text-[#8a8388]",
};

export function RoomCalendar() {
  const notify = useUiStore((state) => state.notify);
  const [span, setSpan] = useState<(typeof SPANS)[number][0]>(14);
  const [anchor, setAnchor] = useState(() => {
    const today = isoDate(new Date());
    return today >= "2026-10-22" && today <= "2026-11-04" ? "2026-10-22" : today;
  });
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [closedTypes, setClosedTypes] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<{ stay: CloudbedsStay; x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const from = anchor;
  const to = isoDate(addDays(parseDate(anchor), span));
  const days = useMemo(() => Array.from({ length: span }, (_, index) => addDays(parseDate(from), index)), [from, span]);
  const today = isoDate(new Date());

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<CalendarResponse>("/rooms/cloudbeds/calendar", { params: { from, to } });
      setCalendar(data);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [from, to]);

  const rows = useMemo(() => {
    const stays = calendar?.stays ?? [];
    const rooms = calendar?.rooms ?? [];
    const known = new Set(rooms.map((room) => room.roomID));
    const groups = new Map<string, CloudbedsRoom[]>();
    for (const room of rooms) {
      const list = groups.get(room.roomTypeName) ?? [];
      list.push(room);
      groups.set(room.roomTypeName, list);
    }
    const unassigned = stays.filter((stay) => !stay.roomID || !known.has(stay.roomID));
    return { groups: [...groups.entries()], unassigned };
  }, [calendar]);

  const act = async (action: "check-in" | "check-out") => {
    if (!selected) return;
    const stay = selected.stay;
    setBusy(true);
    try {
      const { data } = await api.post<{ folio?: { warning?: string | null } }>(`/rooms/cloudbeds/${action}`, {
        reservationID: stay.reservationID,
        subReservationID: stay.subReservationID ?? undefined,
        roomID: stay.roomID ?? undefined,
        roomName: stay.roomName ?? undefined,
        guestName: stay.guestName,
        checkOut: stay.endDate,
      });
      notify(data.folio?.warning || (action === "check-in" ? `${stay.guestName} is checked in.` : `${stay.guestName} is checked out.`), data.folio?.warning ? "error" : "success");
      setSelected(null);
      await load();
    } catch (cause) {
      notify(errorMessage(cause), "error");
    } finally {
      setBusy(false);
    }
  };

  const openStay = (stay: CloudbedsStay, event: MouseEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setSelected({ stay, x: Math.min(box.left, window.innerWidth - 280), y: Math.min(box.bottom + 8, window.innerHeight - 230) });
  };

  return <section className="overflow-hidden rounded-[22px] border border-[#f1dfe7] bg-white shadow-card">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f6e8ee] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label="Previous dates" onClick={() => setAnchor(isoDate(addDays(parseDate(anchor), -span)))} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-[#fff4f9]"><ChevronLeft size={16} /></button>
        <h2 className="min-w-[11rem] text-center font-display text-[15px] font-extrabold tracking-tight">{formatDay(from)} to {formatDay(isoDate(addDays(parseDate(to), -1)), true)}</h2>
        <button type="button" aria-label="Next dates" onClick={() => setAnchor(isoDate(addDays(parseDate(anchor), span)))} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-[#fff4f9]"><ChevronRight size={16} /></button>
        <button type="button" onClick={() => setAnchor(today)} className="h-8 rounded-lg bg-[#ed168c] px-3.5 text-[12px] font-bold text-white">Today</button>
      </div>
      <div className="flex items-center gap-1">{SPANS.map(([value, label]) => <button key={value} type="button" onClick={() => setSpan(value)} className={`h-8 rounded-lg px-2.5 text-[12px] font-bold ${span === value ? "text-[#ec1593]" : "text-muted hover:text-ink"}`}>{label}</button>)}</div>
    </header>
    {error && <p role="alert" className="m-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    {loading && !calendar ? <div className="h-64 animate-pulse bg-[#fffafc]" /> : calendar && <div className="overflow-x-auto">
      <div style={{ width: LABEL + span * DAY }}>
        <div className="sticky top-0 z-10 flex border-b border-[#f6e8ee] bg-white">
          <div className="sticky left-0 z-20 shrink-0 border-r border-[#f6e8ee] bg-white" style={{ width: LABEL }} />
          {days.map((day) => {
            const key = isoDate(day);
            const current = key === today;
            return <div key={key} className={`shrink-0 px-1 py-2 text-center ${current ? "bg-[#fff0f7]" : ""}`} style={{ width: DAY }}>
              <p className={`text-[9px] font-bold uppercase ${current ? "text-[#ec1593]" : "text-muted"}`}>{new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(day)}</p>
              <p className={`text-sm font-extrabold ${current ? "text-[#ec1593]" : "text-ink"}`}>{day.getDate()}</p>
            </div>;
          })}
        </div>
        <AvailabilityRow label="All rooms" detail={`${calendar.rooms.length} rooms · free and booked %`} days={days} today={today} rooms={calendar.rooms} stays={calendar.stays} showPercent />
        {rows.unassigned.length > 0 && <RoomRow label="Unassigned" stays={rows.unassigned} from={from} span={span} today={today} onSelect={openStay} />}
        {rows.groups.map(([typeName, rooms]) => {
          const name = typeName || "Rooms";
          const fromRate = rooms.reduce<number | null>((lowest, room) => room.rate == null ? lowest : lowest == null ? room.rate : Math.min(lowest, room.rate), null);
          const open = !closedTypes[name];
          return <div key={name}>
            <AvailabilityRow label={name} detail={`${rooms.length} room${rooms.length === 1 ? "" : "s"}${fromRate == null ? "" : ` · from ${baht(fromRate)} THB`}`} days={days} today={today} rooms={rooms} stays={calendar.stays} collapsible open={open} onToggle={() => setClosedTypes((current) => ({ ...current, [name]: open }))} />
            {open && rooms.map((room) => <RoomRow key={room.roomID} label={room.roomName} stays={(calendar.stays ?? []).filter((stay) => stay.roomID === room.roomID)} from={from} span={span} today={today} onSelect={openStay} />)}
          </div>;
        })}
        {!rows.groups.length && !rows.unassigned.length && <p className="px-4 py-10 text-center text-sm text-muted">No rooms in this range.</p>}
      </div>
    </div>}
    <footer className="flex flex-wrap gap-4 border-t border-[#f6e8ee] px-4 py-2.5 text-[10px] font-semibold text-muted">
      <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#ffe8f4] ring-1 ring-[#f6c4de]" /> Arriving</span>
      <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#e7f4fc] ring-1 ring-[#b9ddf5]" /> In house</span>
      <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#fff6d6] ring-1 ring-[#f0e0a4]" /> Upcoming</span>
      <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#f6f4f5] ring-1 ring-[#e6e1e4]" /> Checked out</span>
    </footer>
    {selected && <div className="fixed inset-0 z-[80]" onMouseDown={() => setSelected(null)}>
      <section role="dialog" aria-modal="true" aria-label={selected.stay.guestName} className="absolute w-[260px] rounded-xl border border-[#f3d5e4] bg-white p-3.5 shadow-[0_16px_40px_rgba(80,30,55,.16)]" style={{ left: selected.x, top: selected.y }} onMouseDown={(event) => event.stopPropagation()}>
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#ec1593]">{selected.stay.roomName || "Unassigned"}</p>
        <h3 className="mt-0.5 font-display text-lg font-extrabold leading-6">{selected.stay.guestName}</h3>
        <p className="mt-1 text-[11px] text-muted">Arrives {selected.stay.arriveTime || "14:00"} · Leaves {selected.stay.leaveTime || "12:00"}</p>
        <p className="mt-0.5 text-[11px] text-muted">{formatDay(selected.stay.startDate, true)} – {formatDay(selected.stay.endDate, true)}</p>
        <p className="mt-0.5 text-[11px] text-muted">{selected.stay.adults} adult{selected.stay.adults === "1" ? "" : "s"}{Number(selected.stay.children) > 0 ? ` · ${selected.stay.children} children` : ""}{selected.stay.sourceName ? ` · ${selected.stay.sourceName}` : ""}</p>
        <div className="mt-3">
          {selected.stay.roomStatus === "not_checked_in" && selected.stay.roomID && <button type="button" disabled={busy} onClick={() => void act("check-in")} className="h-9 w-full rounded-lg bg-[#ed168c] text-xs font-bold text-white disabled:opacity-50">{busy ? "Saving…" : "Check in"}</button>}
          {selected.stay.roomStatus === "in_house" && <button type="button" disabled={busy} onClick={() => void act("check-out")} className="h-9 w-full rounded-lg bg-[#ed168c] text-xs font-bold text-white disabled:opacity-50">{busy ? "Saving…" : "Check out"}</button>}
          {selected.stay.roomStatus === "not_checked_in" && !selected.stay.roomID && <p className="text-[11px] text-muted">Assign this stay to a room in Cloudbeds before checking in.</p>}
        </div>
      </section>
    </div>}
  </section>;
}

function AvailabilityRow({ label, detail, days, today, rooms, stays, showPercent = false, collapsible = false, open = true, onToggle }: { label: string; detail: string; days: Date[]; today: string; rooms: CloudbedsRoom[]; stays: CloudbedsStay[]; showPercent?: boolean; collapsible?: boolean; open?: boolean; onToggle?: () => void }) {
  const roomIDs = new Set(rooms.map((room) => room.roomID));
  return <div className="flex border-b border-[#f7eef2] bg-[#fffdfd]" style={{ height: 52 }}>
    <button type="button" onClick={onToggle} className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-[#f6e8ee] bg-white px-3 text-left" style={{ width: LABEL }}>
      {collapsible ? <ChevronDown size={14} className={`shrink-0 text-muted transition ${open ? "" : "-rotate-90"}`} /> : <span className="w-3.5" />}
      <BedDouble size={15} className="shrink-0 text-[#8a8388]" />
      <span className="min-w-0"><span className="block truncate text-[12px] font-extrabold leading-4 text-ink">{label}</span><span className="block truncate text-[9px] leading-3 text-muted">{detail}</span></span>
    </button>
    {days.map((day) => {
      const key = isoDate(day);
      const taken = occupiedOn(stays, roomIDs, key);
      const free = Math.max(0, rooms.length - taken);
      const booked = rooms.length ? Math.round((taken / rooms.length) * 100) : 0;
      const rate = dayRate(rooms, day);
      return <div key={key} className={`flex shrink-0 flex-col items-center justify-center leading-none ${key === today ? "border-l-2 border-[#ed168c] bg-[#fff7fb]" : ""}`} style={{ width: DAY }}>
        <p className="text-[11px] font-extrabold text-ink">{free} free</p>
        <p className="mt-1 text-[9px] font-semibold text-muted">{showPercent ? `${booked}%` : rate == null ? "" : baht(rate)}</p>
      </div>;
    })}
  </div>;
}

function RoomRow({ label, stays, from, span, today, onSelect }: { label: string; stays: CloudbedsStay[]; from: string; span: number; today: string; onSelect: (stay: CloudbedsStay, event: MouseEvent<HTMLButtonElement>) => void }) {
  return <div className="relative flex border-b border-[#f7eef2]" style={{ height: 58 }}>
    <div className="sticky left-0 z-10 flex shrink-0 items-center border-r border-[#f6e8ee] bg-white px-3 pl-9 text-[12px] font-bold" style={{ width: LABEL }}><span className="truncate">{label}</span></div>
    <div className="relative" style={{ width: span * DAY }}>
      {Array.from({ length: span }, (_, index) => {
        const key = isoDate(addDays(parseDate(from), index));
        return <span key={key} className={`absolute inset-y-0 border-r border-[#f8eef3] ${key === today ? "bg-[#fff7fb]" : ""}`} style={{ left: index * DAY, width: DAY }} />;
      })}
      {stays.map((stay) => {
        const start = Math.max(0, dayIndex(stay.startDate, from));
        const end = Math.min(span, dayIndex(stay.endDate, from));
        if (end <= start) return null;
        const caption = stayCaption(stay, dayIndex(stay.startDate, from) >= 0, dayIndex(stay.endDate, from) <= span);
        return <button key={`${stay.reservationID}-${stay.subReservationID ?? stay.roomID ?? stay.startDate}`} type="button" onClick={(event) => onSelect(stay, event)} className={`absolute top-[8px] h-10 overflow-hidden rounded-md border px-2 text-left leading-tight ${tone[stay.tone || stay.roomStatus] ?? tone.not_checked_in}`} style={{ left: start * DAY + 3, width: (end - start) * DAY - 6 }}>
          <span className="block truncate text-[11px] font-extrabold">{stay.guestName}</span>
          <span className="block truncate text-[9px] font-semibold opacity-80">{caption}</span>
        </button>;
      })}
    </div>
  </div>;
}
