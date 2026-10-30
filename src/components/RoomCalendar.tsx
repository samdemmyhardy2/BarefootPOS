import { useEffect, useMemo, useState } from "react";
import { BedDouble, ChevronLeft, ChevronRight } from "lucide-react";
import { api, errorMessage } from "../lib/api";

type LocalStay = {
  id: string;
  guestName: string;
  startDate: string;
  endDate: string;
  arriveTime: string;
  leaveTime: string;
  leaveDate: string;
  adults: string;
  guestNotes: string | null;
  checkedOut: boolean;
};
type LocalRoom = {
  id: string;
  roomNumber: string;
  status: "AVAILABLE" | "OCCUPIED" | "MAINTENANCE" | "ARCHIVED";
  stays: LocalStay[];
};
type CalendarResponse = { from: string; to: string; rooms: LocalRoom[] };

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
function roomLabel(roomNumber: string) {
  return /^\d+$/.test(roomNumber) ? `Room ${roomNumber}` : roomNumber;
}
function clockSeconds(value: string) {
  const [hours = "00", minutes = "00", seconds = "00"] = value.split(":");
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}:${seconds.padStart(2, "0")}`;
}
function isDeparting(stay: LocalStay, today: string) {
  return !stay.checkedOut && stay.leaveDate === today;
}
function relativeWhen(label: "Arrives" | "Leaves", day: string, time: string, today: string, now: Date) {
  if (!day || !time) return "";
  const [year, month, date] = day.split("-").map(Number);
  const [hours, minutes, seconds] = clockSeconds(time).split(":").map(Number);
  const when = new Date(year, month - 1, date, hours, minutes, seconds);
  const remaining = when.getTime() - now.getTime();
  if (remaining <= 0) return "";
  const totalHours = Math.max(1, Math.ceil(remaining / 3600000));
  const days = Math.floor(totalHours / 24);
  const hourCount = totalHours % 24;
  const hoursText = (count: number) => `${count} hour${count === 1 ? "" : "s"}`;
  if (day === today || days === 0) return `${label} ${hoursText(day === today ? totalHours : hourCount || totalHours)}`;
  const daysText = `${days} day${days === 1 ? "" : "s"}`;
  return hourCount ? `${label} ${daysText} ${hoursText(hourCount)}` : `${label} ${daysText}`;
}
function stayCaption(stay: LocalStay, showArrive: boolean, showLeave: boolean, today: string, now: Date) {
  const guests = Number(stay.adults || 0);
  const parts = [
    showArrive ? relativeWhen("Arrives", stay.startDate, stay.arriveTime, today, now) : "",
    showLeave ? relativeWhen("Leaves", stay.leaveDate, stay.leaveTime, today, now) : "",
    `${guests} guest${guests === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return parts.join(" · ");
}
function covers(stay: LocalStay, day: string) {
  return stay.startDate <= day && stay.endDate > day;
}
function takenOn(room: LocalRoom, day: string) {
  if (room.status === "MAINTENANCE" || room.status === "ARCHIVED") return true;
  return room.stays.some((stay) => covers(stay, day));
}
function barTone(stay: LocalStay, today: string) {
  if (stay.checkedOut) return "border-[#e6e1e4] bg-[#f6f4f5] text-[#8a8388]";
  if (isDeparting(stay, today)) return "border-[#f3c56b] bg-[#fff8e6] text-[#8a5a00]";
  if (stay.startDate > today) return "border-[#f6c4de] bg-[#ffe8f4] text-[#b30d6e]";
  if (stay.startDate === today) return "border-[#f6c4de] bg-[#ffe8f4] text-[#b30d6e]";
  return "border-[#b9ddf5] bg-[#e7f4fc] text-[#1d6794]";
}

