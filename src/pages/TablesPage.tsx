import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Armchair, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Move, Pencil, Plus, RefreshCw, Trash2, Users, Utensils, X, ZoomIn, ZoomOut } from "lucide-react";
import { Field, Modal, PageHeader } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import type { DiningTable, FloorSection, TableShape, TableStatus } from "../lib/types";
import { useAuthStore } from "../stores/authStore";
import { useOrderStore } from "../stores/orderStore";
import { useUiStore } from "../stores/uiStore";
import { translateUiText } from "../lib/translations";

const GRID_COLUMNS = 12;
const ROW_HEIGHT = 72;
const GRID_GAP = 12;
const shapeLabels: Record<TableShape, string> = { ROUND: "Round", SQUARE: "Square", RECTANGLE: "Rectangle", OVAL: "Oval", BOOTH: "Booth", BAR: "Bar" };
const statuses: TableStatus[] = ["AVAILABLE", "OCCUPIED", "RESERVED"];
const moveActions = [
  { name: "left", Icon: ArrowLeft, dx: -2, dy: 0 },
  { name: "right", Icon: ArrowRight, dx: 2, dy: 0 },
  { name: "up", Icon: ArrowUp, dx: 0, dy: -2 },
  { name: "down", Icon: ArrowDown, dx: 0, dy: 2 },
];
function TableShapeSurface({ shape }: { shape: TableShape }) {
  if (shape === "BOOTH") return <div className="pointer-events-none absolute inset-x-[18%] bottom-1 h-2 rounded-full bg-[#f3d8e6]" />;
  if (shape === "BAR") return <div className="pointer-events-none absolute inset-x-3 top-0 h-2 rounded-t-full bg-[#edc6da]" />;
  return null;
}

function SectionFloorPreview({ name, tables }: { name: string; tables: DiningTable[] }) {
  const rows = Math.max(6, ...tables.map((table) => table.positionY + table.height + 1));
  return <div className="pointer-events-none absolute inset-y-0 w-full overflow-hidden bg-[#fff8fc]">
    <div className="pointer-events-none absolute inset-0 opacity-70" style={{ backgroundImage: "linear-gradient(#f7e8ef 1px, transparent 1px), linear-gradient(90deg, #f7e8ef 1px, transparent 1px)", backgroundSize: "74px 74px" }} />
    <p className="relative px-5 pt-4 text-xs font-bold text-[#8c7c85]">{name}</p>
    {tables.length ? <div className="relative grid gap-3 p-5" style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, ${ROW_HEIGHT}px)` }}>
      {tables.map((table) => {
        const shapeClass = table.shape === "ROUND" ? "rounded-full" : table.shape === "OVAL" ? "rounded-[999px]" : table.shape === "SQUARE" ? "rounded-[27px]" : "rounded-2xl";
        return <div key={table.id} className={`flex min-w-0 flex-col justify-between border border-[#f0d5e3] bg-white p-3 shadow-sm ${shapeClass}`} style={{ gridColumn: `${table.positionX + 1} / span ${table.width}`, gridRow: `${table.positionY + 1} / span ${table.height}` }}>
          <span className="text-[10px] font-bold uppercase text-[#d80c7c]">{shapeLabels[table.shape]}</span>
          <span className="truncate font-display text-sm font-extrabold text-ink">{table.tableNumber}</span>
        </div>;
      })}
    </div> : <p className="relative px-5 pt-6 text-sm text-[#8c7c85]">No tables in this section yet.</p>}
  </div>;
}

