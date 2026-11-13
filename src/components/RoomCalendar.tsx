import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { BedDouble, ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
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
  children?: string;
  source?: string | null;
  confirmationNumber?: string | null;
  roomType?: string | null;
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
const PAST = 30;
const FUTURE = 120;
const EXTEND = 45;
const EDGE_DAYS = 12;
const LIMIT = 400;
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
  const guests = Number(stay.adults || 0) + Number(stay.children || 0);
  const parts = [
    showArrive ? relativeWhen("Arrives", stay.startDate, stay.arriveTime, today, now) : "",
    showLeave ? relativeWhen("Leaves", stay.leaveDate, stay.leaveTime, today, now) : "",
    `${guests} guest${guests === 1 ? "" : "s"}`,
    stay.roomType || "",
    stay.confirmationNumber ? `${stay.source || "Cloudbeds"} ${stay.confirmationNumber}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}
function covers(stay: LocalStay, day: string) {
  return stay.startDate <= day && stay.endDate > day;
}
function staysOverlap(left: LocalStay, right: LocalStay) {
  return left.startDate < right.endDate && right.startDate < left.endDate;
}
function roomAccepts(room: LocalRoom, stay: LocalStay) {
  if (room.id === "unassigned") return false;
  if (room.status === "MAINTENANCE" || room.status === "ARCHIVED") return false;
  return !room.stays.some((other) => other.id !== stay.id && !other.checkedOut && staysOverlap(stay, other));
}
function scrollableParent(node: HTMLElement | null) {
  let current = node?.parentElement ?? null;
  while (current) {
    const style = getComputedStyle(current);
    const scrolls = style.overflowY === "auto" || style.overflowY === "scroll";
    if (scrolls && current.scrollHeight > current.clientHeight + 1) return current;
    current = current.parentElement;
  }
  return null;
}
function roomUnderPointer(x: number, y: number) {
  for (const node of document.elementsFromPoint(x, y)) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.closest("[data-stay-menu]")) return null;
    const row = node.closest("[data-room-id]");
    if (row) return row.getAttribute("data-room-id");
  }
  return null;
}
function relocateStay(calendar: CalendarResponse, stay: LocalStay, fromRoomId: string, toRoomId: string): CalendarResponse {
  return {
    ...calendar,
    rooms: calendar.rooms.flatMap((room) => {
      if (room.id === fromRoomId) {
        const stays = room.stays.filter((item) => item.id !== stay.id);
        if (room.id === "unassigned" && !stays.length) return [];
        return [{ ...room, stays }];
      }
      if (room.id === toRoomId) return [{ ...room, stays: [...room.stays, stay].sort((left, right) => left.startDate.localeCompare(right.startDate) || left.guestName.localeCompare(right.guestName)) }];
      return [room];
    }),
  };
}
type GuestDrag = { stay: LocalStay; fromRoomId: string; x: number; y: number; overRoomId: string | null };
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
type PlacedStay = { stay: LocalStay; start: number; end: number; caption: string };

function placeStay(stay: LocalStay, from: string, span: number, today: string, now: Date): PlacedStay | null {
  const start = Math.max(0, dayIndex(stay.startDate, from));
  const leaveDay = stay.leaveDate || stay.endDate;
  const end = Math.min(span, dayIndex(leaveDay, from) + (stay.leaveDate ? 1 : 0));
  if (end <= start) return null;
  return { stay, start, end, caption: stayCaption(stay, dayIndex(stay.startDate, from) >= 0, dayIndex(leaveDay, from) < span, today, now) };
}

function sharesOnlyTurnoverDay(left: PlacedStay, right: PlacedStay) {
  const earlier = left.start <= right.start ? left : right;
  const later = earlier === left ? right : left;
  return later.start === earlier.end - 1 && later.end > earlier.end && earlier.start < later.start;
}

function stayClusters(bars: PlacedStay[], keepTurnover: boolean) {
  const parent = bars.map((_, index) => index);
  const find = (index: number): number => {
    let cursor = index;
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor]];
      cursor = parent[cursor];
    }
    return cursor;
  };
  bars.forEach((left, leftIndex) => {
    bars.forEach((right, rightIndex) => {
      if (rightIndex <= leftIndex) return;
      const overlaps = left.start < right.end && right.start < left.end;
      if (!overlaps || (keepTurnover && sharesOnlyTurnoverDay(left, right))) return;
      parent[find(leftIndex)] = find(rightIndex);
    });
  });
  const groups = new Map<number, PlacedStay[]>();
  bars.forEach((bar, index) => {
    const key = find(index);
    const group = groups.get(key);
    if (group) group.push(bar);
    else groups.set(key, [bar]);
  });
  return [...groups.values()];
}

export type CalendarStay = LocalStay;

export function RoomCalendar({ reloadToken = 0, onVacant, onStay, onUnassigned, onMove }: { reloadToken?: number; onVacant: (roomId: string, date: string) => void; onStay: (roomId: string, stayId: string) => void; onUnassigned?: (stay: CalendarStay) => void; onMove?: (stay: CalendarStay, room: { id: string; roomNumber: string }) => Promise<void> }) {
  const [page, setPage] = useState<(typeof SPANS)[number][0]>(14);
  const [from, setFrom] = useState(() => isoDate(addDays(new Date(), -PAST)));
  const [to, setTo] = useState(() => isoDate(addDays(new Date(), FUTURE)));
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [frame, setFrame] = useState({ start: PAST, count: 14 });
  const [guestQuery, setGuestQuery] = useState("");
  const [matches, setMatches] = useState<Array<{ roomId: string; roomNumber: string; stay: LocalStay }>>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const days = useMemo(() => Array.from({ length: Math.max(1, dayIndex(to, from)) }, (_, index) => addDays(parseDate(from), index)), [from, to]);
  const span = days.length;
  const [now, setNow] = useState(() => new Date());
  const today = isoDate(now);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);
  const centeredRef = useRef(false);
  const busyRef = useRef(false);
  const scrollAfterRender = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const movingRef = useRef(false);
  const dragListeners = useRef<(() => void) | null>(null);
  const [drag, setDrag] = useState<GuestDrag | null>(null);

  useEffect(() => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const { data } = await api.get<CalendarResponse>("/rooms/calendar", { params: { from, to } });
        if (requestId === requestRef.current) setCalendar(data);
      } catch (cause) {
        if (requestId === requestRef.current) setError(errorMessage(cause));
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    })();
  }, [from, to, reloadToken]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => dragListeners.current?.(), []);
  const draggingGuest = Boolean(drag);
  useEffect(() => {
    if (!draggingGuest) return;
    const previous = document.body.style.cursor;
    document.body.style.cursor = "grabbing";
    return () => { document.body.style.cursor = previous; };
  }, [draggingGuest]);

  useEffect(() => {
    const query = guestQuery.trim().toLowerCase();
    if (query.length < 2) {
      setMatches([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      const start = isoDate(addDays(parseDate(today), -LIMIT));
      const end = isoDate(addDays(parseDate(today), LIMIT));
      void api.get<CalendarResponse>("/rooms/calendar", { params: { from: start, to: end } }).then(({ data }) => {
        if (cancelled) return;
        const found = data.rooms.flatMap((room) => room.stays.filter((stay) => stay.guestName.toLowerCase().includes(query)).map((stay) => ({ roomId: room.id, roomNumber: room.roomNumber, stay })));
        found.sort((left, right) => left.stay.startDate.localeCompare(right.stay.startDate) || left.stay.guestName.localeCompare(right.stay.guestName));
        setMatches(found);
      }).catch(() => { if (!cancelled) setMatches([]); }).finally(() => { if (!cancelled) setSearching(false); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [guestQuery, today]);

  const extendPast = (extra = EXTEND) => {
    const floor = isoDate(addDays(parseDate(today), -LIMIT));
    const desired = isoDate(addDays(parseDate(from), -extra));
    const applied = desired < floor ? floor : desired;
    const added = dayIndex(from, applied);
    if (added <= 0) return 0;
    const node = scrollerRef.current;
    scrollAfterRender.current = (node?.scrollLeft ?? 0) + added * DAY;
    setFrame((current) => ({ ...current, start: current.start + added }));
    setFrom(applied);
    return added;
  };
  const extendFuture = (extra = EXTEND) => {
    const cap = isoDate(addDays(parseDate(today), LIMIT));
    const desired = isoDate(addDays(parseDate(to), extra));
    const applied = desired > cap ? cap : desired;
    if (applied <= to) return false;
    setTo(applied);
    return true;
  };
  const reveal = (direction: -1 | 1) => {
    const node = scrollerRef.current;
    if (!node) return;
    const start = Math.round(node.scrollLeft / DAY);
    let added = 0;
    let grew = false;
    if (direction < 0 && start - page < EDGE_DAYS) added = extendPast(Math.max(EXTEND, page + EDGE_DAYS));
    if (direction > 0 && start + page > span - EDGE_DAYS) grew = extendFuture(Math.max(EXTEND, page));
    const left = Math.max(0, (start + added + direction * page) * DAY);
    if (added > 0 || grew) scrollAfterRender.current = left;
    else node.scrollTo({ left, behavior: "smooth" });
  };
  const onScroll = () => {
    const node = scrollerRef.current;
    if (!node) return;
    const start = Math.max(0, Math.min(span - 1, Math.round(node.scrollLeft / DAY)));
    const count = Math.max(1, Math.floor((node.clientWidth - LABEL) / DAY));
    setFrame((current) => current.start === start && current.count === count ? current : { start, count });
    if (busyRef.current) return;
    if (node.scrollLeft < EDGE_DAYS * DAY) {
      busyRef.current = extendPast() > 0;
    } else if (node.scrollWidth - node.clientWidth - node.scrollLeft < EDGE_DAYS * DAY) {
      busyRef.current = extendFuture();
    }
  };

  useLayoutEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    if (!centeredRef.current && calendar) {
      const index = Math.max(0, dayIndex(today, from));
      node.scrollLeft = index * DAY;
      centeredRef.current = true;
      const count = Math.max(1, Math.floor((node.clientWidth - LABEL) / DAY));
      setFrame({ start: index, count });
    } else if (scrollAfterRender.current !== null) {
      node.scrollLeft = scrollAfterRender.current;
      scrollAfterRender.current = null;
    }
    busyRef.current = false;
  }, [calendar, from, to, today]);

  const showGuest = (match: { roomId: string; stay: LocalStay }) => {
    const target = match.stay.startDate;
    const leave = match.stay.leaveDate || match.stay.endDate || target;
    const nextFrom = target < from ? target : from;
    const nextTo = leave >= to ? isoDate(addDays(parseDate(leave), 7)) : to;
    const left = Math.max(0, dayIndex(target, nextFrom) * DAY);
    setSearchOpen(false);
    if (nextFrom !== from || nextTo !== to) {
      scrollAfterRender.current = left;
      if (nextFrom !== from) setFrom(nextFrom);
      if (nextTo !== to) setTo(nextTo);
    } else {
      scrollerRef.current?.scrollTo({ left, behavior: "smooth" });
    }
    window.setTimeout(() => document.querySelector(`[data-room-id="${match.roomId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
  };
  const matchIds = new Set(matches.map((match) => match.stay.id));
  const guestNeedle = guestQuery.trim().length >= 2;

  const stopDragging = () => {
    dragListeners.current?.();
    dragListeners.current = null;
  };
  const grabStay = (event: ReactPointerEvent<HTMLElement>, stay: LocalStay, fromRoomId: string) => {
    if (!onMove || stay.checkedOut || event.button !== 0 || movingRef.current) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    let active = false;
    let lastY = startY;
    const nudgeScroll = () => {
      const scroller = scrollableParent(scrollerRef.current);
      if (!scroller) return;
      const bounds = scroller.getBoundingClientRect();
      if (lastY < bounds.top + 72) scroller.scrollBy(0, -18);
      else if (lastY > bounds.bottom - 72) scroller.scrollBy(0, 18);
    };
    const edge = window.setInterval(() => { if (active) nudgeScroll(); }, 32);
    const finish = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      stopDragging();
      const overRoomId = roomUnderPointer(ev.clientX, ev.clientY);
      setDrag(null);
      if (!active) return;
      const blockClick = (click: MouseEvent) => {
        click.preventDefault();
        click.stopPropagation();
        window.removeEventListener("click", blockClick, true);
      };
      window.addEventListener("click", blockClick, true);
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
        window.removeEventListener("click", blockClick, true);
      }, 0);
      const target = calendar?.rooms.find((room) => room.id === overRoomId);
      if (!target || target.id === fromRoomId || !roomAccepts(target, stay)) return;
      void commitMove(stay, fromRoomId, target);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
      active = true;
      lastY = ev.clientY;
      ev.preventDefault();
      setDrag({ stay, fromRoomId, x: ev.clientX, y: ev.clientY, overRoomId: roomUnderPointer(ev.clientX, ev.clientY) });
      nudgeScroll();
    };
    stopDragging();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    dragListeners.current = () => {
      window.clearInterval(edge);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  };
  const commitMove = async (stay: LocalStay, fromRoomId: string, target: LocalRoom) => {
    if (!onMove || !calendar || movingRef.current) return;
    movingRef.current = true;
    const snapshot = calendar;
    setError("");
    setCalendar(relocateStay(calendar, stay, fromRoomId, target.id));
    try {
      await onMove(stay, { id: target.id, roomNumber: target.roomNumber });
    } catch (cause) {
      setCalendar(snapshot);
      setError(errorMessage(cause));
    } finally {
      movingRef.current = false;
    }
  };
  const rooms = [...(calendar?.rooms ?? [])].sort((left, right) => {
    if (left.id === "unassigned") return -1;
    if (right.id === "unassigned") return 1;
    return left.roomNumber.localeCompare(right.roomNumber, undefined, { numeric: true, sensitivity: "base" });
  });
  const dropRoom = drag ? rooms.find((room) => room.id === drag.overRoomId) : undefined;
  const dropLabel = dropRoom && drag && dropRoom.id !== drag.fromRoomId && roomAccepts(dropRoom, drag.stay) ? roomLabel(dropRoom.roomNumber) : "";

  return <section className="rounded-[22px] border border-[#f1dfe7] bg-white shadow-card">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f6e8ee] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label="Previous dates" onClick={() => reveal(-1)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-[#fff4f9]"><ChevronLeft size={16} /></button>
        <h2 className="min-w-[11rem] text-center font-display text-[15px] font-extrabold tracking-tight">{formatDay(isoDate(days[Math.min(frame.start, span - 1)] ?? parseDate(from)))} to {formatDay(isoDate(days[Math.min(span - 1, frame.start + Math.max(frame.count, 1) - 1)] ?? parseDate(from)), true)}</h2>
        <button type="button" aria-label="Next dates" onClick={() => reveal(1)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-[#fff4f9]"><ChevronRight size={16} /></button>
        <button type="button" onClick={() => scrollerRef.current?.scrollTo({ left: Math.max(0, dayIndex(today, from)) * DAY, behavior: "smooth" })} className="h-8 rounded-lg bg-[#ed168c] px-3.5 text-[12px] font-bold text-white">Today</button>
      </div>
      <div className="flex items-center gap-1">{SPANS.map(([value, label]) => <button key={value} type="button" onClick={() => setPage(value)} className={`h-8 rounded-lg px-2.5 text-[12px] font-bold ${page === value ? "text-[#ec1593]" : "text-muted hover:text-ink"}`}>{label}</button>)}</div>
      <div className="relative w-full sm:w-64">
        <label className="flex h-8 items-center gap-2 rounded-lg border border-[#f1dfe7] bg-[#fffafc] px-2.5 text-muted">
          <Search size={13} />
          <input value={guestQuery} onChange={(event) => { setGuestQuery(event.target.value); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)} onBlur={() => setSearchOpen(false)} placeholder="Search guest name" className="w-full bg-transparent text-[12px] text-ink outline-none placeholder:text-muted" />
        </label>
        {searchOpen && guestNeedle ? <div className="absolute right-0 z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[#f1dfe7] bg-white py-1 shadow-card">
          {searching ? <p className="px-3 py-2 text-[12px] text-muted">Searching…</p> : matches.length ? matches.map((match) => <button key={match.stay.id} type="button" onMouseDown={(event) => { event.preventDefault(); showGuest(match); }} className="block w-full px-3 py-2 text-left hover:bg-[#fff4f9]">
            <span className="block truncate text-[12px] font-bold text-ink">{match.stay.guestName}</span>
            <span className="block truncate text-[10px] text-muted">{roomLabel(match.roomNumber)} · {formatDay(match.stay.startDate)} – {formatDay(match.stay.leaveDate || match.stay.endDate)}</span>
          </button>) : <p className="px-3 py-2 text-[12px] text-muted">No guest found.</p>}
        </div> : null}
      </div>
    </header>
    {error && <p role="alert" className="m-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    {loading && !calendar ? <div className="h-64 animate-pulse bg-[#fffafc]" /> : <div ref={scrollerRef} onScroll={onScroll} className="overflow-x-auto overscroll-x-contain">
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
        {rooms.map((room) => <RoomRow key={room.id} room={room} from={from} span={span} today={today} now={now} matchIds={guestNeedle ? matchIds : null} drag={drag} onVacant={onVacant} onStay={onStay} onUnassigned={onUnassigned} onGrab={onMove ? (event, stay) => grabStay(event, stay, room.id) : undefined} clickBlocked={() => suppressClickRef.current} />)}
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
    {drag && createPortal(<div className={`pointer-events-none fixed z-[90] h-10 w-44 overflow-hidden rounded-md border px-2 leading-tight shadow-card ${barTone(drag.stay, today)}`} style={{ left: Math.min(drag.x + 14, window.innerWidth - 188), top: Math.min(drag.y + 14, window.innerHeight - 52) }}>
      <span className="block truncate text-[11px] font-extrabold">{drag.stay.guestName}</span>
      <span className="block truncate text-[9px] font-semibold opacity-80">{dropLabel || "Drop on a room"}</span>
    </div>, document.body)}
  </section>;
}

function RoomRow({ room, from, span, today, now, matchIds, drag, onVacant, onStay, onUnassigned, onGrab, clickBlocked }: { room: LocalRoom; from: string; span: number; today: string; now: Date; matchIds: Set<string> | null; drag: GuestDrag | null; onVacant: (roomId: string, date: string) => void; onStay: (roomId: string, stayId: string) => void; onUnassigned?: (stay: LocalStay) => void; onGrab?: (event: ReactPointerEvent<HTMLElement>, stay: LocalStay) => void; clickBlocked: () => boolean }) {
  const synthetic = room.id === "unassigned";
  const openStay = room.stays.find((stay) => !stay.checkedOut);
  const openRoom = () => {
    if (room.status === "AVAILABLE") onVacant(room.id, today);
    else if (openStay) onStay(room.id, openStay.id);
  };
  const openBar = (stay: LocalStay) => {
    if (clickBlocked()) return;
    if (synthetic && onUnassigned) onUnassigned(stay);
    else onStay(room.id, stay.id);
  };
  const dropHere = Boolean(drag && drag.fromRoomId !== room.id && drag.overRoomId === room.id && roomAccepts(room, drag.stay));
  return <div data-room-id={room.id} className={`relative flex border-b border-[#f7eef2] ${dropHere ? "z-[4] outline outline-2 -outline-offset-2 outline-[#ed168c]" : ""}`} style={{ height: 58 }}>
    <button type="button" onClick={openRoom} className={`sticky left-0 z-10 flex shrink-0 items-center border-r border-[#f6e8ee] px-3 text-left text-[12px] font-bold hover:bg-[#fff7fb] ${dropHere ? "bg-[#fff0f7]" : "bg-white"}`} style={{ width: LABEL }}><span className="truncate">{roomLabel(room.roomNumber)}</span></button>
    <div className="relative" style={{ width: span * DAY }}>
      {Array.from({ length: span }, (_, index) => {
        const key = isoDate(addDays(parseDate(from), index));
        return <span key={key} className={`absolute inset-y-0 border-r border-[#f8eef3] ${key === today ? "bg-[#fff7fb]" : ""}`} style={{ left: index * DAY, width: DAY }} />;
      })}
      {room.status === "AVAILABLE" && !synthetic && Array.from({ length: span }, (_, index) => {
        const key = isoDate(addDays(parseDate(from), index));
        return <button key={key} type="button" aria-label={`Check in ${roomLabel(room.roomNumber)} on ${key}`} onClick={() => onVacant(room.id, key)} className="absolute inset-y-0 z-[1]" style={{ left: index * DAY, width: DAY }} />;
      })}
      {(room.status === "MAINTENANCE" || room.status === "ARCHIVED") && <div className={`absolute top-[8px] h-10 overflow-hidden rounded-md border px-2 leading-tight ${room.status === "MAINTENANCE" ? "border-[#f6d2b4] bg-[#fff1e6] text-[#a85b1c]" : "border-[#e6e1e4] bg-[#f6f4f5] text-[#8a8388]"}`} style={{ left: 3, width: span * DAY - 6 }}>
        <span className="block truncate text-[11px] font-extrabold">{room.status === "MAINTENANCE" ? "Under maintenance" : "Archived"}</span>
        <span className="block truncate text-[9px] font-semibold opacity-80">{roomLabel(room.roomNumber)}</span>
      </div>}
      {room.status !== "MAINTENANCE" && room.status !== "ARCHIVED" && stayClusters(room.stays.map((stay) => placeStay(stay, from, span, today, now)).filter((bar): bar is PlacedStay => Boolean(bar)), !synthetic).map((group) => {
        if (group.length === 1) {
          const bar = group[0];
          const matched = matchIds?.has(bar.stay.id) ?? false;
          const grabbable = Boolean(onGrab && !bar.stay.checkedOut);
          return <button key={bar.stay.id} type="button" aria-label={synthetic ? `Assign ${bar.stay.guestName} to a room` : bar.stay.guestName} title={grabbable ? "Drag to another room" : undefined} onPointerDown={(event) => onGrab?.(event, bar.stay)} onClick={() => openBar(bar.stay)} className={`absolute top-[8px] z-[2] h-10 overflow-hidden rounded-md border px-2 text-left leading-tight ${barTone(bar.stay, today)} ${matched ? "ring-2 ring-[#ed168c]" : ""} ${matchIds && !matched ? "opacity-35" : ""} ${grabbable ? "cursor-grab touch-none active:cursor-grabbing" : ""} ${drag?.stay.id === bar.stay.id ? "opacity-40" : ""}`} style={{ left: bar.start * DAY + 3, width: (bar.end - bar.start) * DAY - 6 }}>
            <span className="block truncate text-[11px] font-extrabold">{bar.stay.guestName}</span>
            <span className="block truncate text-[9px] font-semibold opacity-80">{bar.caption}</span>
          </button>;
        }
        return <OverlapMenu key={group.map((bar) => bar.stay.id).join(":")} bars={group} faded={Boolean(matchIds && group.every((bar) => !matchIds.has(bar.stay.id)))} highlighted={Boolean(matchIds && group.some((bar) => matchIds.has(bar.stay.id)))} onOpen={openBar} onGrab={onGrab} dragging={Boolean(drag)} />;
      })}
    </div>
  </div>;
}

function OverlapMenu({ bars, faded, highlighted, onOpen, onGrab, dragging }: { bars: PlacedStay[]; faded: boolean; highlighted: boolean; onOpen: (stay: LocalStay) => void; onGrab?: (event: ReactPointerEvent<HTMLElement>, stay: LocalStay) => void; dragging: boolean }) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState({ top: 0, left: 0, width: 240 });
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(false);
  const timerRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0 });
  const ordered = [...bars].sort((left, right) => left.start - right.start || left.stay.guestName.localeCompare(right.stay.guestName));
  const start = Math.min(...ordered.map((bar) => bar.start));
  const end = Math.max(...ordered.map((bar) => bar.end));
  const names = ordered.map((bar) => bar.stay.guestName);

  const place = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 280;
    const height = Math.min(256, bars.length * 52 + 8);
    const left = Math.min(Math.max(8, pointerRef.current.x - 16), window.innerWidth - width - 8);
    const below = rect.bottom + 6;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : below;
    setBox({ top, left, width });
  };
  const pointAt = (event: { clientX: number; clientY: number }) => {
    pointerRef.current = { x: event.clientX, y: event.clientY };
  };
  const show = () => {
    window.clearTimeout(timerRef.current);
    place();
    setOpen(true);
  };
  const hide = () => {
    if (pinnedRef.current) return;
    timerRef.current = window.setTimeout(() => setOpen(false), 160);
  };

  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  useEffect(() => { if (dragging) { pinnedRef.current = false; setOpen(false); } }, [dragging]);
  useEffect(() => {
    if (!open) return;
    const move = () => place();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      pinnedRef.current = false;
      setOpen(false);
    };
    window.addEventListener("scroll", move, true);
    window.addEventListener("resize", move);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("scroll", move, true);
      window.removeEventListener("resize", move);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open, bars.length]);

  return <>
    <button ref={anchorRef} type="button" aria-expanded={open} aria-label={`${bars.length} overlapping guests`} onMouseEnter={(event) => { pointAt(event); show(); }} onMouseLeave={hide} onClick={(event) => { pointAt(event); pinnedRef.current = true; show(); }} className={`absolute top-[8px] z-[3] h-10 overflow-hidden rounded-md border border-[#ed168c] bg-white px-2 text-left leading-tight text-[#9d135f] ${highlighted ? "ring-2 ring-[#ed168c]" : ""} ${faded ? "opacity-35" : ""}`} style={{ left: start * DAY + 3, width: (end - start) * DAY - 6 }}>
      <span className="flex items-center gap-1 text-[11px] font-extrabold"><ChevronDown size={12} className={`shrink-0 transition ${open ? "rotate-180" : ""}`} /><span className="truncate">{bars.length} overlapping</span></span>
      <span className="block truncate text-[9px] font-semibold opacity-80">{names.join(", ")}</span>
    </button>
    {open && createPortal(<div ref={menuRef} data-stay-menu onMouseEnter={show} onMouseLeave={hide} className="fixed z-[80] max-h-64 overflow-y-auto rounded-xl border border-[#f1dfe7] bg-white py-1 shadow-card" style={{ top: box.top, left: box.left, width: box.width }}>
      {ordered.map((bar) => <button key={bar.stay.id} type="button" title={onGrab && !bar.stay.checkedOut ? "Drag to another room" : undefined} onPointerDown={(event) => onGrab?.(event, bar.stay)} onClick={() => { pinnedRef.current = false; setOpen(false); onOpen(bar.stay); }} className={`block w-full px-3 py-2 text-left hover:bg-[#fff4f9] ${onGrab && !bar.stay.checkedOut ? "cursor-grab touch-none" : ""}`}>
        <span className="block truncate text-[12px] font-bold text-ink">{bar.stay.guestName}</span>
        <span className="block truncate text-[10px] text-muted">{formatDay(bar.stay.startDate)} – {formatDay(bar.stay.leaveDate || bar.stay.endDate)} · {bar.caption}</span>
      </button>)}
    </div>, document.body)}
  </>;
}
