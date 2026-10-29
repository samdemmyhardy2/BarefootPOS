import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { useUiStore } from "../stores/uiStore";

type CloudbedsRoom = { roomID: string; roomName: string; roomTypeName: string };
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
};
type CalendarResponse = {
  configured: boolean;
  from: string;
  to: string;
  rooms: CloudbedsRoom[];
  stays: CloudbedsStay[];
};

const DAY = 72;
const LABEL = 148;

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

const tone: Record<string, string> = {
  not_checked_in: "border-[#f7c5df] bg-[#fff0f7] text-[#b30d6e]",
  in_house: "border-[#b9ddf5] bg-[#eef7fd] text-[#1d6794]",
  checked_out: "border-[#e6e1e4] bg-[#f6f4f5] text-[#8a8388]",
};

export function RoomCalendar() {
  const notify = useUiStore((state) => state.notify);
  const [span, setSpan] = useState<7 | 14 | 31>(14);
  const [anchor, setAnchor] = useState(() => isoDate(new Date()));
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CloudbedsStay | null>(null);
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
    const groups = new Map<string, { roomID: string; roomName: string; stays: CloudbedsStay[] }[]>();
    for (const room of rooms) {
      const list = groups.get(room.roomTypeName) ?? [];
      list.push({ roomID: room.roomID, roomName: room.roomName, stays: stays.filter((stay) => stay.roomID === room.roomID) });
      groups.set(room.roomTypeName, list);
    }
    const unassigned = stays.filter((stay) => !stay.roomID || !known.has(stay.roomID));
    return { groups: [...groups.entries()], unassigned };
  }, [calendar]);

  const act = async (action: "check-in" | "check-out") => {
    if (!selected) return;
    setBusy(true);
    try {
      const { data } = await api.post<{ folio?: { warning?: string | null } }>(`/rooms/cloudbeds/${action}`, {
        reservationID: selected.reservationID,
        subReservationID: selected.subReservationID ?? undefined,
        roomID: selected.roomID ?? undefined,
        roomName: selected.roomName ?? undefined,
        guestName: selected.guestName,
        checkOut: selected.endDate,
      });
      notify(data.folio?.warning || (action === "check-in" ? `${selected.guestName} is checked in.` : `${selected.guestName} is checked out.`), data.folio?.warning ? "error" : "success");
      setSelected(null);
      await load();
    } catch (cause) {
      notify(errorMessage(cause), "error");
    } finally {
      setBusy(false);
    }
  };

  return <section className="overflow-hidden rounded-[22px] border border-[#f1dfe7] bg-white shadow-card">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f6e8ee] px-4 py-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#ec1593]">Cloudbeds</p>
        <h2 className="mt-1 font-display text-base font-extrabold">{new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(parseDate(from))} to {new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(addDays(parseDate(to), -1))}</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-line">
          <button type="button" aria-label="Previous dates" onClick={() => setAnchor(isoDate(addDays(parseDate(anchor), -span)))} className="grid h-8 w-8 place-items-center text-muted hover:bg-canvas"><ChevronLeft size={14} /></button>
          <button type="button" onClick={() => setAnchor(today)} className="h-8 border-x border-line px-3 text-[11px] font-bold">Today</button>
          <button type="button" aria-label="Next dates" onClick={() => setAnchor(isoDate(addDays(parseDate(anchor), span)))} className="grid h-8 w-8 place-items-center text-muted hover:bg-canvas"><ChevronRight size={14} /></button>
        </div>
        <div className="flex rounded-lg bg-[#fff4f9] p-0.5">{([[7, "Week"], [14, "2 weeks"], [31, "Month"]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setSpan(value)} className={`h-8 rounded-md px-2.5 text-[11px] font-bold ${span === value ? "bg-white text-ink shadow-sm" : "text-muted"}`}>{label}</button>)}</div>
      </div>
    </header>
    {error && <p role="alert" className="m-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    {!error && calendar && !calendar.configured && <p className="m-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Cloudbeds is not connected. Add <span className="font-semibold">CLOUDBEDS_API_KEY</span> on the server. The key needs read access to rooms and reservations, and write access to rooms.</p>}
    {loading && !calendar ? <div className="h-64 animate-pulse bg-[#fffafc]" /> : calendar?.configured && <div className="overflow-x-auto">
      <div style={{ width: LABEL + span * DAY }}>
        <div className="sticky top-0 z-10 flex border-b border-[#f6e8ee] bg-white">
          <div className="sticky left-0 z-20 shrink-0 border-r border-[#f6e8ee] bg-white" style={{ width: LABEL }} />
          {days.map((day) => {
            const key = isoDate(day);
            return <div key={key} className={`shrink-0 px-1 py-2 text-center ${key === today ? "bg-[#fff0f7]" : ""}`} style={{ width: DAY }}>
              <p className={`text-[9px] font-bold uppercase ${key === today ? "text-[#ec1593]" : "text-muted"}`}>{new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(day)}</p>
              <p className={`text-sm font-extrabold ${key === today ? "text-[#ec1593]" : "text-ink"}`}>{day.getDate()}</p>
            </div>;
          })}
        </div>
        {rows.unassigned.length > 0 && <RoomRow label="Unassigned" stays={rows.unassigned} from={from} span={span} today={today} onSelect={setSelected} />}
        {rows.groups.map(([typeName, rooms]) => <div key={typeName}>
          <div className="border-b border-[#f6e8ee] bg-[#fffafc] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted">{typeName}</div>
          {rooms.map((room) => <RoomRow key={room.roomID} label={room.roomName} stays={room.stays} from={from} span={span} today={today} onSelect={setSelected} />)}
        </div>)}
        {!rows.groups.length && !rows.unassigned.length && <p className="px-4 py-10 text-center text-sm text-muted">No Cloudbeds rooms were returned for this property.</p>}
      </div>
    </div>}
    <footer className="flex flex-wrap gap-3 border-t border-[#f6e8ee] px-4 py-2.5 text-[10px] font-semibold text-muted">
      <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#fff0f7] ring-1 ring-[#f7c5df]" /> Arriving</span>
      <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#eef7fd] ring-1 ring-[#b9ddf5]" /> In house</span>
      <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#f6f4f5] ring-1 ring-[#e6e1e4]" /> Checked out</span>
    </footer>
    {selected && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/30 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section role="dialog" aria-modal="true" aria-label={selected.guestName} className="w-full max-w-sm rounded-2xl border border-line bg-white p-4 shadow-float">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#ec1593]">{selected.roomName || "Unassigned"} · {selected.roomStatus.split("_").join(" ")}</p>
        <h3 className="mt-1 font-display text-lg font-extrabold">{selected.guestName}</h3>
        <p className="mt-1 text-xs text-muted">{selected.startDate} to {selected.endDate} · {selected.adults} adult{selected.adults === "1" ? "" : "s"}{Number(selected.children) > 0 ? ` · ${selected.children} children` : ""}</p>
        {selected.sourceName && <p className="mt-1 text-xs text-muted">{selected.sourceName}</p>}
        <p className="mt-2 text-xs font-semibold">Balance {new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(selected.balance)}</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => setSelected(null)} className="h-10 flex-1 rounded-xl border border-line text-xs font-bold">Close</button>
          {selected.roomStatus === "not_checked_in" && selected.roomID && <button type="button" disabled={busy} onClick={() => void act("check-in")} className="h-10 flex-1 rounded-xl bg-[#ed168c] text-xs font-bold text-white disabled:opacity-50">{busy ? "Saving…" : "Check in"}</button>}
          {selected.roomStatus === "in_house" && <button type="button" disabled={busy} onClick={() => void act("check-out")} className="h-10 flex-1 rounded-xl bg-[#ed168c] text-xs font-bold text-white disabled:opacity-50">{busy ? "Saving…" : "Check out"}</button>}
        </div>
        {selected.roomStatus === "not_checked_in" && !selected.roomID && <p className="mt-2 text-[11px] text-muted">Assign this stay to a room in Cloudbeds before checking in.</p>}
      </section>
    </div>}
  </section>;
}