function SectionCreatePeek({ pull }: { pull: number }) {
  const progress = Math.min(1, Math.max(0, -pull / 120));
  return <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-0 flex w-40 items-center justify-center bg-[#ffe4f2] sm:w-52">
    <div className="flex flex-col items-center gap-2 text-[#d80c7c]" style={{ opacity: 0.4 + progress * 0.6, transform: `scale(${0.88 + progress * 0.12})` }}>
      <span className="grid h-11 w-11 place-items-center rounded-full bg-white shadow-sm"><Plus size={18} /></span>
      <span className="text-[11px] font-bold">{progress > 0.72 ? "Release to add" : "New section"}</span>
    </div>
  </div>;
}

function TableStatusButton({ status, label, onClick, disabled = false }: { status: TableStatus; label: string; onClick: () => void; disabled?: boolean }) {
  const tone = status === "AVAILABLE"
    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
    : status === "OCCUPIED"
      ? "bg-rose-50 text-rose-700 hover:bg-rose-100"
      : "bg-amber-50 text-amber-700 hover:bg-amber-100";
  const dot = status === "AVAILABLE" ? "bg-emerald-500" : status === "OCCUPIED" ? "bg-rose-500" : "bg-amber-500";
  return <button
    type="button"
    onClick={(event) => { event.stopPropagation(); onClick(); }}
    disabled={disabled}
    title={disabled ? label : `${label} · tap to change`}
    aria-label={disabled ? label : `${label} · tap to change status`}
    className={`pointer-events-auto inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[9px] font-extrabold uppercase tracking-wide transition-colors disabled:cursor-default ${tone}`}
  >
    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
    <span className="truncate">{label}</span>
  </button>;
}

export function TablesPage() {
  const navigate = useNavigate();
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [sections, setSections] = useState<FloorSection[]>([]);
  const [activeSectionId, setActiveSectionId] = useState("");
  const [sectionModal, setSectionModal] = useState(false);
  const [sectionName, setSectionName] = useState("");
  const [draft, setDraft] = useState<DiningTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [modal, setModal] = useState(false);
  const [editingTable, setEditingTable] = useState<DiningTable | null>(null);
  const [number, setNumber] = useState("");
  const [capacity, setCapacity] = useState("2");
  const [newShape, setNewShape] = useState<TableShape>("ROUND");
  const [draggedId, setDraggedId] = useState("");
  const [mobileZoom, setMobileZoom] = useState(0.55);
  const floorRef = useRef<HTMLDivElement>(null);
  const mobileViewportRef = useRef<HTMLDivElement>(null);
  const mapScrollRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const interactionRef = useRef<{ id: string; mode: "move" | "resize"; x: number; y: number; positionX: number; positionY: number; width: number; height: number; cellWidth: number; cellHeight: number; scale: number } | null>(null);
  const sectionSwipeRef = useRef<{ pointerId: number; x: number; y: number; locked: boolean } | null>(null);
  const [sectionPull, setSectionPull] = useState(0);
  const [sectionGrabbing, setSectionGrabbing] = useState(false);
  const [sectionGlide, setSectionGlide] = useState(true);
  const suppressTableClick = useRef(false);
  const [error, setError] = useState("");
  const admin = useAuthStore((state) => state.user?.role === "ADMIN");
  const orders = useOrderStore((state) => state.orders);
  const fetchOrders = useOrderStore((state) => state.fetchOrders);
  const notify = useUiStore((state) => state.notify);
  const language = useUiStore((state) => state.language);
  const t = (text: string) => translateUiText(language, text);

  useEffect(() => {
    const viewport = mobileViewportRef.current;
    if (!viewport) return;
    const distance = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    const start = (event: TouchEvent) => { if (event.touches.length === 2) pinchRef.current = { distance: distance(event.touches), zoom: mobileZoom }; };
    const move = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !pinchRef.current) return;
      event.preventDefault();
      const ratio = distance(event.touches) / pinchRef.current.distance;
      setMobileZoom(Math.max(0.35, Math.min(1.5, pinchRef.current.zoom * ratio)));
    };
    const end = (event: TouchEvent) => { if (event.touches.length < 2) pinchRef.current = null; };
    viewport.addEventListener("touchstart", start, { passive: true });
    viewport.addEventListener("touchmove", move, { passive: false });
    viewport.addEventListener("touchend", end, { passive: true });
    viewport.addEventListener("touchcancel", end, { passive: true });
    return () => {
      viewport.removeEventListener("touchstart", start);
      viewport.removeEventListener("touchmove", move);
      viewport.removeEventListener("touchend", end);
      viewport.removeEventListener("touchcancel", end);
    };
  }, [mobileZoom]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data }, { data: floorSections }] = await Promise.all([
        api.get<DiningTable[]>("/tables"),
        api.get<FloorSection[]>("/tables/sections"),
      ]);
      setTables(data);
      setSections(floorSections);
      setActiveSectionId((current) => floorSections.some((section) => section.id === current) ? current : floorSections[0]?.id ?? "");
      setError("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void fetchOrders().catch(() => undefined);
  }, [load, fetchOrders]);

  const displayTables = useMemo(() => editing ? draft : tables, [editing, draft, tables]);
  const visibleTables = useMemo(() => displayTables.filter((table) => !activeSectionId || table.sectionId === activeSectionId), [displayTables, activeSectionId]);
  const sectionIndex = sections.findIndex((section) => section.id === activeSectionId);
  const previousSection = sectionIndex > 0 ? sections[sectionIndex - 1] : null;
  const nextSection = sectionIndex >= 0 && sectionIndex < sections.length - 1 ? sections[sectionIndex + 1] : null;
  const activeOrdersForTable = (tableId: string) => orders.filter((order) => order.tableId === tableId && ["PENDING", "PREPARING", "READY", "SERVED"].includes(order.status));
  const tableBills = (tableId: string) => activeOrdersForTable(tableId).length;
  const tableOrderSummary = (tableId: string) => {
    const activeOrders = activeOrdersForTable(tableId);
    const table = tables.find((item) => item.id === tableId);
    const itemCounts = new Map<string, number>();
    for (const order of activeOrders) {
      for (const item of order.items) itemCounts.set(item.menuItem.name, (itemCounts.get(item.menuItem.name) ?? 0) + item.quantity);
    }
    return {
      items: [...itemCounts].map(([name, quantity]) => `${quantity}× ${name}`),
      rooms: [...new Set([
        ...(activeOrders.flatMap((order) => order.roomStay?.room ? [String(order.roomStay.room.roomNumber)] : [])),
        ...(table?.assignedRoomStays?.flatMap((stay) => stay.room ? [String(stay.room.roomNumber)] : []) ?? []),
      ])],
    };
  };
  const tableSurface = (status: TableStatus) => status === "AVAILABLE"
    ? "border-emerald-200 bg-white"
    : status === "OCCUPIED"
      ? "border-rose-200 bg-white"
      : "border-amber-200 bg-white";
  const tableStatus = (table: DiningTable): TableStatus => tableBills(table.id) > 0 ? "OCCUPIED" : table.status;
  const counts = {
    AVAILABLE: tables.filter((table) => tableStatus(table) === "AVAILABLE").length,
    OCCUPIED: tables.filter((table) => tableStatus(table) === "OCCUPIED").length,
    RESERVED: tables.filter((table) => tableStatus(table) === "RESERVED").length,
  };
  const rowCount = Math.max(8, ...visibleTables.map((table) => table.positionY + table.height + 2));
  const openSectionModal = () => { setSectionName(""); setSectionModal(true); };
  const showSection = (direction: 1 | -1) => {
    const index = sections.findIndex((section) => section.id === activeSectionId);
    const next = sections[index + direction];
    if (next) setActiveSectionId(next.id);
    else if (direction > 0 && editing) openSectionModal();
  };
  const sectionPullStyle = { transform: `translate3d(${sectionPull}px, 0, 0) scale(${sectionGrabbing ? 0.985 : 1})`, transition: sectionGrabbing || !sectionGlide ? "none" : "transform 460ms cubic-bezier(.22, 1.2, .36, 1)", transformOrigin: "center center" };
  const beginSectionSwipe = (event: PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button,select,input,textarea")) return;
    if (editing && (event.target as HTMLElement).closest("article")) return;
    if (!editing && sections.length < 2) return;
    sectionSwipeRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, locked: false };
  };
  const moveSectionSwipe = (event: PointerEvent<HTMLElement>) => {
    const start = sectionSwipeRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.locked) {
      if (Math.hypot(dx, dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) { sectionSwipeRef.current = null; return; }
      start.locked = true;
      setSectionGrabbing(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const index = sections.findIndex((section) => section.id === activeSectionId);
    const atStart = index <= 0;
    const atEnd = index < 0 || index >= sections.length - 1;
    const width = event.currentTarget.clientWidth || 1;
    let pull = dx;
    if (pull > 0) pull = atStart ? pull * 0.28 : Math.min(pull, width);
    else pull = atEnd ? (editing ? Math.max(pull * 0.72, -168) : pull * 0.28) : Math.max(pull, -width);
    setSectionPull(pull);
  };
  const endSectionSwipe = (event: PointerEvent<HTMLElement>) => {
    const start = sectionSwipeRef.current;
    sectionSwipeRef.current = null;
    setSectionGrabbing(false);
    if (!start || start.pointerId !== event.pointerId || !start.locked) { setSectionPull(0); return; }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const width = event.currentTarget.clientWidth || 320;
    if (Math.abs(dx) < Math.min(160, width * 0.18) || Math.abs(dx) < Math.abs(dy)) { setSectionPull(0); return; }
    suppressTableClick.current = true;
    window.setTimeout(() => { suppressTableClick.current = false; }, 0);
    setSectionGlide(false);
    setSectionPull(0);
    showSection(dx < 0 ? 1 : -1);
    requestAnimationFrame(() => setSectionGlide(true));
  };
  const cancelSectionSwipe = () => { sectionSwipeRef.current = null; setSectionGrabbing(false); setSectionPull(0); };
  const createSection = async (event: FormEvent) => {
    event.preventDefault();
    const name = sectionName.trim();
    if (!name) return;
    setError("");
    try {
      const { data } = await api.post<FloorSection>("/tables/sections", { name });
      setSections((current) => [...current, data].sort((a, b) => a.position - b.position));
      setActiveSectionId(data.id);
      setSectionModal(false);
      setSectionName("");
      notify(`${name} is ready for tables.`);
    } catch (cause) { setError(errorMessage(cause)); }
  };
  const startEditing = () => { setDraft(tables.map((table) => ({ ...table }))); setEditing(true); setError(""); };
  const cancelEditing = () => { setDraft([]); setEditing(false); setDraggedId(""); setError(""); };
  const saveLayout = async () => {
    setError("");
    try {
      const { data } = await api.patch<DiningTable[]>("/tables/layout", { tables: draft.map(({ id, positionX, positionY, width, height, shape }) => ({ id, positionX, positionY, width, height, shape })) });
      setTables(data);
      setDraft([]);
      setEditing(false);
      notify("Floor layout saved.");
    } catch (cause) { setError(errorMessage(cause)); }
  };

  const updateStatus = async (table: DiningTable) => {
    if (tableBills(table.id) > 0) {
      setTables((current) => current.map((item) => item.id === table.id ? { ...item, status: "OCCUPIED" } : item));
      return;
    }
    const currentStatus = table.status;
    const nextStatus = statuses[(statuses.indexOf(currentStatus) + 1) % statuses.length];
    try {
      const { data } = await api.patch<DiningTable>(`/tables/${table.id}/status`, { status: nextStatus });
      setTables((current) => current.map((item) => item.id === table.id ? data : item));
      notify(`${table.tableNumber} is ${nextStatus.toLowerCase()}.`);
    } catch (cause) { setError(errorMessage(cause)); }
  };

  const updateShape = (id: string, shape: TableShape) => setDraft((current) => current.map((table) => table.id === id ? { ...table, shape, width: shape === "BAR" ? Math.min(GRID_COLUMNS - table.positionX, Math.max(4, table.width)) : table.width, height: table.height } : table));
  const moveTable = (id: string, dx: number, dy: number) => setDraft((current) => current.map((table) => {
    if (table.id !== id) return table;
    const positionX = Math.max(0, Math.min(GRID_COLUMNS - table.width, table.positionX + dx));
    const positionY = Math.max(0, table.positionY + dy);
    return { ...table, positionX, positionY };
  }));

  const beginPointerEdit = (event: PointerEvent<HTMLElement>, table: DiningTable, mode: "move" | "resize") => {
    const floor = event.currentTarget.closest<HTMLElement>("[data-floor-grid]");
    if (!editing || !floor) return;
    event.preventDefault();
    event.stopPropagation();
    const mobile = floor.dataset.mobileFloor === "true";
    const floorWidth = mobile ? floor.offsetWidth : floor.getBoundingClientRect().width;
    const cellWidth = ((floorWidth - (mobile ? 40 : 0) - (GRID_COLUMNS - 1) * GRID_GAP) / GRID_COLUMNS) * (mobile ? mobileZoom : 1);
    interactionRef.current = { id: table.id, mode, x: event.clientX, y: event.clientY, positionX: table.positionX, positionY: table.positionY, width: table.width, height: table.height, cellWidth, cellHeight: (ROW_HEIGHT + GRID_GAP) * (mobile ? mobileZoom : 1), scale: 1 };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggedId(table.id);
  };
  const movePointerEdit = (event: PointerEvent<HTMLElement>) => {
    const action = interactionRef.current;
    if (!action) return;
    const dx = Math.round((event.clientX - action.x) / action.cellWidth) * action.scale;
    const dy = Math.round((event.clientY - action.y) / action.cellHeight) * action.scale;
    setDraft((current) => current.map((table) => {
      if (table.id !== action.id) return table;
      if (action.mode === "move") return { ...table, positionX: Math.max(0, Math.min(GRID_COLUMNS - table.width, action.positionX + dx)), positionY: Math.max(0, action.positionY + dy) };
      return { ...table, width: Math.max(1, Math.min(GRID_COLUMNS - table.positionX, action.width + dx)), height: Math.max(1, Math.min(30, action.height + dy)) };
    }));
  };
  const endPointerEdit = () => { interactionRef.current = null; setDraggedId(""); };

  const startMapPan = (event: PointerEvent<HTMLDivElement>) => {
    if (editing || event.pointerType !== "mouse" || (event.target as HTMLElement).closest("article,button,select")) return;
    panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, scrollLeft: event.currentTarget.scrollLeft, scrollTop: event.currentTarget.scrollTop };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const moveMapPan = (event: PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    event.currentTarget.scrollLeft = pan.scrollLeft - (event.clientX - pan.x);
    event.currentTarget.scrollTop = pan.scrollTop - (event.clientY - pan.y);
  };
  const stopMapPan = () => { panRef.current = null; };
  const zoomFromWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
    setMobileZoom((zoom) => Math.max(0.35, Math.min(1.5, Math.round(zoom * factor * 100) / 100)));
  };

  const openTable = (tableId: string) => { if (!editing && !suppressTableClick.current) navigate(`/tables/${tableId}`); };
  const openTableKey = (event: KeyboardEvent<HTMLElement>, tableId: string) => {
    if (!editing && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openTable(tableId); }
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const tableLabel = number.trim();
      if (!tableLabel) throw new Error('Enter a table name or number.');
      if (tableLabel.length > 40) throw new Error('Table labels can be up to 40 characters.');
      if (/[\u0000-\u001f\u007f]/u.test(tableLabel)) throw new Error('Table labels cannot contain control characters.');
      const payload: { tableNumber: string; capacity: number; shape: TableShape; positionX?: number; positionY?: number } = { tableNumber: tableLabel, capacity: Number(capacity), shape: newShape };
      if (editingTable) {
        const { data } = await api.patch<DiningTable>(`/tables/${editingTable.id}`, payload);
        setTables((current) => current.map((table) => table.id === data.id ? { ...table, ...data } : table));
        setDraft((current) => current.map((table) => table.id === data.id ? { ...table, ...data, positionX: table.positionX, positionY: table.positionY, width: table.width, height: table.height } : table));
        notify("Table updated.");
      } else {
        if (editing) {
          const width = newShape === "BAR" ? 4 : 2;
          const height = 2;
          const occupied = new Set<string>();
          for (const table of draft.filter((item) => item.sectionId === activeSectionId)) {
            for (let x = table.positionX; x < table.positionX + table.width; x += 1) {
              for (let y = table.positionY; y < table.positionY + table.height; y += 1) {
                occupied.add(`${x}:${y}`);
              }
            }
          }
          let freePosition: { x: number; y: number } | undefined;
          for (let y = 0; freePosition === undefined && y < rowCount + 100; y += 1) {
            for (let x = 0; x <= 7; x += 1) {
              const fits = Array.from({ length: width }, (_, offsetX) =>
                Array.from({ length: height }, (_, offsetY) => !occupied.has(`${x + offsetX}:${y + offsetY}`)),
              ).flat().every(Boolean);
              if (fits) {
                freePosition = { x, y };
                break;
              }
            }
          }
          if (!freePosition) throw new Error("No open floor space remains for another table.");
          payload.positionX = freePosition.x;
          payload.positionY = freePosition.y;
        }
        const { data } = await api.post<DiningTable>("/tables", { ...payload, status: "AVAILABLE", ...(activeSectionId ? { sectionId: activeSectionId } : {}) });
        setTables((current) => [...current, data]);
        setDraft((current) => editing ? [...current, data] : current);
        notify("Table added to the floor.");
      }
      setModal(false);
      setEditingTable(null);
      setNumber("");
      setCapacity("2");
      setNewShape("ROUND");
      if (editing) setLoading(false);
      else await load();
    } catch (cause) { setError(errorMessage(cause)); }
  };

  const openCreate = () => {
    setEditingTable(null);
    setNumber("");
    setCapacity("2");
    setNewShape("ROUND");
    setError("");
    setModal(true);
  };

  const openEdit = (table: DiningTable) => {
    setEditingTable(table);
    setNumber(String(table.tableNumber));
    setCapacity(String(table.capacity));
    setNewShape(table.shape);
    setError("");
    setModal(true);
  };

  const deleteTable = async (table: DiningTable) => {
    if (!window.confirm(`${t("Delete table")} ${table.tableNumber}? ${t("Tables with order history cannot be deleted.")}`)) return;
    setError("");
    try {
      await api.delete(`/tables/${table.id}`);
      setTables((current) => current.filter((item) => item.id !== table.id));
      setDraft((current) => current.filter((item) => item.id !== table.id));
      notify(`${t("Table")} ${table.tableNumber} ${t("deleted")}.`);
    } catch (cause) { setError(errorMessage(cause)); }
  };

  return <div className="page-enter min-h-full w-full">
    <PageHeader
      title={t("Tables")}
      description={t("Arrange your floor, check availability, and open a table to manage its orders.")}
      action={<div className="flex flex-wrap items-center gap-2">
        {admin && (editing ? <>
          <button onClick={cancelEditing} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3.5 text-xs font-bold text-ink"><X size={14} /> {t("Cancel")}</button>
          <button onClick={() => void saveLayout()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#f71591] px-4 text-xs font-bold text-white shadow-sm hover:bg-[#dc0d7e]"><Check size={14} /> {t("Save layout")}</button>
        </> : <button onClick={startEditing} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#f5c8df] bg-white px-3.5 text-xs font-bold text-[#d80c7c] hover:bg-[#fff4fa]"><Pencil size={14} /> {t("Edit layout")}</button>)}
        <button onClick={() => void load()} disabled={loading} className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white text-muted hover:text-ink" aria-label="Refresh tables"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /></button>
      </div>}
    />
    {error && <p role="alert" className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-bold text-ink">{tables.length} {t("tables")}</span>
      {statuses.map((status) => <span key={status} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-bold ${status === "AVAILABLE" ? "bg-emerald-50 text-emerald-700" : status === "OCCUPIED" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}><span className={`h-1.5 w-1.5 rounded-full ${status === "AVAILABLE" ? "bg-emerald-500" : status === "OCCUPIED" ? "bg-rose-500" : "bg-amber-500"}`} />{counts[status]} {t(status.toLowerCase())}</span>)}
      {editing && <span className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold text-[#d80c7c]"><Move size={13} /> {t("Drag tables or use the arrow controls. Choose a shape, then save.")}</span>}
    </div>

    <div ref={mobileViewportRef} onPointerDown={beginSectionSwipe} onPointerMove={moveSectionSwipe} onPointerUp={endSectionSwipe} onPointerCancel={cancelSectionSwipe} className={`relative mb-4 overflow-hidden rounded-[24px] border border-[#f1dce7] bg-[#fff8fc] shadow-card lg:hidden ${(editing || sections.length > 1) ? (sectionGrabbing ? "cursor-grabbing" : "cursor-grab") : ""}`}>
      {editing && <SectionCreatePeek pull={sectionPull} />}
      <div className="relative z-10 bg-[#fff8fc]" style={sectionPullStyle}>
      {previousSection && <div className="absolute inset-y-0 w-full" style={{ left: "-100%" }}><SectionFloorPreview name={previousSection.name} tables={displayTables.filter((table) => table.sectionId === previousSection.id)} /></div>}
      {nextSection && <div className="absolute inset-y-0 w-full" style={{ left: "100%" }}><SectionFloorPreview name={nextSection.name} tables={displayTables.filter((table) => table.sectionId === nextSection.id)} /></div>}
      {!loading && visibleTables.length > 0 && <div className="flex items-center justify-end gap-1.5 border-b border-[#f1dce7] bg-white/90 px-3 py-2">
        <span className="mr-auto text-[10px] font-semibold text-[#8c7c85]">{t("Floor plan")}</span>
        <button type="button" onClick={() => setMobileZoom((zoom) => Math.max(0.35, Math.round((zoom - 0.1) * 10) / 10))} aria-label={t("Zoom out floor plan")} className="grid h-8 w-8 place-items-center rounded-lg border border-[#f1dce7] text-[#5c4652]"><ZoomOut size={15} /></button>
        <span className="w-10 text-center text-[10px] font-bold text-[#5c4652]">{Math.round(mobileZoom * 100)}%</span>
        <button type="button" onClick={() => setMobileZoom((zoom) => Math.min(1.5, Math.round((zoom + 0.1) * 10) / 10))} aria-label={t("Zoom in floor plan")} className="grid h-8 w-8 place-items-center rounded-lg border border-[#f1dce7] text-[#5c4652]"><ZoomIn size={15} /></button>
        <button type="button" onClick={() => { setMobileZoom(0.55); if (mapScrollRef.current) { mapScrollRef.current.scrollLeft = 0; mapScrollRef.current.scrollTop = 0; } }} className="rounded-lg px-2 py-1.5 text-[10px] font-bold text-[#d80c7c]">{t("Reset")}</button>
      </div>}
      {loading ? <div className="grid grid-cols-2 gap-3 p-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl border border-[#f4e4ec] bg-white/70" />)}</div> : visibleTables.length ? <div ref={mapScrollRef} onPointerDown={startMapPan} onPointerMove={moveMapPan} onPointerUp={stopMapPan} onPointerCancel={stopMapPan} onWheel={zoomFromWheel} className="w-full overflow-auto" style={{ height: `${Math.max(300, (rowCount * 84 + 40) * mobileZoom)}px`, touchAction: editing || sections.length > 1 ? "pan-y" : "pan-x pan-y" }}><div className="relative" style={{ width: `${1100 * mobileZoom}px`, height: `${(rowCount * 84 + 40) * mobileZoom}px` }}><div data-floor-grid data-mobile-floor="true" className="absolute left-0 top-0 grid w-[1100px] gap-3 p-5" style={{ height: `${rowCount * 84 + 40}px`, gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rowCount}, ${ROW_HEIGHT}px)`, backgroundImage: "linear-gradient(#f7e8ef 1px, transparent 1px), linear-gradient(90deg, #f7e8ef 1px, transparent 1px)", backgroundSize: "74px 74px", transform: `scale(${mobileZoom})`, transformOrigin: "top left", touchAction: "pan-x pan-y" }}>
        {visibleTables.map((table) => {
          const bills = tableBills(table.id);
          const status = tableStatus(table);
          const shapeClass = table.shape === "ROUND" ? "rounded-full" : table.shape === "SQUARE" ? "rounded-[27px]" : table.shape === "OVAL" ? "rounded-[999px]" : table.shape === "BOOTH" ? "rounded-[20px]" : table.shape === "BAR" ? "rounded-xl" : "rounded-2xl";
          const statusSurface = tableSurface(status);
          const orderSummary = tableOrderSummary(table.id);
          return <article key={table.id} onPointerMove={movePointerEdit} onPointerUp={endPointerEdit} onPointerCancel={endPointerEdit} onClick={(event) => { if ((event.target as HTMLElement).closest("select,button")) return; openTable(table.id); }} aria-label={`${t(shapeLabels[table.shape])} ${t("Table")} ${table.tableNumber}, ${t(status.toLowerCase())}, ${bills} ${t("Bills")}`} className={`relative flex h-full w-full min-w-0 flex-col justify-between ${editing ? "z-20 overflow-visible" : "overflow-hidden"} border p-5 shadow-[0_5px_16px_rgba(74,35,56,.06)] ${statusSurface} ${shapeClass} ${editing ? "border-2 border-dashed border-[#fa0b91]" : "cursor-pointer"} ${draggedId === table.id ? "opacity-70" : ""}`} style={{ gridColumn: `${table.positionX + 1} / span ${table.width}`, gridRow: `${table.positionY + 1} / span ${table.height}` }}>
            {editing && <button type="button" aria-label={`Move table ${table.tableNumber}`} onPointerDown={(event) => beginPointerEdit(event, table, "move")} className="absolute inset-0 z-10 cursor-move touch-none" />}
            <div className={`relative z-20 flex min-w-0 items-center gap-1 ${table.shape === "ROUND" || table.shape === "OVAL" ? "flex-col justify-center" : "justify-between"}`}>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-line bg-white/90 text-[#e41483] shadow-sm dark:border-slate-600"><Utensils size={15} /></span>
              <TableStatusButton status={status} label={t(status.toLowerCase())} disabled={bills > 0} onClick={() => void updateStatus(table)} />
            </div>
            <div className={`pointer-events-none relative z-[5] min-w-0 ${table.shape === "ROUND" || table.shape === "OVAL" ? "w-full text-center" : ""}`}><p className="truncate text-base font-extrabold leading-5 text-ink">{table.tableNumber}</p><p className="mt-1 truncate text-xs leading-4 text-muted">{table.capacity} {t("seats")} · {bills} {t(bills === 1 ? "Bill" : "Bills")}</p>
              {orderSummary.items.length > 0 && <div className="mt-1 space-y-0.5"><p className="truncate text-[9px] font-bold text-ink">{t("Current order")}</p>{orderSummary.items.slice(0, 2).map((item) => <p key={item} className="truncate text-[9px] leading-3 text-muted">{item}</p>)}{orderSummary.items.length > 2 && <p className="truncate text-[9px] text-muted">+{orderSummary.items.length - 2} {t("more items")}</p>}</div>}
              {orderSummary.rooms.length > 0 && <p className="mt-1 truncate text-[9px] font-semibold text-[#a20b62] dark:text-pink-300">{t("Guest rooms")}: {orderSummary.rooms.join(", ")}</p>}
            </div>
            {editing && <select value={table.shape} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => updateShape(table.id, event.target.value as TableShape)} aria-label={`${t("Shape for table")} ${table.tableNumber}`} className="relative z-20 w-full rounded-md border border-[#f3d9e7] bg-white px-1 py-0.5 text-[8px] font-bold text-[#5c4652] outline-none"><option value="ROUND">{t("Round")}</option><option value="SQUARE">{t("Square")}</option><option value="RECTANGLE">{t("Rectangle")}</option><option value="OVAL">{t("Oval")}</option><option value="BOOTH">{t("Booth")}</option><option value="BAR">{t("Bar")}</option></select>}
            {editing && admin && <div className="relative z-20 flex gap-1" onPointerDown={(event) => event.stopPropagation()}><button type="button" onClick={() => openEdit(table)} className="flex flex-1 items-center justify-center gap-1 rounded-md border border-[#f3d9e7] bg-white px-1 py-1 text-[8px] font-bold text-[#d80c7c]"><Pencil size={10} /> {t("Edit")}</button><button type="button" onClick={() => void deleteTable(table)} className="flex items-center justify-center gap-1 rounded-md border border-rose-100 bg-white px-2 py-1 text-[8px] font-bold text-rose-600"><Trash2 size={10} /> {t("Delete")}</button></div>}
            {editing && <button type="button" aria-label={`Resize table ${table.tableNumber}`} onPointerDown={(event) => beginPointerEdit(event, table, "resize")} className="absolute -bottom-2 -right-2 z-30 grid h-7 w-7 cursor-nwse-resize touch-none place-items-center rounded-full border-2 border-white bg-[#f71591] text-xs leading-none text-white shadow-md">↘</button>}
          </article>;
        })}
      </div></div></div> : <div className="relative flex min-h-[calc(100vh-260px)] flex-col items-center justify-center p-6 text-center" style={{ backgroundImage: "linear-gradient(#f7e8ef 1px, transparent 1px), linear-gradient(90deg, #f7e8ef 1px, transparent 1px)", backgroundSize: "26px 26px" }}><span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#ffedf6] text-[#e91488]"><Armchair size={24} /></span><h2 className="mt-4 font-display text-lg font-extrabold text-[#30242c]">Your floor is ready for a layout</h2><p className="mt-1 max-w-sm text-sm text-[#8c7c85]">Add your first table to start arranging your restaurant floor.</p></div>}
      {admin && editing && <button onClick={openCreate} className="flex min-h-12 w-full items-center justify-center gap-2 border-t border-[#f1dce7] bg-white text-sm font-bold text-[#d80c7c]"><Plus size={18} /> {t("Add table")}</button>}
      {(editing || sections.length > 1) && <div className="flex flex-col items-center gap-2 bg-white py-3"><p className="text-[10px] font-bold text-[#8c7c85]">{sections.find((section) => section.id === activeSectionId)?.name}</p><div className="flex items-center gap-2">{sections.map((section) => <button key={section.id} type="button" aria-label={section.name} aria-current={section.id === activeSectionId} onClick={() => setActiveSectionId(section.id)} className={`h-2 w-2 rounded-full ${section.id === activeSectionId ? "bg-[#f71591]" : "border border-[#f7b5d4] bg-white"}`} />)}{editing && <button type="button" aria-label="Add a floor section" onClick={openSectionModal} className="h-2 w-2 rounded-full border border-[#f7b5d4] bg-white" />}</div></div>}
      </div>
    </div>

    <div onPointerDown={beginSectionSwipe} onPointerMove={moveSectionSwipe} onPointerUp={endSectionSwipe} onPointerCancel={cancelSectionSwipe} className={`relative hidden w-full rounded-[24px] border border-[#f1dce7] bg-[#fff8fc] shadow-card lg:block ${editing || sections.length > 1 ? "overflow-hidden" : "overflow-x-auto overscroll-x-contain"} ${(editing || sections.length > 1) ? (sectionGrabbing ? "cursor-grabbing" : "cursor-grab") : ""}`}>
      {editing && <SectionCreatePeek pull={sectionPull} />}
      <div className="relative z-10 min-h-[calc(100vh-190px)] w-full min-w-[860px] bg-[#fff8fc] p-4 sm:p-5" style={sectionPullStyle}>
        {previousSection && <div className="absolute inset-y-0 w-full" style={{ left: "-100%" }}><SectionFloorPreview name={previousSection.name} tables={displayTables.filter((table) => table.sectionId === previousSection.id)} /></div>}
        {nextSection && <div className="absolute inset-y-0 w-full" style={{ left: "100%" }}><SectionFloorPreview name={nextSection.name} tables={displayTables.filter((table) => table.sectionId === nextSection.id)} /></div>}
        <div className="pointer-events-none absolute inset-0 opacity-70" style={{ backgroundImage: "linear-gradient(#f7e8ef 1px, transparent 1px), linear-gradient(90deg, #f7e8ef 1px, transparent 1px)", backgroundSize: "74px 74px" }} />
        {loading ? <div className="relative grid grid-cols-4 gap-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl border border-[#f4e4ec] bg-white/70" />)}</div> : visibleTables.length ? <div ref={floorRef} data-floor-grid data-mobile-floor="false" className="relative grid min-h-[calc(100vh-245px)] w-full touch-pan-y grid-cols-12 auto-rows-[72px] gap-3" style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rowCount}, ${ROW_HEIGHT}px)` }}>
          {visibleTables.map((table) => {
            const bills = tableBills(table.id);
            const status = tableStatus(table);
            const shapeClass = table.shape === "ROUND" ? "rounded-full" : table.shape === "SQUARE" ? "rounded-[27px]" : table.shape === "OVAL" ? "rounded-[999px]" : table.shape === "BOOTH" ? "rounded-[20px]" : table.shape === "BAR" ? "rounded-xl" : "rounded-2xl";
            const statusSurface = tableSurface(status);
            const orderSummary = tableOrderSummary(table.id);
            return <article
              key={table.id}
              onPointerMove={movePointerEdit}
              onPointerUp={endPointerEdit}
              onPointerCancel={endPointerEdit}
              onClick={() => openTable(table.id)}
              onKeyDown={(event) => openTableKey(event, table.id)}
              role={editing ? undefined : "button"}
              tabIndex={editing ? undefined : 0}
              aria-label={`${t(shapeLabels[table.shape])} ${t("Table")} ${table.tableNumber}, ${t(status.toLowerCase())}, ${bills} ${t("Bills")}`}
              className={`group relative col-span-2 row-span-2 place-self-stretch flex h-full w-full min-w-0 flex-col justify-between ${editing ? "z-20 overflow-visible" : "overflow-hidden"} border p-3 text-left shadow-[0_5px_16px_rgba(74,35,56,.06)] transition duration-150 ${statusSurface} ${shapeClass} ${["ROUND", "OVAL"].includes(table.shape) && !editing ? "items-center text-center" : ""} ${editing ? "border-2 border-dashed border-[#fa0b91] hover:shadow-[0_8px_22px_rgba(236,17,135,.12)]" : "cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_10px_25px_rgba(74,35,56,.10)]"} ${draggedId === table.id ? "opacity-70" : ""}`}
              style={{ gridColumn: `${table.positionX + 1} / span ${table.width}`, gridRow: `${table.positionY + 1} / span ${table.height}` }}
            >
              {editing && <button type="button" aria-label={`Move table ${table.tableNumber}`} onPointerDown={(event) => beginPointerEdit(event, table, "move")} className="absolute inset-0 z-[5] cursor-move touch-none" title="Drag to move" />}
              <TableShapeSurface shape={table.shape} />
              <div className={`pointer-events-none relative z-10 flex w-full items-center justify-between gap-1 ${table.shape === "ROUND" || table.shape === "OVAL" ? "flex-col justify-center" : ""}`}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-line bg-white/90 text-[#e41483] shadow-sm dark:border-slate-600"><Utensils size={15} /></span>
                {editing
                  ? <span className="grid h-7 w-7 place-items-center rounded-full bg-white/80 text-[#d80c7c]"><Move size={13} /></span>
                  : <TableStatusButton status={status} label={t(status.toLowerCase())} disabled={bills > 0} onClick={() => void updateStatus(table)} />}
              </div>
              <div className={`pointer-events-none relative z-10 min-w-0 ${["ROUND", "OVAL"].includes(table.shape) ? "mt-1 w-full text-center" : "mt-auto"}`}>
                <p className="truncate font-display text-[15px] font-extrabold leading-5 tracking-tight text-ink">{table.tableNumber}</p>
                <p className={`mt-1 flex items-center gap-1 text-[10px] font-medium text-muted ${["ROUND", "OVAL"].includes(table.shape) ? "justify-center" : ""}`}><Users size={11} /> {table.capacity} {t("seats")} <span className="text-muted">·</span> {bills} {t(bills === 1 ? "Bill" : "Bills")}</p>
                {orderSummary.items.length > 0 && <div className="mt-1 w-full text-left"><p className="truncate text-[9px] font-bold text-ink">{t("Current order")}</p>{orderSummary.items.slice(0, 2).map((item) => <p key={item} className="truncate text-[9px] leading-3 text-muted">{item}</p>)}{orderSummary.items.length > 2 && <p className="truncate text-[9px] text-muted">+{orderSummary.items.length - 2} {t("more items")}</p>}</div>}
                {orderSummary.rooms.length > 0 && <p className="mt-1 w-full truncate text-left text-[9px] font-semibold text-[#a20b62] dark:text-pink-300">{t("Guest rooms")}: {orderSummary.rooms.join(", ")}</p>}
              </div>
              {editing && <div className="pointer-events-auto relative z-10 mt-2 flex items-center justify-between gap-1" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
                <select value={table.shape} onChange={(event) => updateShape(table.id, event.target.value as TableShape)} aria-label={`${t("Shape for table")} ${table.tableNumber}`} className="min-w-0 flex-1 rounded-lg border border-[#f3d9e7] bg-white px-2 py-1.5 text-[9px] font-bold text-[#5c4652] outline-none"><option value="ROUND">{t("Round")}</option><option value="SQUARE">{t("Square")}</option><option value="RECTANGLE">{t("Rectangle")}</option><option value="OVAL">{t("Oval")}</option><option value="BOOTH">{t("Booth")}</option><option value="BAR">{t("Bar")}</option></select>
                <div className="flex gap-0.5">{moveActions.map(({ name, Icon, dx, dy }) => <button key={name} type="button" aria-label={`${name} ${t("Table")} ${table.tableNumber}`} onClick={() => moveTable(table.id, dx, dy)} className="grid h-7 w-7 place-items-center rounded-md text-[#d80c7c] hover:bg-[#fff0f7]"><Icon size={13} /></button>)}
                  {admin && <><button type="button" aria-label={`${t("Edit")} ${t("Table")} ${table.tableNumber}`} onClick={() => openEdit(table)} className="grid h-7 w-7 place-items-center rounded-md text-[#d80c7c] hover:bg-[#fff0f7]" title={t("Edit table details")}><Pencil size={13} /></button><button type="button" aria-label={`${t("Delete")} ${t("Table")} ${table.tableNumber}`} onClick={() => void deleteTable(table)} className="grid h-7 w-7 place-items-center rounded-md text-rose-600 hover:bg-rose-50" title={t("Delete table")}><Trash2 size={13} /></button></>}</div>
              </div>}
              {editing && <button type="button" aria-label={`Resize table ${table.tableNumber}`} onPointerDown={(event) => beginPointerEdit(event, table, "resize")} className="absolute -bottom-3 -right-3 z-30 grid h-8 w-8 cursor-nwse-resize touch-none place-items-center rounded-full border-2 border-white bg-[#f71591] text-white shadow-md" title="Drag to resize"><span className="text-xs leading-none">↘</span></button>}
            </article>;
          })}
        </div> : <div className="relative flex min-h-[480px] flex-col items-center justify-center text-center"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#ffedf6] text-[#e91488]"><Armchair size={24} /></span><h2 className="mt-4 font-display text-lg font-extrabold text-[#30242c]">Your floor is ready for a layout</h2><p className="mt-1 max-w-sm text-sm text-[#8c7c85]">Add your first table to start arranging your restaurant floor.</p></div>}
        {admin && editing && <button onClick={openCreate} className="relative z-10 mx-auto mt-7 flex h-12 items-center justify-center gap-2 rounded-full bg-[#f71591] px-5 text-white shadow-[0_8px_20px_rgba(247,21,145,.24)] transition hover:scale-105 hover:bg-[#dc0d7e]" aria-label={t("Add table")}><Plus size={20} /><span className="text-xs font-bold">{t("Add table")}</span></button>}
        {(editing || sections.length > 1) && <div className="relative z-10 mt-3 flex flex-col items-center gap-2"><p className="text-[10px] font-bold text-[#8c7c85]">{sections.find((section) => section.id === activeSectionId)?.name}</p><div className="flex items-center gap-2">{sections.map((section) => <button key={section.id} type="button" aria-label={section.name} aria-current={section.id === activeSectionId} onClick={() => setActiveSectionId(section.id)} className={`h-2 w-2 rounded-full ${section.id === activeSectionId ? "bg-[#f71591]" : "border border-[#f7b5d4] bg-white"}`} />)}{editing && <button type="button" aria-label="Add a floor section" onClick={openSectionModal} className="h-2 w-2 rounded-full border border-[#f7b5d4] bg-white" />}</div></div>}
      </div>
    </div>

    {sectionModal && <Modal title="Name this section" onClose={() => setSectionModal(false)}><form onSubmit={(event) => void createSection(event)} className="space-y-4"><Field label="Section name" type="text" maxLength={40} required value={sectionName} onChange={(event) => setSectionName(event.target.value)} placeholder="Patio, Bar, Upstairs" autoComplete="off" /><button className="h-11 w-full rounded-xl bg-[#f71591] text-sm font-bold text-white hover:bg-[#dc0d7e]">Create section</button></form></Modal>}
    {modal && <Modal title={t(editingTable ? "Edit table" : "Add a table")} onClose={() => { setModal(false); setEditingTable(null); }}><form onSubmit={(event) => void create(event)} className="space-y-4">
      <Field label={t("Table name or number")} type="text" maxLength={40} required value={number} onChange={(event) => setNumber(event.target.value)} placeholder="e.g. 12, Patio A, VIP-1" autoComplete="off" />
      <Field label={t("Seat capacity")} type="number" min="1" required value={capacity} onChange={(event) => setCapacity(event.target.value)} />
      <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink">{t("Table shape")}</span><select value={newShape} onChange={(event) => setNewShape(event.target.value as TableShape)} className="focus-ring w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-ink outline-none"><option value="ROUND">{t("Round")}</option><option value="SQUARE">{t("Square")}</option><option value="RECTANGLE">{t("Rectangle")}</option><option value="OVAL">{t("Oval")}</option><option value="BOOTH">{t("Booth")}</option><option value="BAR">{t("Bar counter")}</option></select></label>
      <button className="mt-2 h-11 w-full rounded-xl bg-[#f71591] text-sm font-bold text-white hover:bg-[#dc0d7e]">{t(editingTable ? "Save changes" : "Add to floor")}</button>
    </form></Modal>}
  </div>;
}