export function RoomCalendar({ reloadToken = 0, onVacant, onStay }: { reloadToken?: number; onVacant: (roomId: string, date: string) => void; onStay: (roomId: string, stayId: string) => void }) {
  const [span, setSpan] = useState<(typeof SPANS)[number][0]>(14);
  const [anchor, setAnchor] = useState(() => isoDate(new Date()));
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const from = anchor;
  const to = isoDate(addDays(parseDate(anchor), span));
  const days = useMemo(() => Array.from({ length: span }, (_, index) => addDays(parseDate(from), index)), [from, span]);
  const [now, setNow] = useState(() => new Date());
  const today = isoDate(now);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const { data } = await api.get<CalendarResponse>("/rooms/calendar", { params: { from, to } });
        if (!cancelled) setCalendar(data);
      } catch (cause) {
        if (!cancelled) setError(errorMessage(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [from, to, reloadToken]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const rooms = calendar?.rooms ?? [];

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
    {loading && !calendar ? <div className="h-64 animate-pulse bg-[#fffafc]" /> : <div className="overflow-x-auto">
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
        <div className="flex border-b border-[#f7eef2] bg-[#fffdfd]" style={{ height: 52 }}>
          <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-[#f6e8ee] bg-white px-3 text-left" style={{ width: LABEL }}>
            <BedDouble size={15} className="shrink-0 text-[#8a8388]" />
            <span className="min-w-0"><span className="block truncate text-[12px] font-extrabold leading-4 text-ink">All rooms</span><span className="block truncate text-[9px] leading-3 text-muted">{rooms.length} rooms · free and booked %</span></span>
          </div>
          {days.map((day) => {
            const key = isoDate(day);
            const taken = rooms.filter((room) => takenOn(room, key)).length;
            const free = Math.max(0, rooms.length - taken);
            const booked = rooms.length ? Math.round((taken / rooms.length) * 100) : 0;
            return <div key={key} className={`flex shrink-0 flex-col items-center justify-center leading-none ${key === today ? "border-l-2 border-[#ed168c] bg-[#fff7fb]" : ""}`} style={{ width: DAY }}>
              <p className="text-[11px] font-extrabold text-ink">{free} free</p>
              <p className="mt-1 text-[9px] font-semibold text-muted">{booked}%</p>
            </div>;
          })}
        </div>
        {rooms.map((room) => <RoomRow key={room.id} room={room} from={from} span={span} today={today} now={now} onVacant={onVacant} onStay={onStay} />)}
        {!rooms.length && !loading && <p className="px-4 py-10 text-center text-sm text-muted">No rooms yet.</p>}
      </div>
    </div>}
    <footer className="flex flex-wrap gap-4 border-t border-[#f6e8ee] px-4 py-2.5 text-[10px] font-semibold text-muted">
      <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#ffe8f4] ring-1 ring-[#f6c4de]" /> Arriving</span>
      <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#e7f4fc] ring-1 ring-[#b9ddf5]" /> In house</span>
      <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#fff8e6] ring-1 ring-[#f3c56b]" /> Departing</span>
      <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#fff1e6] ring-1 ring-[#f6d2b4]" /> Under maintenance</span>
      <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#f6f4f5] ring-1 ring-[#e6e1e4]" /> Checked out</span>
    </footer>
  </section>;
}

function RoomRow({ room, from, span, today, now, onVacant, onStay }: { room: LocalRoom; from: string; span: number; today: string; now: Date; onVacant: (roomId: string, date: string) => void; onStay: (roomId: string, stayId: string) => void }) {
  const openStay = room.stays.find((stay) => !stay.checkedOut);
  const openRoom = () => {
    if (room.status === "AVAILABLE") onVacant(room.id, today);
    else if (openStay) onStay(room.id, openStay.id);
  };
  return <div className="relative flex border-b border-[#f7eef2]" style={{ height: 58 }}>
    <button type="button" onClick={openRoom} className="sticky left-0 z-10 flex shrink-0 items-center border-r border-[#f6e8ee] bg-white px-3 text-left text-[12px] font-bold hover:bg-[#fff7fb]" style={{ width: LABEL }}><span className="truncate">{roomLabel(room.roomNumber)}</span></button>
    <div className="relative" style={{ width: span * DAY }}>
      {Array.from({ length: span }, (_, index) => {
        const key = isoDate(addDays(parseDate(from), index));
        return <span key={key} className={`absolute inset-y-0 border-r border-[#f8eef3] ${key === today ? "bg-[#fff7fb]" : ""}`} style={{ left: index * DAY, width: DAY }} />;
      })}
      {room.status === "AVAILABLE" && Array.from({ length: span }, (_, index) => {
        const key = isoDate(addDays(parseDate(from), index));
        return <button key={key} type="button" aria-label={`Check in ${roomLabel(room.roomNumber)} on ${key}`} onClick={() => onVacant(room.id, key)} className="absolute inset-y-0 z-[1]" style={{ left: index * DAY, width: DAY }} />;
      })}
      {(room.status === "MAINTENANCE" || room.status === "ARCHIVED") && <div className={`absolute top-[8px] h-10 overflow-hidden rounded-md border px-2 leading-tight ${room.status === "MAINTENANCE" ? "border-[#f6d2b4] bg-[#fff1e6] text-[#a85b1c]" : "border-[#e6e1e4] bg-[#f6f4f5] text-[#8a8388]"}`} style={{ left: 3, width: span * DAY - 6 }}>
        <span className="block truncate text-[11px] font-extrabold">{room.status === "MAINTENANCE" ? "Under maintenance" : "Archived"}</span>
        <span className="block truncate text-[9px] font-semibold opacity-80">{roomLabel(room.roomNumber)}</span>
      </div>}
      {room.status !== "MAINTENANCE" && room.status !== "ARCHIVED" && room.stays.map((stay) => {
        const start = Math.max(0, dayIndex(stay.startDate, from));
        const leaveDay = stay.leaveDate || stay.endDate;
        const end = Math.min(span, dayIndex(leaveDay, from) + (stay.leaveDate ? 1 : 0));
        if (end <= start) return null;
        const caption = stayCaption(stay, dayIndex(stay.startDate, from) >= 0, dayIndex(leaveDay, from) < span, today, now);
        return <button key={stay.id} type="button" onClick={() => onStay(room.id, stay.id)} className={`absolute top-[8px] z-[2] h-10 overflow-hidden rounded-md border px-2 text-left leading-tight ${barTone(stay, today)}`} style={{ left: start * DAY + 3, width: (end - start) * DAY - 6 }}>
          <span className="block truncate text-[11px] font-extrabold">{stay.guestName}</span>
          <span className="block truncate text-[9px] font-semibold opacity-80">{caption}</span>
        </button>;
      })}
    </div>
  </div>;
}