function RoomRow({ label, stays, from, span, today, onSelect }: { label: string; stays: CloudbedsStay[]; from: string; span: number; today: string; onSelect: (stay: CloudbedsStay) => void }) {
  return <div className="relative flex border-b border-[#f6e8ee]" style={{ height: 46 }}>
    <div className="sticky left-0 z-10 flex shrink-0 items-center border-r border-[#f6e8ee] bg-white px-3 text-xs font-bold" style={{ width: LABEL }}><span className="truncate">{label}</span></div>
    <div className="relative" style={{ width: span * DAY }}>
      {Array.from({ length: span }, (_, index) => {
        const key = isoDate(addDays(parseDate(from), index));
        return <span key={key} className={`absolute inset-y-0 border-r border-[#f8eef3] ${key === today ? "bg-[#fff7fb]" : ""}`} style={{ left: index * DAY, width: DAY }} />;
      })}
      {stays.map((stay) => {
        const start = Math.max(0, dayIndex(stay.startDate, from));
        const end = Math.min(span, dayIndex(stay.endDate, from));
        if (end <= start) return null;
        return <button key={`${stay.reservationID}-${stay.subReservationID ?? stay.roomID ?? stay.startDate}`} type="button" onClick={() => onSelect(stay)} className={`absolute top-2 h-7 truncate rounded-md border px-2 text-left text-[11px] font-bold ${tone[stay.roomStatus] ?? tone.not_checked_in}`} style={{ left: start * DAY + 3, width: (end - start) * DAY - 6 }}>{stay.guestName}</button>;
      })}
    </div>
  </div>;
}
