import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Armchair, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Move, Pencil, Plus, RefreshCw, Trash2, Users, Utensils, X, ZoomIn, ZoomOut } from "lucide-react";
import { Field, Modal, PageHeader } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import type { DiningTable, TableShape, TableStatus } from "../lib/types";
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

export function TablesPage() {
  const navigate = useNavigate();
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [draft, setDraft] = useState<DiningTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [modal, setModal] = useState(false);
  const [editingTable, setEditingTable] = useState<DiningTable | null>(null);
  const [number, setNumber] = useState("");
  const [capacity, setCapacity] = useState("2");
  const [newShape, setNewShape] = useState<TableShape>("ROUND");
  const [newStatus, setNewStatus] = useState<TableStatus>("AVAILABLE");
  const [draggedId, setDraggedId] = useState("");
  const [mobileZoom, setMobileZoom] = useState(0.55);
  const floorRef = useRef<HTMLDivElement>(null);
  const mobileViewportRef = useRef<HTMLDivElement>(null);
  const mapScrollRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const interactionRef = useRef<{ id: string; mode: "move" | "resize"; x: number; y: number; positionX: number; positionY: number; width: number; height: number; cellWidth: number; cellHeight: number; scale: number } | null>(null);
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
      const { data } = await api.get<DiningTable[]>("/tables");
      setTables(data);
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
  const tableBills = (tableId: string) => orders.filter((order) => order.tableId === tableId && ["PENDING", "PREPARING", "READY", "SERVED"].includes(order.status)).length;
  const counts = {
    AVAILABLE: tables.filter((table) => table.status === "AVAILABLE").length,
    OCCUPIED: tables.filter((table) => table.status === "OCCUPIED").length,
    RESERVED: tables.filter((table) => table.status === "RESERVED").length,
  };
  const rowCount = Math.max(8, ...displayTables.map((table) => table.positionY + table.height + 2));

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

  const updateStatus = async (table: DiningTable, status: TableStatus) => {
    try {
      const { data } = await api.patch<DiningTable>(`/tables/${table.id}/status`, { status });
      setTables((current) => current.map((item) => item.id === table.id ? data : item));
      notify(`Table ${table.tableNumber} is ${status.toLowerCase()}.`);
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
    if (event.pointerType !== "mouse" || (event.target as HTMLElement).closest("article,button,select")) return;
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

  const openTable = (tableId: string) => { if (!editing) navigate(`/tables/${tableId}`); };
  const openTableKey = (event: KeyboardEvent<HTMLElement>, tableId: string) => {
    if (!editing && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openTable(tableId); }
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const payload = { tableNumber: Number(number), capacity: Number(capacity), shape: newShape, status: newStatus };
      if (editingTable) {
        const { data } = await api.patch<DiningTable>(`/tables/${editingTable.id}`, payload);
        setTables((current) => current.map((table) => table.id === data.id ? { ...table, ...data } : table));
        setDraft((current) => current.map((table) => table.id === data.id ? { ...table, ...data, positionX: table.positionX, positionY: table.positionY, width: table.width, height: table.height } : table));
        notify("Table updated.");
      } else {
        await api.post("/tables", payload);
        notify("Table added to the floor.");
      }
      setModal(false);
      setEditingTable(null);
      setNumber("");
      setCapacity("2");
      setNewShape("ROUND");
      setNewStatus("AVAILABLE");
      await load();
    } catch (cause) { setError(errorMessage(cause)); }
  };

  const openCreate = () => {
    setEditingTable(null);
    setNumber("");
    setCapacity("2");
    setNewShape("ROUND");
    setNewStatus("AVAILABLE");
    setError("");
    setModal(true);
  };

  const openEdit = (table: DiningTable) => {
    setEditingTable(table);
    setNumber(String(table.tableNumber));
    setCapacity(String(table.capacity));
    setNewShape(table.shape);
    setNewStatus(table.status);
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

    <div ref={mobileViewportRef} className="mb-4 overflow-hidden rounded-[24px] border border-[#f1dce7] bg-[#fff8fc] shadow-card lg:hidden">
      {!loading && displayTables.length > 0 && <div className="flex items-center justify-end gap-1.5 border-b border-[#f1dce7] bg-white/90 px-3 py-2">
        <span className="mr-auto text-[10px] font-semibold text-[#8c7c85]">{t("Floor plan")}</span>
        <button type="button" onClick={() => setMobileZoom((zoom) => Math.max(0.35, Math.round((zoom - 0.1) * 10) / 10))} aria-label={t("Zoom out floor plan")} className="grid h-8 w-8 place-items-center rounded-lg border border-[#f1dce7] text-[#5c4652]"><ZoomOut size={15} /></button>
        <span className="w-10 text-center text-[10px] font-bold text-[#5c4652]">{Math.round(mobileZoom * 100)}%</span>
        <button type="button" onClick={() => setMobileZoom((zoom) => Math.min(1.5, Math.round((zoom + 0.1) * 10) / 10))} aria-label={t("Zoom in floor plan")} className="grid h-8 w-8 place-items-center rounded-lg border border-[#f1dce7] text-[#5c4652]"><ZoomIn size={15} /></button>
        <button type="button" onClick={() => { setMobileZoom(0.55); if (mapScrollRef.current) { mapScrollRef.current.scrollLeft = 0; mapScrollRef.current.scrollTop = 0; } }} className="rounded-lg px-2 py-1.5 text-[10px] font-bold text-[#d80c7c]">{t("Reset")}</button>
      </div>}
      {loading ? <div className="grid grid-cols-2 gap-3 p-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl border border-[#f4e4ec] bg-white/70" />)}</div> : displayTables.length ? <div ref={mapScrollRef} onPointerDown={startMapPan} onPointerMove={moveMapPan} onPointerUp={stopMapPan} onPointerCancel={stopMapPan} onWheel={zoomFromWheel} className="w-full overflow-auto" style={{ height: `${Math.max(300, (rowCount * 84 + 40) * mobileZoom)}px`, touchAction: "pan-x pan-y" }}><div className="relative" style={{ width: `${1100 * mobileZoom}px`, height: `${(rowCount * 84 + 40) * mobileZoom}px` }}><div data-floor-grid data-mobile-floor="true" className="absolute left-0 top-0 grid w-[1100px] gap-3 p-5" style={{ height: `${rowCount * 84 + 40}px`, gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rowCount}, ${ROW_HEIGHT}px)`, backgroundImage: "linear-gradient(#f7e8ef 1px, transparent 1px), linear-gradient(90deg, #f7e8ef 1px, transparent 1px)", backgroundSize: "74px 74px", transform: `scale(${mobileZoom})`, transformOrigin: "top left", touchAction: "pan-x pan-y" }}>
        {displayTables.map((table) => {
          const bills = tableBills(table.id);
          const shapeClass = table.shape === "ROUND" ? "rounded-full" : table.shape === "SQUARE" ? "rounded-[27px]" : table.shape === "OVAL" ? "rounded-[999px]" : table.shape === "BOOTH" ? "rounded-[20px]" : table.shape === "BAR" ? "rounded-xl" : "rounded-2xl";
          const statusClass = table.status === "AVAILABLE" ? "bg-emerald-50 text-emerald-700" : table.status === "OCCUPIED" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700";
          return <article key={table.id} onPointerMove={movePointerEdit} onPointerUp={endPointerEdit} onPointerCancel={endPointerEdit} onClick={(event) => { if ((event.target as HTMLElement).closest("select,button")) return; openTable(table.id); }} aria-label={`${t(shapeLabels[table.shape])} ${t("Table")} ${table.tableNumber}, ${t(table.status.toLowerCase())}, ${bills} ${t("Bills")}`} className={`relative flex h-full w-full min-w-0 flex-col justify-between ${editing ? "z-20 overflow-visible" : "overflow-hidden"} border bg-white p-5 shadow-[0_5px_16px_rgba(74,35,56,.06)] ${shapeClass} ${editing ? "border-2 border-dashed border-[#fa0b91]" : "cursor-pointer border-[#f2dce7]"} ${draggedId === table.id ? "opacity-70" : ""}`} style={{ gridColumn: `${table.positionX + 1} / span ${table.width}`, gridRow: `${table.positionY + 1} / span ${table.height}` }}>
            {editing && <button type="button" aria-label={`Move table ${table.tableNumber}`} onPointerDown={(event) => beginPointerEdit(event, table, "move")} className="absolute inset-0 z-10 cursor-move touch-none" />}
            <div className={`relative z-20 flex min-w-0 items-center gap-1 ${table.shape === "ROUND" || table.shape === "OVAL" ? "flex-col justify-center" : "justify-between"}`}>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[#f5e7ee] bg-white text-[#f71591]"><Utensils size={15} /></span>
              <select value={table.status} aria-label={`${t("Status")} ${t("Table")} ${table.tableNumber}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onChange={(event) => { event.stopPropagation(); void updateStatus(table, event.target.value as TableStatus); }} className={`min-w-0 max-w-[150px] rounded-full border-0 px-2 py-1.5 text-sm font-bold uppercase outline-none ${statusClass}`}><option value="AVAILABLE">{t("Available")}</option><option value="OCCUPIED">{t("Occupied")}</option><option value="RESERVED">{t("Reserved")}</option></select>
            </div>
            <div className={`pointer-events-none relative z-[5] min-w-0 ${table.shape === "ROUND" || table.shape === "OVAL" ? "w-full text-center" : ""}`}><p className="truncate text-base font-extrabold leading-5 text-[#30242c]">{table.shape === "BAR" ? t("Bar") : `${t("Table")} ${table.tableNumber}`}</p><p className="mt-1 truncate text-xs leading-4 text-[#8c7c85]">{table.capacity} {t("seats")} · {bills} {t(bills === 1 ? "Bill" : "Bills")}</p></div>
            {editing && <select value={table.shape} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => updateShape(table.id, event.target.value as TableShape)} aria-label={`${t("Shape for table")} ${table.tableNumber}`} className="relative z-20 w-full rounded-md border border-[#f3d9e7] bg-white px-1 py-0.5 text-[8px] font-bold text-[#5c4652] outline-none"><option value="ROUND">{t("Round")}</option><option value="SQUARE">{t("Square")}</option><option value="RECTANGLE">{t("Rectangle")}</option><option value="OVAL">{t("Oval")}</option><option value="BOOTH">{t("Booth")}</option><option value="BAR">{t("Bar")}</option></select>}
            {editing && admin && <div className="relative z-20 flex gap-1" onPointerDown={(event) => event.stopPropagation()}><button type="button" onClick={() => openEdit(table)} className="flex flex-1 items-center justify-center gap-1 rounded-md border border-[#f3d9e7] bg-white px-1 py-1 text-[8px] font-bold text-[#d80c7c]"><Pencil size={10} /> {t("Edit")}</button><button type="button" onClick={() => void deleteTable(table)} className="flex items-center justify-center gap-1 rounded-md border border-rose-100 bg-white px-2 py-1 text-[8px] font-bold text-rose-600"><Trash2 size={10} /> {t("Delete")}</button></div>}
            {editing && <button type="button" aria-label={`Resize table ${table.tableNumber}`} onPointerDown={(event) => beginPointerEdit(event, table, "resize")} className="absolute -bottom-2 -right-2 z-30 grid h-7 w-7 cursor-nwse-resize touch-none place-items-center rounded-full border-2 border-white bg-[#f71591] text-xs leading-none text-white shadow-md">↘</button>}
          </article>;
        })}
      </div></div></div> : <div className="relative flex min-h-[calc(100vh-260px)] flex-col items-center justify-center p-6 text-center" style={{ backgroundImage: "linear-gradient(#f7e8ef 1px, transparent 1px), linear-gradient(90deg, #f7e8ef 1px, transparent 1px)", backgroundSize: "26px 26px" }}><span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#ffedf6] text-[#e91488]"><Armchair size={24} /></span><h2 className="mt-4 font-display text-lg font-extrabold text-[#30242c]">Your floor is ready for a layout</h2><p className="mt-1 max-w-sm text-sm text-[#8c7c85]">Add your first table to start arranging your restaurant floor.</p></div>}
      {admin && !editing && <button onClick={openCreate} className="flex min-h-12 w-full items-center justify-center gap-2 border-t border-[#f1dce7] bg-white text-sm font-bold text-[#d80c7c]"><Plus size={18} /> {t("Add table")}</button>}
    </div>

    <div className="hidden w-full overflow-x-auto overscroll-x-contain rounded-[24px] border border-[#f1dce7] bg-[#fff8fc] shadow-card lg:block">
      <div className="relative min-h-[calc(100vh-190px)] w-full min-w-[860px] p-4 sm:p-5">
        <div className="pointer-events-none absolute inset-0 opacity-70" style={{ backgroundImage: "linear-gradient(#f7e8ef 1px, transparent 1px), linear-gradient(90deg, #f7e8ef 1px, transparent 1px)", backgroundSize: "74px 74px" }} />
        {loading ? <div className="relative grid grid-cols-4 gap-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl border border-[#f4e4ec] bg-white/70" />)}</div> : displayTables.length ? <div ref={floorRef} data-floor-grid data-mobile-floor="false" className="relative grid min-h-[calc(100vh-245px)] w-full touch-pan-y grid-cols-12 auto-rows-[72px] gap-3" style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rowCount}, ${ROW_HEIGHT}px)` }}>
          {displayTables.map((table) => {
            const bills = tableBills(table.id);
            const statusTone = table.status === "AVAILABLE" ? "available" : table.status === "OCCUPIED" ? "occupied" : "reserved";
            const shapeClass = table.shape === "ROUND" ? "rounded-full" : table.shape === "SQUARE" ? "rounded-[27px]" : table.shape === "OVAL" ? "rounded-[999px]" : table.shape === "BOOTH" ? "rounded-[20px]" : table.shape === "BAR" ? "rounded-xl" : "rounded-2xl";
            return <article
              key={table.id}
              onPointerMove={movePointerEdit}
              onPointerUp={endPointerEdit}
              onPointerCancel={endPointerEdit}
              onClick={() => openTable(table.id)}
              onKeyDown={(event) => openTableKey(event, table.id)}
              role={editing ? undefined : "button"}
              tabIndex={editing ? undefined : 0}
              aria-label={`${t(shapeLabels[table.shape])} ${t("Table")} ${table.tableNumber}, ${t(table.status.toLowerCase())}, ${bills} ${t("Bills")}`}
              className={`group relative col-span-2 row-span-2 place-self-stretch flex h-full w-full min-w-0 flex-col justify-between ${editing ? "z-20 overflow-visible" : "overflow-hidden"} border bg-white p-3 text-left shadow-[0_5px_16px_rgba(74,35,56,.06)] transition duration-150 ${shapeClass} ${["ROUND", "OVAL"].includes(table.shape) && !editing ? "items-center text-center" : ""} ${editing ? "border-2 border-dashed border-[#fa0b91] hover:shadow-[0_8px_22px_rgba(236,17,135,.12)]" : "cursor-pointer border-[#f2dce7] hover:-translate-y-0.5 hover:border-[#e8b6d0] hover:shadow-[0_10px_25px_rgba(74,35,56,.10)]"} ${draggedId === table.id ? "opacity-70" : ""}`}
              style={{ gridColumn: `${table.positionX + 1} / span ${table.width}`, gridRow: `${table.positionY + 1} / span ${table.height}` }}
            >
              {editing && <button type="button" aria-label={`Move table ${table.tableNumber}`} onPointerDown={(event) => beginPointerEdit(event, table, "move")} className="absolute inset-0 z-[5] cursor-move touch-none" title="Drag to move" />}
              <TableShapeSurface shape={table.shape} />
              <div className={`pointer-events-none relative z-10 flex w-full items-center justify-between gap-1 ${table.shape === "ROUND" || table.shape === "OVAL" ? "flex-col justify-center" : ""}`}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[#f5e7ee] bg-white text-[#f71591] shadow-sm"><Utensils size={15} /></span>
                {editing ? <span className="grid h-7 w-7 place-items-center rounded-full bg-[#fff0f7] text-[#d80c7c]"><Move size={13} /></span> : table.status === "OCCUPIED" ? <span className="rounded-full bg-rose-50 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-rose-700">{t("Occupied")}</span> : <select
                  aria-label={`Set table ${table.tableNumber} status`}
                  value={table.status}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => { event.stopPropagation(); void updateStatus(table, event.target.value as TableStatus); }}
                  className={`pointer-events-auto rounded-full border-0 px-2 py-1 text-[8px] font-bold uppercase tracking-wider outline-none ${statusTone === "available" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                ><option value="AVAILABLE">{t("Available")}</option><option value="RESERVED">{t("Reserved")}</option></select>}
              </div>
              <div className={`pointer-events-none relative z-10 min-w-0 ${["ROUND", "OVAL"].includes(table.shape) ? "mt-1 w-full text-center" : "mt-auto"}`}>
                <p className="truncate font-display text-[15px] font-extrabold leading-5 tracking-tight text-[#30242c]">{table.shape === "BAR" ? t("Bar") : `${t("Table")} ${table.tableNumber}`}</p>
                <p className={`mt-1 flex items-center gap-1 text-[10px] font-medium text-[#8c7c85] ${["ROUND", "OVAL"].includes(table.shape) ? "justify-center" : ""}`}><Users size={11} /> {table.capacity} {t("seats")} <span className="text-[#d7c5cf]">·</span> {bills} {t(bills === 1 ? "Bill" : "Bills")}</p>
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
        {admin && !editing && <button onClick={openCreate} className="relative z-10 mx-auto mt-7 flex h-12 w-12 items-center justify-center rounded-full bg-[#f71591] text-white shadow-[0_8px_20px_rgba(247,21,145,.24)] transition hover:scale-105 hover:bg-[#dc0d7e]" aria-label={t("Add table")}><Plus size={22} /></button>}
        {admin && !editing && tables.length > 0 && <p className="relative z-10 mt-1 text-center text-[10px] font-semibold text-[#8c7c85]">{t("Add table")}</p>}
      </div>
    </div>

    {modal && <Modal title={t(editingTable ? "Edit table" : "Add a table")} onClose={() => { setModal(false); setEditingTable(null); }}><form onSubmit={(event) => void create(event)} className="space-y-4">
      <Field label={t("Table number")} type="number" min="1" required value={number} onChange={(event) => setNumber(event.target.value)} placeholder="e.g. 12" />
      <Field label={t("Seat capacity")} type="number" min="1" required value={capacity} onChange={(event) => setCapacity(event.target.value)} />
      <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink">{t("Table shape")}</span><select value={newShape} onChange={(event) => setNewShape(event.target.value as TableShape)} className="focus-ring w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-ink outline-none"><option value="ROUND">{t("Round")}</option><option value="SQUARE">{t("Square")}</option><option value="RECTANGLE">{t("Rectangle")}</option><option value="OVAL">{t("Oval")}</option><option value="BOOTH">{t("Booth")}</option><option value="BAR">{t("Bar counter")}</option></select></label>
      <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink">{t("Status")}</span><select value={newStatus} onChange={(event) => setNewStatus(event.target.value as TableStatus)} className="focus-ring w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-ink outline-none"><option value="AVAILABLE">{t("Available")}</option><option value="OCCUPIED">{t("Occupied")}</option><option value="RESERVED">{t("Reserved")}</option></select></label>
      <button className="mt-2 h-11 w-full rounded-xl bg-[#f71591] text-sm font-bold text-white hover:bg-[#dc0d7e]">{t(editingTable ? "Save changes" : "Add to floor")}</button>
    </form></Modal>}
  </div>;
}
