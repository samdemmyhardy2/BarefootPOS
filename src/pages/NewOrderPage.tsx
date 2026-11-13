import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Beer,
  Check,
  ChevronLeft,
  Citrus,
  Coffee,
  CupSoda,
  Egg,
  Fish,
  Flame,
  GlassWater,
  IceCreamCone,
  Martini,
  MessageCircle,
  Minus,
  Pencil,
  MoreHorizontal,
  Plus,
  Popcorn,
  Salad,
  Sandwich,
  Search,
  ShoppingBag,
  Soup,
  Trash2,
  Utensils,
  UtensilsCrossed,
  Wheat,
  X,
  type LucideIcon,
} from "lucide-react";
import { Panel, EmptyState } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { listOutbox, retargetQueuedTable, SavedLocallyError } from "../lib/outbox";
import { SettleTableDialog } from "../components/SettleTableDialog";
import type { Category, DiningTable, MenuItem, ModifierGroup, Order, SendTo } from "../lib/types";
import { money } from "../lib/types";
import { mediaSrc } from "../lib/media";
import { totalWithDishVat } from "../lib/vat";
import { useOrderStore } from "../stores/orderStore";
import { useUiStore } from "../stores/uiStore";
import { useAuthStore } from "../stores/authStore";
import { ReceiptPreview, type CheckoutReceipt } from "../components/ReceiptPreview";
import { ModifierGroupIcon } from "../components/ModifierGroupIcon";
import { LevelSlider } from "../components/LevelSlider";
import { localizedFoodLabels } from "../lib/foodTranslations";
import { useNavigate, useParams } from "react-router-dom";
import { translateUiText } from "../lib/translations";

type CartLine = {
  id: string;
  item: MenuItem;
  quantity: number;
  specialNotes: string;
  modifierSelections: Record<string, string[]>;
  prepStation: SendTo;
  payerId: string;
  kitchenFlag?: boolean;
};
function DishCommentButton({ flagged, label, onClick }: { flagged: boolean; label: string; onClick: () => void }) {
  return <button type="button" aria-pressed={flagged} aria-label={flagged ? `Clear the kitchen mark on ${label}` : `Mark ${label} for the kitchen`} onClick={(event) => { event.stopPropagation(); onClick(); }} className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${flagged ? "bg-[#ed168c] text-white" : "text-[#c9a3b6] hover:bg-[#fff1f8] hover:text-[#ed168c]"}`}><MessageCircle size={14} /></button>;
}
function SwipeClearRow({ rowKey, open, busy, label, tone = "clear", onOpen, onClear, children }: { rowKey: string; open: boolean; busy: boolean; label: string; tone?: "clear" | "edit"; onOpen: (key: string | null) => void; onClear: () => void; children: ReactNode }) {
  const reveal = 56;
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ pointer: number; startX: number; startOffset: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => { setOffset(open ? -reveal : 0); }, [open]);
  return <div className="relative overflow-hidden rounded-lg">
    <button type="button" disabled={busy} onClick={onClear} className={`absolute inset-y-0 right-0 grid w-14 place-items-center text-white disabled:opacity-60 ${tone === "edit" ? "bg-[#2a2430]" : "bg-[#ff3b30]"}`} aria-label={tone === "edit" ? `Edit ${label}` : `Clear ${label}`}>
      {tone === "edit" ? <Pencil size={18} /> : <Trash2 size={18} />}
    </button>
    <div
      className="relative bg-white"
      style={{ transform: `translateX(${offset}px)`, transition: dragging ? "none" : "transform 180ms ease", touchAction: "pan-y" }}
      onPointerDown={(event) => {
        if (busy || event.button !== 0 || (event.target as HTMLElement).closest("input, button, textarea, form")) return;
        drag.current = { pointer: event.pointerId, startX: event.clientX, startOffset: offset, moved: false };
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.pointer !== event.pointerId) return;
        const delta = event.clientX - current.startX;
        if (Math.abs(delta) > 8) current.moved = true;
        setOffset(Math.min(0, Math.max(-reveal, current.startOffset + delta)));
      }}
      onPointerUp={(event) => {
        const current = drag.current;
        if (!current || current.pointer !== event.pointerId) return;
        drag.current = null;
        setDragging(false);
        if (!current.moved) {
          if (open) onOpen(null);
          return;
        }
        suppressClick.current = true;
        const shouldOpen = current.startOffset + (event.clientX - current.startX) < -reveal / 2;
        onOpen(shouldOpen ? rowKey : null);
        setOffset(shouldOpen ? -reveal : 0);
      }}
      onPointerCancel={() => { drag.current = null; setDragging(false); setOffset(open ? -reveal : 0); }}
      onClickCapture={(event) => { if (!suppressClick.current) return; suppressClick.current = false; event.preventDefault(); event.stopPropagation(); }}
    >
      {children}
    </div>
  </div>;
}
type PlusJump = { id: string; fromX: number; fromY: number; toX: number; toY: number; label: string };
function localId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function PlusJumpBadge({ jump, onDone }: { jump: PlusJump; onDone: (id: string) => void }) {
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMoved(true));
    const timer = window.setTimeout(() => onDone(jump.id), 320);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [jump.id, onDone]);
  return <span className="pointer-events-none fixed z-[90]" style={{ left: moved ? jump.toX : jump.fromX, top: moved ? jump.toY : jump.fromY, transform: "translate(-50%, -50%)", transition: "left 240ms cubic-bezier(0.2, 0.8, 0.2, 1), top 240ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
    <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-sm font-extrabold text-emerald-700">{jump.label}</span>
  </span>;
}
const categoryColors = [
  "from-[#fde7ef] to-[#fff5f8]",
  "from-[#e7f0ff] to-[#f4f7ff]",
  "from-[#fff1e4] to-[#fff8f1]",
  "from-[#efe7ff] to-[#f7f3ff]",
  "from-[#e7f6ef] to-[#f3fbf7]",
];
const categoryIconRules: { test: RegExp; icon: LucideIcon }[] = [
  { test: /breakfast|egg|morning/i, icon: Egg },
  { test: /starter|snack|appetizer/i, icon: Popcorn },
  { test: /salad/i, icon: Salad },
  { test: /toast|burger|sandwich/i, icon: Sandwich },
  { test: /seafood|fish|squid/i, icon: Fish },
  { test: /pasta|noodle|rice/i, icon: Wheat },
  { test: /curry|thai|spicy/i, icon: Flame },
  { test: /side|soup/i, icon: Soup },
  { test: /dessert|sweet/i, icon: IceCreamCone },
  { test: /coffee|tea/i, icon: Coffee },
  { test: /juice/i, icon: Citrus },
  { test: /smoothie|shake/i, icon: GlassWater },
  { test: /beer/i, icon: Beer },
  { test: /cocktail|spirit|wine/i, icon: Martini },
  { test: /drink|soda|water/i, icon: CupSoda },
  { test: /main/i, icon: UtensilsCrossed },
];
type MenuSection = "Food" | "Drinks" | "Bar";
const hiddenCategories = new Set(["morning breakfast", "spicy", "squid"]);
function visibleCategory(name: string) {
  return !hiddenCategories.has(name.trim().toLowerCase());
}
const sectionOrder: Record<MenuSection, string[]> = {
  Food: ["Breakfast", "Appetizers", "Salads", "Toasts & burgers", "Seafood", "Pasta", "Mains", "Thai", "Thai curries", "Noodle", "Rice & noodles", "Sides", "Desserts"],
  Drinks: ["Coffee & tea", "Cold drinks", "Fresh juices", "Smoothies & shakes", "Drinks"],
  Bar: ["Beer", "Cocktails & spirits"],
};
const sectionTone: Record<MenuSection, { card: string; icon: string; count: string }> = {
  Food: { card: "bg-[#fff1e8]", icon: "bg-white text-[#e07a3d]", count: "text-[#e07a3d]" },
  Drinks: { card: "bg-[#eef1ff]", icon: "bg-white text-[#6674e4]", count: "text-[#6674e4]" },
  Bar: { card: "bg-[#f4eefe]", icon: "bg-white text-[#8a63d2]", count: "text-[#8a63d2]" },
};
function categoryIcon(name: string) {
  return categoryIconRules.find((rule) => rule.test.test(name))?.icon ?? Utensils;
}
function menuSection(category: Category): MenuSection {
  const name = category.name.toLowerCase();
  if (/beer|cocktail|spirit|wine|liquor|whisky|whiskey/.test(name)) return "Bar";
  if (/coffee|tea|juice|smoothie|shake|soda|drink|water/.test(name)) return "Drinks";
  const items = category.items ?? [];
  const bar = items.filter((item) => item.prepStation === "BAR").length;
  if (items.length && bar > items.length / 2) return "Bar";
  return "Food";
}
function sortCategories(section: MenuSection, list: Category[]) {
  const names = sectionOrder[section];
  return [...list].sort((left, right) => {
    const leftIndex = names.indexOf(left.name);
    const rightIndex = names.indexOf(right.name);
    return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex) || left.name.localeCompare(right.name);
  });
}
type ActiveRoomStay = { id: string; primaryGuestName: string; cashOnly?: boolean; occupants: { id: string; name: string }[]; room: { roomNumber: string | number }; expectedCheckoutAt?: string | null };
function checkedInNow(stays: ActiveRoomStay[], now = Date.now()) {
  return stays.filter((stay) => {
    if (!stay.expectedCheckoutAt) return true;
    const end = new Date(stay.expectedCheckoutAt).getTime();
    return Number.isNaN(end) || end > now;
  });
}
const ORDER_DESK_KEY = "restaurant-order-desk";
function readOrderDesk(): { categories: Category[]; tables: DiningTable[]; stays: ActiveRoomStay[] } | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(ORDER_DESK_KEY) ?? "null") as { categories?: Category[]; tables?: DiningTable[]; stays?: ActiveRoomStay[] } | null;
    if (!parsed || !Array.isArray(parsed.categories) || !Array.isArray(parsed.tables) || !Array.isArray(parsed.stays)) return null;
    return { categories: parsed.categories, tables: parsed.tables, stays: parsed.stays };
  } catch {
    return null;
  }
}
function writeOrderDesk(value: { categories: Category[]; tables: DiningTable[]; stays: ActiveRoomStay[] }) {
  try { localStorage.setItem(ORDER_DESK_KEY, JSON.stringify(value)); } catch { /* The open order screen still has this visit's menu. */ }
}
const OPEN_TICKETS_KEY = "restaurant-open-tickets";
type HeldTicket = { lines: CartLine[]; note: string };
function slimTicketLine(line: CartLine): CartLine {
  const imageUrl = line.item.imageUrl?.startsWith("data:") ? null : line.item.imageUrl;
  return { ...line, item: { ...line.item, imageUrl } };
}
function readOpenTickets(): Record<string, HeldTicket> {
  try {
    const parsed = JSON.parse(localStorage.getItem(OPEN_TICKETS_KEY) ?? "{}") as Record<string, HeldTicket>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function writeOpenTickets(value: Record<string, HeldTicket>) {
  try { localStorage.setItem(OPEN_TICKETS_KEY, JSON.stringify(value)); } catch { /* The ticket stays on screen for this visit. */ }
}
function queuedLike(storageKey: string, lines: CartLine[]) {
  const bag = lines.map((line) => `${line.item.id}|${line.quantity}`).sort().join(",");
  if (!bag || !storageKey) return false;
  return listOutbox().some((item) => {
    if (item.status !== "pending" || item.scope !== "order.create") return false;
    const sent = Array.isArray(item.body.items) ? item.body.items as { menuItemId?: string; quantity?: number }[] : [];
    if (sent.map((line) => `${line.menuItemId}|${line.quantity}`).sort().join(",") !== bag) return false;
    if (storageKey.startsWith("room:")) return item.body?.roomStayId === storageKey.slice(5) && !item.body?.tableId;
    const [tableId, splitId = ""] = storageKey.split(":");
    return item.body?.tableId === tableId && String(item.body?.tableSplitId ?? "") === splitId;
  });
}
function readOpenTicket(storageKey: string): HeldTicket {
  const held = readOpenTickets()[storageKey];
  const lines = Array.isArray(held?.lines) ? held.lines.filter((line) => line?.item?.id) : [];
  if (!storageKey || queuedLike(storageKey, lines)) return { lines: [], note: "" };
  return { lines, note: held?.note ?? "" };
}

function picksOne(group: ModifierGroup) {
  return group.appearance === "RADIO" || group.appearance === "SLIDER" || (group.appearance !== "CHECKBOX" && group.selectionType === "SINGLE");
}
function pickLimit(group: ModifierGroup) {
  const choices = group.options.filter((option) => option.active).length;
  if (group.appearance === "CHECKBOX") return Math.max(group.maxPicks > 1 ? group.maxPicks : choices, 1);
  return picksOne(group) ? 1 : Math.max(group.maxPicks, 1);
}
function liveMenuItem(categories: Category[], itemId: string) {
  for (const category of categories) {
    const item = (category.items ?? []).find((entry) => entry.id === itemId);
    if (item) return { ...item, category };
  }
  return undefined;
}
function remapModifierSelections(categories: Category[], item: MenuItem, selections: Record<string, string[]>) {
  const liveGroups = itemModifierGroups(liveMenuItem(categories, item.id) ?? item);
  const savedGroups = itemModifierGroups(item);
  const next: Record<string, string[]> = {};
  for (const [groupId, optionIds] of Object.entries(selections)) {
    const savedGroup = savedGroups.find((group) => group.id === groupId);
    const liveGroup = liveGroups.find((group) => group.id === groupId) ?? liveGroups.find((group) => group.name === savedGroup?.name);
    next[liveGroup?.id ?? groupId] = optionIds.map((optionId) => {
      if (liveGroup?.options.some((option) => option.id === optionId)) return optionId;
      const name = savedGroup?.options.find((option) => option.id === optionId)?.name;
      return liveGroup?.options.find((option) => option.name === name)?.id ?? optionId;
    });
  }
  return next;
}
function itemModifierGroups(item: MenuItem): ModifierGroup[] {
  const groups = new Map<string, ModifierGroup>();
  const visit = (group: ModifierGroup) => {
    if (groups.has(group.id)) return;
    groups.set(group.id, group);
    group.options.forEach((option) => { if (option.opensGroup) visit(option.opensGroup); });
  };
  (item.modifierGroups ?? []).forEach((link) => visit(link.group));
  return [...groups.values()];
}

function modifierLabel(option: { name: string; nameMy?: string; nameTh?: string }, language: string) {
  return language === "my" ? option.nameMy || option.name : language === "th" ? option.nameTh || option.name : option.name;
}

function selectedModifierLines(item: MenuItem, selections: Record<string, string[]>) {
  const groups = itemModifierGroups(item);
  const result: { id: string; name: string; count: number; amount: number; depth: number; nested: boolean }[] = [];
  const visit = (group: ModifierGroup, depth: number) => {
    const ids = selections[group.id] ?? [];
    const indexById = new Map<string, number[]>();
    ids.forEach((id, index) => indexById.set(id, [...(indexById.get(id) ?? []), index]));
    for (const [optionId, indexes] of indexById) {
      const option = group.options.find((candidate) => candidate.id === optionId);
      if (!option) continue;
      const amount = indexes.reduce((sum, index) => sum + (index < group.includedPicks ? 0 : Number(option.priceAdjustment) + Number(group.extraPickPrice ?? 0)), 0);
      result.push({ id: `${group.id}-${option.id}`, name: option.name, count: indexes.length, amount, depth, nested: Boolean(option.opensGroup) });
      const child = option.opensGroup ? groups.find((candidate) => candidate.id === option.opensGroup?.id) : undefined;
      if (child && (selections[child.id]?.length ?? 0) > 0) visit(child, depth + 1);
    }
  };
  (item.modifierGroups ?? []).forEach((link) => visit(link.group, 0));
  return result;
}

export function NewOrderPage() {
  const { tableId = "", stayId = "" } = useParams();
  const roomService = Boolean(stayId);
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [activeStays, setActiveStays] = useState<ActiveRoomStay[]>([]);
  const [assignedRoomStayIds, setAssignedRoomStayIds] = useState<string[]>([]);
  const [savingRoomAssignments, setSavingRoomAssignments] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [browsingDishes, setBrowsingDishes] = useState(false);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>(() => readOpenTicket(tableId).lines);
  const [plusJumps, setPlusJumps] = useState<PlusJump[]>([]);
  const [ticketOpen, setTicketOpen] = useState(false);
  const ticketMarkRef = useRef<HTMLButtonElement>(null);
  const [ticketMenu, setTicketMenu] = useState<"closed" | "actions" | "tables" | "guests" | "note">("closed");
  const [ticketMenuBox, setTicketMenuBox] = useState<{ top: number; right: number } | null>(null);
  const pendingAddOrigin = useRef<DOMRect | null>(null);
  const [orderKitchenNote, setOrderKitchenNote] = useState(() => readOpenTicket(tableId).note);
  const ticketTableRef = useRef(tableId);
  const [configuringItem, setConfiguringItem] = useState<MenuItem | null>(null);
  const [editingCartLineId, setEditingCartLineId] = useState<string | null>(null);
  const [draftQuantity, setDraftQuantity] = useState(1);
  const [draftKitchenNote, setDraftKitchenNote] = useState("");
  const [draftSelections, setDraftSelections] = useState<Record<string, string[]>>({});
  const [configStep, setConfigStep] = useState(0);
  const [modifierError, setModifierError] = useState("");
  const [placing, setPlacing] = useState(false);
  const [movingTable, setMovingTable] = useState(false);
  const [addingSplit, setAddingSplit] = useState(false);
  const [activeSplitId, setActiveSplitId] = useState("");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<CheckoutReceipt | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [openSwipe, setOpenSwipe] = useState<string | null>(null);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [removal, setRemoval] = useState<{ orderId: string; itemId: string; reason: string } | null>(null);
  const createOrder = useOrderStore((state) => state.createOrder);
  const upsertOrder = useOrderStore((state) => state.upsertOrder);
  const orders = useOrderStore((state) => state.orders);
  const fetchOrders = useOrderStore((state) => state.fetchOrders);
  const notify = useUiStore((state) => state.notify);
  const reportError = (message: string) => { setError(message); notify(message, "error"); };
  const language = useUiStore((state) => state.language);
  const modifierPickerMode = useUiStore((state) => state.modifierPickerMode);
  const t = (text: string) => translateUiText(language, text);
  const restaurantName = useUiStore((state) => state.restaurantName);
  const restaurantLogoUrl = useUiStore((state) => state.restaurantLogoUrl);
  const vatPercent = useUiStore((state) => state.vatPercent);
  const currentUser = useAuthStore((state) => state.user);
  useEffect(() => {
    const cached = readOrderDesk();
    if (cached) { setCategories(cached.categories); setTables(cached.tables); setActiveStays(checkedInNow(cached.stays)); }
    void Promise.all([
      api.get<Category[]>("/categories"),
      api.get<DiningTable[]>("/tables"),
      api.get<ActiveRoomStay[]>("/orders/active-room-stays"),
    ])
      .then(([cat, tbl, stays]) => {
        const inHouse = checkedInNow(stays.data);
        setCategories(cat.data); setTables(tbl.data); setActiveStays(inHouse);
        writeOrderDesk({ categories: cat.data, tables: tbl.data, stays: inHouse });
      })
      .catch((e) => { if (!cached) reportError(errorMessage(e)); });
  }, []);
  useEffect(() => {
    void fetchOrders().catch(() => undefined);
  }, [fetchOrders]);
  const selectedTable = tables.find((table) => table.id === tableId);
  const roomServiceStay = roomService ? activeStays.find((stay) => stay.id === stayId) : undefined;
  const splits = [...(selectedTable?.splits ?? [])].sort((left, right) => left.position - right.position || left.label.localeCompare(right.label));
  const activeSplit = splits.find((split) => split.id === activeSplitId) ?? splits[0] ?? null;
  const ticketStorageKey = roomService ? `room:${stayId}` : !tableId ? "" : activeSplit ? `${tableId}:${activeSplit.id}` : tableId;
  useEffect(() => {
    const save = (storageKey: string, lines: CartLine[], note: string) => {
      if (!storageKey) return;
      const stored = readOpenTickets();
      if (!lines.length && !note.trim()) delete stored[storageKey];
      else stored[storageKey] = { lines: lines.map(slimTicketLine), note };
      writeOpenTickets(stored);
    };
    if (ticketTableRef.current !== ticketStorageKey) {
      save(ticketTableRef.current, cart, orderKitchenNote);
      const stored = readOpenTickets();
      const bare = tableId;
      if (ticketTableRef.current === bare && ticketStorageKey.startsWith(`${bare}:`) && stored[bare] && !stored[ticketStorageKey]) {
        stored[ticketStorageKey] = stored[bare];
        delete stored[bare];
        writeOpenTickets(stored);
      }
      ticketTableRef.current = ticketStorageKey;
      const next = readOpenTicket(ticketStorageKey);
      setCart(next.lines);
      setOrderKitchenNote(next.note);
      return;
    }
    save(ticketStorageKey, cart, orderKitchenNote);
  }, [ticketStorageKey, tableId, cart, orderKitchenNote]);
  useEffect(() => {
    const assignedIds = selectedTable?.assignedRoomStays?.map((stay) => stay.id) ?? [];
    setAssignedRoomStayIds(assignedIds);
  }, [tableId, selectedTable?.assignedRoomStays]);
  const activeTableOrders = orders
    .filter((order) => roomService ? order.roomStayId === stayId && !order.tableId && order.type !== "DINE_IN" : order.tableId === tableId)
    .filter((order) => ["PENDING", "PREPARING", "READY", "SERVED"].includes(order.status))
    .filter((order) => roomService || !activeSplit || order.tableSplitId === activeSplit.id || (!order.tableSplitId && activeSplit.position === 0))
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const roomPayers = (activeSplit ? (activeSplit.roomStayId ? [activeSplit.roomStayId] : []) : assignedRoomStayIds).flatMap((id) => {
    const stay = activeStays.find((entry) => entry.id === id);
    if (!stay) return [];
    return [{ id, label: `R${stay.room.roomNumber}`, name: stay.primaryGuestName, roomStayId: id }];
  });
  const menuItems = useMemo(
    () =>
      categories
        .flatMap((category) =>
          (category.items ?? []).map((item) => ({ ...item, category })),
        )
        .filter((item) => {
          if (!visibleCategory(item.category?.name ?? "")) return false;
          const query = search.trim().toLowerCase();
          if (query) return `${item.name} ${item.description ?? ""}`.toLowerCase().includes(query);
          return selectedCategory === "All" || item.category?.name === selectedCategory;
        }),
    [categories, selectedCategory, search],
  );
  const showingDishes = browsingDishes || search.trim().length > 0;
  const menuSections = useMemo(() => {
    const groups: { key: MenuSection; categories: Category[] }[] = [
      { key: "Food", categories: [] },
      { key: "Drinks", categories: [] },
      { key: "Bar", categories: [] },
    ];
    for (const category of categories) if (visibleCategory(category.name)) groups.find((group) => group.key === menuSection(category))?.categories.push(category);
    return groups
      .map((group) => ({ ...group, categories: sortCategories(group.key, group.categories) }))
      .filter((group) => group.categories.length);
  }, [categories]);
  const leaveDishes = () => { setBrowsingDishes(false); setSelectedCategory("All"); setSearch(""); };
  const lineAmount = (line: { subtotal?: number | string | null; unitPrice?: number | string | null; quantity: number; menuItem?: { price?: number | string | null }; removedAt?: string | null }) => {
    if (line.removedAt) return 0;
    const amount = Number(line.subtotal ?? Number(line.unitPrice ?? line.menuItem?.price ?? 0) * Number(line.quantity || 0));
    return Number.isFinite(amount) ? amount : 0;
  };
  const cartLines = cart;
  const cartCount = cartLines.reduce((count, line) => count + line.quantity, 0);
  const tableTitle = selectedTable ? (/^table\b/i.test(selectedTable.tableNumber) ? selectedTable.tableNumber : `Table ${selectedTable.tableNumber}`) : "Table";
  const headerRoom = (() => {
    const stayId = activeSplit ? activeSplit.roomStayId : assignedRoomStayIds.length === 1 ? assignedRoomStayIds[0] : null;
    const stay = stayId ? activeStays.find((entry) => entry.id === stayId) : undefined;
    if (stay) return `Room ${stay.room.roomNumber}`;
    if (!activeSplit && assignedRoomStayIds.length > 1) return `${assignedRoomStayIds.length} rooms`;
    return "";
  })();
  const sideCount = (splitId: string) => {
    const sent = orders.filter((order) => order.tableId === tableId && order.tableSplitId === splitId && ["PENDING", "PREPARING", "READY", "SERVED"].includes(order.status)).reduce((count, order) => count + order.items.reduce((sum, line) => sum + Number(line.quantity || 0), 0), 0);
    const held = splitId === activeSplit?.id ? cartLines : readOpenTicket(`${tableId}:${splitId}`).lines;
    return sent + held.reduce((count, line) => count + line.quantity, 0);
  };
  const wholeCount = cartCount + activeTableOrders.reduce((count, order) => count + order.items.reduce((sum, line) => sum + Number(line.quantity || 0), 0), 0);
  const androidTicket = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  const getLineUnitPrice = (item: MenuItem, selections: Record<string, string[]>) => Number(item.price) + openModifierGroups(item, selections).filter((group) => group.appearance !== "TEXT").reduce((sum, group) => {
    const selected = selections[group.id] ?? [];
    const selectedOptions = selected.flatMap((id) => {
      const option = group.options.find((candidate) => candidate.id === id);
      return option ? [option] : [];
    });
    return sum + selectedOptions.reduce((charge, option, index) => charge + (index < group.includedPicks ? 0 : Number(option.priceAdjustment) + Number(group.extraPickPrice ?? 0)), 0);
  }, 0);
  const sentTotal = activeTableOrders.reduce((sum, order) => sum + order.items.reduce((lineSum, line) => lineSum + lineAmount(line), 0), 0);
  const sentAmounts = activeTableOrders.flatMap((order) => order.items.filter((line) => !line.removedAt).map((line) => lineAmount(line)));
  const cartAmounts = cartLines.map((line) => getLineUnitPrice(line.item, line.modifierSelections) * line.quantity);
  const grand = totalWithDishVat([...sentAmounts, ...cartAmounts], vatPercent);
  const tableBill = activeTableOrders.length ? {
    id: "table",
    label: "Table",
    name: "This table",
    roomStayId: undefined as string | undefined,
    orders: activeTableOrders,
    total: Math.round(sentTotal * 100) / 100,
  } : null;
  const settleGrand = totalWithDishVat(sentAmounts, vatPercent);
  const clearPlusJump = useCallback((id: string) => setPlusJumps((current) => current.filter((jump) => jump.id !== id)), []);
  const launchPlus = (origin: DOMRect | null, amount = 1) => {
    if (/Android/i.test(navigator.userAgent)) return;
    const ticket = ticketMarkRef.current?.getBoundingClientRect();
    if (!origin || !ticket) return;
    const id = localId();
    setPlusJumps((current) => [...current, { id, fromX: origin.left + origin.width / 2, fromY: origin.top + origin.height / 2, toX: ticket.left + ticket.width / 2, toY: ticket.top + ticket.height / 2, label: `+${amount}` }]);
  };
  const addToCart = (item: MenuItem, modifierSelections: Record<string, string[]> = {}, quantity = 1, specialNotes = "") => {
    const id = localId();
    setCart((current) => [...current, {
      id,
      item,
      quantity,
      specialNotes,
      modifierSelections,
      prepStation: item.prepStation ?? "KITCHEN",
      payerId: "",
    }]);
  };
  const add = (item: MenuItem, origin?: DOMRect | null) => {
    setEditingCartLineId(null);
    const groups = itemModifierGroups(item);
    if (!groups.length) { addToCart(item); launchPlus(origin ?? null); return; }
    pendingAddOrigin.current = origin ?? null;
    const defaults = Object.fromEntries(groups.map((group) => {
      const chosen = group.options.filter((option) => option.defaultSelected).map((option) => option.id);
      const sliderDefault = group.appearance === "SLIDER" && !chosen.length ? group.options.find((option) => option.active)?.id : undefined;
      return [group.id, sliderDefault ? [sliderDefault] : chosen];
    }));
    setDraftSelections(defaults);
    setDraftQuantity(1);
    setDraftKitchenNote("");
    setModifierError("");
    setConfigStep(0);
    setConfiguringItem(item);
  };
  const editCartLine = (line: CartLine) => {
    setEditingCartLineId(line.id);
    setDraftSelections(line.modifierSelections);
    setDraftQuantity(line.quantity);
    setDraftKitchenNote(line.specialNotes);
    setModifierError("");
    setConfigStep(0);
    setConfiguringItem(line.item);
  };
  function openModifierGroups(item: MenuItem, selections: Record<string, string[]>) {
    const groups = itemModifierGroups(item);
    const visible = new Set((item.modifierGroups ?? []).map((link) => link.group.id));
    let changed = true;
    while (changed) {
      changed = false;
      groups.filter((group) => visible.has(group.id)).forEach((group) => {
        (selections[group.id] ?? []).forEach((optionId) => {
          const followUp = group.options.find((option) => option.id === optionId)?.opensGroup;
          if (followUp && !visible.has(followUp.id)) { visible.add(followUp.id); changed = true; }
        });
      });
    }
    return groups.filter((group) => visible.has(group.id));
  }
  const updateDraftSelection = (group: ModifierGroup, optionId: string, checked: boolean) => {
    setDraftSelections((current) => {
      const values = current[group.id] ?? [];
      const nextValues = picksOne(group)
        ? checked ? [optionId] : values.filter((id) => id !== optionId)
        : checked ? [...values, optionId] : (() => { const next = [...values]; const index = next.lastIndexOf(optionId); if (index >= 0) next.splice(index, 1); return next; })();
      const next = { ...current, [group.id]: nextValues };
      const newlyOpened = group.options.find((option) => option.id === optionId)?.opensGroup;
      if (checked && newlyOpened && !next[newlyOpened.id]) next[newlyOpened.id] = newlyOpened.options.filter((option) => option.defaultSelected).map((option) => option.id);
      if (!checked && configuringItem) {
        const visibleGroups = new Set(openModifierGroups(configuringItem, next).map((candidate) => candidate.id));
        itemModifierGroups(configuringItem).forEach((candidate) => { if (!visibleGroups.has(candidate.id)) delete next[candidate.id]; });
      }
      return next;
    });
  };
  const updateQuantityOption = (group: ModifierGroup, optionId: string, change: 1 | -1) => {
    const selected = draftSelections[group.id] ?? [];
    const optionCount = selected.filter((id) => id === optionId).length;
    if (change > 0 && selected.length >= pickLimit(group)) return;
    if (change < 0 && optionCount === 0) return;
    updateDraftSelection(group, optionId, change > 0);
  };
  const confirmConfiguredItem = () => {
    if (!configuringItem) return;
    const groups = openModifierGroups(configuringItem, draftSelections);
    const invalid = groups.find((group) => {
      const count = draftSelections[group.id]?.length ?? 0;
      return group.appearance !== "TEXT" && group.appearance !== "TOGGLE" && (count < group.minPicks || count > pickLimit(group) || (group.required && count === 0));
    });
    if (invalid) { const limit = pickLimit(invalid); setModifierError(`${invalid.name}: choose ${invalid.minPicks === limit ? limit : `${invalid.minPicks}–${limit}`} option${limit === 1 ? "" : "s"}.`); return; }
    if (editingCartLineId) {
      setCart((current) => current.map((line) => line.id === editingCartLineId ? { ...line, quantity: draftQuantity, specialNotes: draftKitchenNote.trim(), modifierSelections: draftSelections } : line));
      setEditingCartLineId(null);
    } else {
      addToCart(configuringItem, draftSelections, draftQuantity, draftKitchenNote.trim());
      launchPlus(pendingAddOrigin.current, draftQuantity);
      pendingAddOrigin.current = null;
    }
    setConfiguringItem(null);
  };
  const closeItemEditor = () => { setConfiguringItem(null); setEditingCartLineId(null); pendingAddOrigin.current = null; };
  const removeCartLine = (lineId: string) => setCart((current) => current.filter((line) => line.id !== lineId));
  const updateCartQuantity = (lineId: string, quantity: number) => setCart((current) => current.map((line) => line.id === lineId ? { ...line, quantity: Math.max(1, Math.min(99, quantity)) } : line));
  const bumpMenuItem = (item: MenuItem, delta: 1 | -1, origin?: DOMRect | null) => {
    const lines = cart.filter((line) => line.item.id === item.id);
    if (delta > 0 && itemModifierGroups(item).length) { add(item, origin); return; }
    if (delta > 0 && !lines.length) { add(item, origin); return; }
    const target = lines[lines.length - 1];
    if (!target) return;
    if (delta < 0) {
      if (target.quantity <= 1) removeCartLine(target.id);
      else updateCartQuantity(target.id, target.quantity - 1);
      return;
    }
    updateCartQuantity(target.id, target.quantity + 1);
    launchPlus(origin ?? null);
  };
  const clearSentLine = async (orderId: string, itemId: string) => {
    setClearingId(itemId);
    try {
      const { data } = await api.delete(`/orders/${orderId}/items/${itemId}`);
      useOrderStore.getState().upsertOrder(data);
      setOpenSwipe(null);
    } catch (cause) {
      reportError(errorMessage(cause));
    } finally {
      setClearingId(null);
    }
  };
  const voidSentLine = async (orderId: string, itemId: string, reason: string) => {
    setClearingId(itemId);
    try {
      const { data } = await api.patch(`/orders/${orderId}/items/${itemId}/remove`, { reason });
      useOrderStore.getState().upsertOrder(data);
      setRemoval(null);
      setOpenSwipe(null);
    } catch (cause) {
      reportError(errorMessage(cause));
    } finally {
      setClearingId(null);
    }
  };
  const toggleSentFlag = async (orderId: string, itemId: string | undefined, flagged: boolean) => {
    if (!itemId || itemId.startsWith("local-")) return;
    try {
      const { data } = await api.patch(`/orders/${orderId}/items/${itemId}/kitchen-flag`, { flagged: !flagged });
      useOrderStore.getState().upsertOrder(data);
    } catch (cause) {
      reportError(errorMessage(cause));
    }
  };
  const placeOrder = async () => {
    if (roomService ? !stayId : !tableId || !selectedTable) {
      reportError(roomService ? "Open a checked-in room before sending room service." : "Return to the floor and open a table before sending an order.");
      return;
    }
    if (!cartLines.length) {
      reportError("Add at least one item to this order.");
      return;
    }
    setPlacing(true);
    setError("");
    const submittedLineIds = new Set<string>();
    let waitingToSend = false;
    try {
      const lines = cartLines;
      try {
        const { data: freshCategories } = await api.get<Category[]>("/categories");
        setCategories(freshCategories);
        writeOrderDesk({ categories: freshCategories, tables, stays: activeStays });
        await createOrder(
          roomService ? { roomStayId: stayId, paymentMethod: "ROOM_CHECKOUT", type: "ROOM_SERVICE" } : { tableId, ...(activeSplit ? { tableSplitId: activeSplit.id } : {}) },
          lines.map(({ item, quantity, specialNotes, modifierSelections, prepStation, kitchenFlag }) => {
            const selections = remapModifierSelections(freshCategories, item, modifierSelections);
            return {
            menuItemId: item.id,
            quantity,
            prepStation: item.prepStation ?? prepStation,
            kitchenFlag: Boolean(kitchenFlag),
            modifierSelections: openModifierGroups(liveMenuItem(freshCategories, item.id) ?? item, selections).filter((group) => group.appearance !== "TEXT").map((group) => ({ groupId: group.id, optionIds: selections[group.id] ?? [] })),
            ...([orderKitchenNote.trim() && `Order note: ${orderKitchenNote.trim()}`, specialNotes.trim()].filter(Boolean).length ? { specialNotes: [orderKitchenNote.trim() && `Order note: ${orderKitchenNote.trim()}`, specialNotes.trim()].filter(Boolean).join(" · ") } : {}),
            };
          }),
        );
      } catch (cause) {
        if (!(cause instanceof SavedLocallyError)) throw cause;
        waitingToSend = true;
        const now = new Date().toISOString();
        const note = orderKitchenNote.trim();
        const items = lines.map((line) => {
          const unitPrice = getLineUnitPrice(line.item, line.modifierSelections);
          return { id: `local-line-${line.id}`, menuItemId: line.item.id, quantity: line.quantity, unitPrice, subtotal: unitPrice * line.quantity, specialNotes: [note && `Order note: ${note}`, line.specialNotes.trim()].filter(Boolean).join(" · ") || null, modifierSelections: [], menuItem: slimTicketLine(line).item };
        });
        useOrderStore.getState().upsertOrder({
          id: `local-${cause.requestId || localId()}`,
          type: roomService ? "ROOM_SERVICE" : "DINE_IN",
          tableId: roomService ? null : tableId,
          tableSplitId: roomService ? null : activeSplit?.id ?? null,
          table: roomService ? null : selectedTable ? { ...selectedTable, tableNumber: `${selectedTable.tableNumber}${splits.length > 1 ? activeSplit?.label ?? "" : ""}` } : selectedTable,
          roomStayId: roomService ? stayId : null,
          paymentMethod: roomService ? "ROOM_CHECKOUT" : "CASH",
          paymentStatus: roomService ? "ROOM_FOLIO" : "UNPAID",
          waiterId: currentUser?.id ?? "local",
          waiter: { id: currentUser?.id ?? "local", name: currentUser?.name ?? "This device" },
          status: "PENDING",
          totalAmount: items.reduce((sum, line) => sum + Number(line.subtotal), 0),
          items,
          createdAt: now,
          updatedAt: now,
        });
      }
      lines.forEach((line) => submittedLineIds.add(line.id));
      if (waitingToSend) {
        setCart((current) => current.filter((line) => !submittedLineIds.has(line.id)));
        setOrderKitchenNote("");
        notify("Saved on this device. It stays on the ticket and goes to the kitchen when the connection returns.");
        return;
      }
      const sentKitchen = cartLines.some((line) => (line.prepStation ?? "KITCHEN") === "KITCHEN");
      const sentBar = cartLines.some((line) => line.prepStation === "BAR");
      setCart([]);
      setOrderKitchenNote("");
      const { data } = await api.get<DiningTable[]>("/tables");
      setTables(data);
      await fetchOrders();
      notify(!sentKitchen && !sentBar ? "Saved on the ticket." : sentKitchen && sentBar ? "Order sent to the kitchen and the bar." : sentKitchen ? "Order sent to the kitchen." : "Order sent to the bar.");
    } catch (e) {
      if (submittedLineIds.size) setCart((current) => current.filter((line) => !submittedLineIds.has(line.id)));
      reportError(errorMessage(e));
    } finally {
      setPlacing(false);
    }
  };
  const movePartyToTable = async (nextId: string) => {
    if (!tableId || nextId === tableId || movingTable) return;
    setMovingTable(true);
    setError("");
    try {
      const { data } = await api.post<{ tables: DiningTable[]; orders: Order[] }>(`/tables/${tableId}/move`, { tableId: nextId });
      const nextTables = tables.map((table) => data.tables.find((updated) => updated.id === table.id) ?? table);
      setTables(nextTables);
      writeOrderDesk({ categories, tables: nextTables, stays: activeStays });
      for (const order of data.orders) upsertOrder(order);
      const destination = nextTables.find((table) => table.id === nextId);
      for (const order of orders) {
        if (!order.id.startsWith("local-") || order.tableId !== tableId) continue;
        if (!["PENDING", "PREPARING", "READY", "SERVED"].includes(order.status)) continue;
        upsertOrder({ ...order, tableId: nextId, table: order.table && destination ? { ...order.table, id: destination.id, tableNumber: destination.tableNumber, status: "OCCUPIED" } : order.table });
      }
      retargetQueuedTable(tableId, nextId);
      const stored = readOpenTickets();
      const nextKey = `${nextId}${ticketStorageKey.slice(tableId.length)}`;
      for (const key of Object.keys(stored)) {
        if (key !== tableId && !key.startsWith(`${tableId}:`)) continue;
        const destKey = `${nextId}${key.slice(tableId.length)}`;
        const sourceLines = key === ticketStorageKey ? cart : stored[key]?.lines ?? [];
        const sourceNote = key === ticketStorageKey ? orderKitchenNote : stored[key]?.note ?? "";
        const there = destKey === key ? undefined : stored[destKey];
        const lines = key === ticketStorageKey ? [...(there?.lines ?? []), ...sourceLines] : sourceLines;
        const note = key === ticketStorageKey ? [there?.note, sourceNote].map((entry) => entry?.trim()).filter(Boolean).join(" · ") : sourceNote;
        delete stored[key];
        if (lines.length || note.trim()) stored[destKey] = { lines: lines.map(slimTicketLine), note };
      }
      writeOpenTickets(stored);
      const moved = readOpenTicket(nextKey);
      setCart(moved.lines);
      setOrderKitchenNote(moved.note);
      ticketTableRef.current = nextKey;
      navigate(`/tables/${nextId}`);
    } catch (cause) {
      reportError(errorMessage(cause));
    } finally {
      setMovingTable(false);
    }
  };
  const rememberSplit = (table: DiningTable, ordersToKeep: Order[]) => {
    setTables((current) => current.map((entry) => entry.id === table.id ? table : entry));
    for (const order of ordersToKeep) upsertOrder(order);
    setActiveSplitId((current) => table.splits?.some((split) => split.id === current) ? current : table.splits?.[0]?.id ?? "");
  };
  const addTableSplit = async () => {
    if (!tableId || addingSplit) return;
    setAddingSplit(true);
    setError("");
    try {
      const { data } = await api.post<{ table: DiningTable; orders: Order[] }>(`/tables/${tableId}/splits`);
      rememberSplit(data.table, data.orders);
      const first = [...(data.table.splits ?? [])].sort((left, right) => left.position - right.position)[0];
      if (first && !(selectedTable?.splits ?? []).length) setActiveSplitId(first.id);
    } catch (cause) {
      reportError(errorMessage(cause));
    } finally {
      setAddingSplit(false);
    }
  };
  const removeTableSplit = async (splitId: string) => {
    if (!tableId || addingSplit || splits.length <= 1 || sideCount(splitId) > 0) return;
    setAddingSplit(true);
    setError("");
    try {
      const { data } = await api.delete<{ table: DiningTable; orders: Order[] }>(`/tables/${tableId}/splits/${splitId}`);
      const stored = readOpenTickets();
      delete stored[`${tableId}:${splitId}`];
      writeOpenTickets(stored);
      rememberSplit(data.table, data.orders);
    } catch (cause) {
      reportError(errorMessage(cause));
    } finally {
      setAddingSplit(false);
    }
  };
  const setSplitRoom = async (roomStayId: string | null) => {
    if (!tableId || !activeSplit) return;
    setSavingRoomAssignments(true);
    setError("");
    try {
      const { data } = await api.patch<{ table: DiningTable }>(`/tables/${tableId}/splits/${activeSplit.id}`, { roomStayId });
      rememberSplit(data.table, []);
    } catch (cause) {
      reportError(errorMessage(cause));
    } finally {
      setSavingRoomAssignments(false);
    }
  };
  const assignRoomsToTable = async (nextRoomStayIds: string[]) => {
    if (!selectedTable) return;
    setError("");
    setSavingRoomAssignments(true);
    try {
      const { data } = await api.patch<DiningTable>(`/tables/${tableId}/room-assignment`, {
        roomStayIds: nextRoomStayIds,
      });
      setTables((current) => current.map((table) => table.id === data.id ? data : table));
      notify(t(nextRoomStayIds.length ? "Guest rooms assigned to this table." : "Guest room assignments cleared."));
    } catch (cause) {
      reportError(errorMessage(cause));
    } finally {
      setSavingRoomAssignments(false);
    }
  };

  const configureGroups = configuringItem ? openModifierGroups(configuringItem, draftSelections) : [];
  const currentConfigGroup = modifierPickerMode === "step" ? configureGroups[configStep] : undefined;
  const stepCanContinue = currentConfigGroup ? currentConfigGroup.appearance === "TOGGLE" ? true : currentConfigGroup.appearance === "TEXT"
    ? !currentConfigGroup.required || Boolean(draftKitchenNote.trim())
    : (draftSelections[currentConfigGroup.id]?.length ?? 0) >= currentConfigGroup.minPicks : false;
  const advanceConfigStep = () => {
    setModifierError("");
    if (configStep >= configureGroups.length - 1) confirmConfiguredItem();
    else setConfigStep((step) => step + 1);
  };
  const configuredItemPrice = configuringItem ? getLineUnitPrice(configuringItem, draftSelections) : 0;
  function renderModifierGroup(group: ModifierGroup, depth = 0, parentOption?: { name: string; nameMy?: string; nameTh?: string }): JSX.Element {
    const selected = draftSelections[group.id] ?? [];
    const groupOptions = group.options.filter((option) => option.active);
    const limit = pickLimit(group);
    const groupDone = group.appearance === "TEXT" ? (!group.required || Boolean(draftKitchenNote.trim())) : group.appearance === "TOGGLE" ? true : selected.length >= group.minPicks && selected.length <= limit;
    const childForOption = (optionId: string) => {
      const option = groupOptions.find((candidate) => candidate.id === optionId);
      const child = option?.opensGroup && selected.includes(option.id) ? configureGroups.find((candidate) => candidate.id === option.opensGroup?.id) : undefined;
      return modifierPickerMode === "list" && child && option ? renderModifierGroup(child, depth + 1, option) : null;
    };
    const groupBody = group.appearance === "TEXT" ? <textarea value={draftKitchenNote} onChange={(event) => setDraftKitchenNote(event.target.value)} className="min-h-20 w-full resize-y rounded-lg border border-line px-3 py-2 text-xs outline-none focus:border-[#ed168c]" placeholder="Add a note for the kitchen" /> : group.appearance === "QUANTITY" ? <div className="grid gap-2 sm:grid-cols-2">
      {groupOptions.map((option) => {
        const count = selected.filter((id) => id === option.id).length;
        const addedPrice = selected.length < group.includedPicks ? 0 : Number(option.priceAdjustment) + Number(group.extraPickPrice ?? 0);
        return <div key={option.id}>
          <div className={`flex min-h-[72px] items-center gap-3 rounded-xl border px-3 py-2.5 ${count ? "border-[#ed168c] bg-[#fff8fb]" : "border-line bg-white"}`}>
            <div className="min-w-0 flex-1"><p className="text-xs font-semibold">{modifierLabel(option, language)}</p>{language !== "en" && option.name !== modifierLabel(option, language) && <p className="text-[10px] text-muted">{option.name}</p>}<p className="mt-1 text-[10px] font-semibold text-muted">{addedPrice > 0 ? `+${money(addedPrice)}` : "Included"}</p></div>
            <div className="flex h-8 shrink-0 items-center rounded-lg bg-[#fff4f9] p-0.5"><button type="button" aria-label={`Remove one ${modifierLabel(option, language)}`} disabled={!count} onClick={() => updateQuantityOption(group, option.id, -1)} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white disabled:opacity-30"><Minus size={12} /></button><span className="w-6 text-center text-[11px] font-bold">{count}</span><button type="button" aria-label={`Add one ${modifierLabel(option, language)}`} disabled={selected.length >= limit} onClick={() => updateQuantityOption(group, option.id, 1)} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white disabled:opacity-30"><Plus size={12} /></button></div>
          </div>
          {childForOption(option.id)}
        </div>;
      })}
    </div> : group.appearance === "SLIDER" && groupOptions.length > 0 ? <div className="rounded-xl border border-line px-4 py-4">
      <h4 className="text-sm font-bold">How {modifierLabel(group, language).toLowerCase()} is it?</h4>
      <p className="mb-4 mt-1 text-[11px] text-muted">Slide to a level. The kitchen makes it this way unless the guest asks for different.</p>
      <LevelSlider labels={groupOptions.map((option) => modifierLabel(option, language))} value={Math.max(0, groupOptions.findIndex((option) => selected.includes(option.id)))} onChange={(index) => updateDraftSelection(group, groupOptions[index].id, true)} ariaLabel={`Choose ${modifierLabel(group, language)} level`} />
      {modifierPickerMode === "list" && selected[0] && childForOption(selected[0])}
    </div> : group.appearance === "TOGGLE" ? <div className="space-y-2">{groupOptions.map((option) => { const on = selected.includes(option.id); const price = Number(option.priceAdjustment); return <div key={option.id} className={`flex min-h-[62px] items-center gap-3 rounded-xl border px-3 py-2.5 ${on ? "border-[#ed168c] bg-[#fff8fb]" : "border-line bg-white"}`}><div className="min-w-0 flex-1"><p className="text-xs font-semibold">{modifierLabel(option, language)}</p><p className="mt-0.5 text-[10px] text-muted">{on ? "Included" : "Not included"}{on && price > 0 ? ` · +${money(price)}` : ""}</p></div><button type="button" role="switch" aria-checked={on} aria-label={`${on ? "Leave out" : "Include"} ${modifierLabel(option, language)}`} onClick={() => updateDraftSelection(group, option.id, !on)} className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-[#ed168c]" : "bg-[#efe4ea]"}`}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition ${on ? "left-[22px]" : "left-0.5"}`} /></button></div>; })}</div> : <div className="grid gap-2 sm:grid-cols-2">
      {groupOptions.map((option) => {
        const isSelected = selected.includes(option.id);
        const atLimit = selected.length >= limit;
        const chargeIndex = isSelected ? selected.slice(0, selected.indexOf(option.id)).length : selected.length;
        const price = chargeIndex < group.includedPicks ? 0 : Number(option.priceAdjustment) + Number(group.extraPickPrice ?? 0);
        return <div key={option.id}>
          <label className={`flex min-h-[62px] cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${isSelected ? "border-[#ed168c] bg-[#fff8fb]" : "border-line bg-white hover:border-[#ed168c]/40"}`}>
            <input type={picksOne(group) ? "radio" : "checkbox"} name={`modifier-${group.id}`} checked={isSelected} disabled={!picksOne(group) && !isSelected && atLimit} onChange={(event) => { updateDraftSelection(group, option.id, picksOne(group) ? true : event.target.checked); if (modifierPickerMode === "step" && picksOne(group) && event.target.checked) setConfigStep((step) => step + 1); }} className="h-4 w-4 accent-[#ed168c]" />
            <span className="min-w-0 flex-1"><span className="block text-xs font-semibold">{modifierLabel(option, language)}</span>{language !== "en" && option.name !== modifierLabel(option, language) && <span className="block text-[10px] text-muted">{option.name}</span>}</span>
            <span className="shrink-0 text-[10px] font-semibold text-muted">{price > 0 ? `+${money(price)}` : "Included"}</span>
          </label>
          {childForOption(option.id)}
        </div>;
      })}
    </div>;
    return <section key={group.id} className={depth ? "mt-2 rounded-lg border-l-[3px] border-l-[#f7c5df] bg-[#fff8fb] p-3" : "rounded-xl border border-[#f1dfe9] bg-white p-4"}>
      {parentOption && <p className="mb-2 text-[10px] font-semibold text-muted">Because you picked {modifierLabel(parentOption, language)}</p>}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#fff0f7] text-[#d90c7d]"><ModifierGroupIcon name={group.icon} size={16} /></span><div className="min-w-0"><h3 className="text-sm font-bold">{modifierLabel(group, language)}{language !== "en" && group.name ? <span className="ml-1 font-normal text-muted">{group.name}</span> : null}</h3><p className="mt-0.5 text-[10px] text-muted">{group.required ? "Required" : "Optional"}{group.appearance === "TEXT" ? " · Free text" : group.appearance === "TOGGLE" ? " · Include or leave out" : ` · Pick ${group.minPicks === limit ? limit : `${group.minPicks}–${limit}`}`}</p></div></div>
        <div className="shrink-0 text-right"><span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${groupDone ? "bg-emerald-50 text-emerald-700" : "bg-[#f5f5f4] text-muted"}`}>{groupDone ? "Done" : group.required ? "Required" : "Optional"}</span><p className="mt-1 text-[10px] text-muted">{group.appearance === "TEXT" ? "Free text" : group.appearance === "TOGGLE" ? `${selected.length} included` : `${selected.length} picked`}</p></div>
      </div>
      {groupBody}
    </section>;
  }

  return (
    <>
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${androidTicket ? "" : "md:pr-[18.25rem] lg:pr-[20rem]"}`}>
      <div className="shrink-0 bg-canvas pt-4 md:pt-6">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search any dish or drink"
            className="focus-ring h-11 w-full rounded-xl border border-line bg-white pl-10 pr-11 text-sm outline-none focus:border-olive"
          />
          {search && (
            <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-[#fff1f8] hover:text-[#d90c7d]">
              <X size={15} />
            </button>
          )}
        </div>
        <div className="mb-4 mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-[.16em] text-[#e21888]">{roomService ? "Room · Room service" : "Floor · New ticket"}</p>
            <h1 className="mt-1.5 font-display text-[30px] font-extrabold leading-tight tracking-[-.05em] text-ink sm:text-[34px]">Build an order</h1>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-muted sm:text-sm">{roomService ? `Add dishes for ${roomServiceStay ? `Room ${roomServiceStay.room?.roomNumber}` : "this room"} and send them straight to the kitchen.` : showingDishes ? "Choose a table, add a few good things, and send it straight to the kitchen." : "Pick a category to see its dishes, or search for anything."}</p>
          </div>
          {showingDishes ? (
            <button type="button" onClick={leaveDishes} className="inline-flex h-fit shrink-0 items-center gap-1.5 rounded-xl border border-line bg-white px-3.5 py-2.5 text-xs font-semibold transition hover:border-[#ed168c]/40 hover:text-[#d90c7d]"><ChevronLeft size={14} /> Back to categories</button>
          ) : (
            <button onClick={() => navigate(roomService ? "/rooms" : "/tables")} className="h-fit shrink-0 rounded-xl border border-line bg-white px-3.5 py-2.5 text-xs font-semibold transition hover:border-[#ed168c]/40 hover:text-[#d90c7d]">{roomService ? "Back to rooms" : "Back to tables"}</button>
          )}
        </div>
        {showingDishes && (
            <div aria-label="Menu categories" className="scrollbar-hide mb-5 flex gap-2 overflow-x-auto pb-1">
              {["All", ...categories.filter((category) => visibleCategory(category.name)).map((category) => category.name)].map((name) => (
                <button
                  key={name}
                  onClick={() => { setSelectedCategory(name); setBrowsingDishes(true); setSearch(""); }}
                  className={`shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-xs font-semibold transition ${selectedCategory === name ? "bg-[#ed168c] text-white" : "border border-line bg-white text-[#697066] hover:border-[#ed168c]/40 hover:text-[#d90c7d]"}`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            >
              {error}
            </div>
          )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
          {!showingDishes ? (
            <div className="space-y-5">
              {menuSections.map((section) => (
                <section key={section.key}>
                  <h2 className="mb-2.5 text-[11px] font-extrabold uppercase tracking-[.16em] text-[#8d939c]">{section.key}</h2>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {section.categories.map((category) => {
                      const Icon = categoryIcon(category.name);
                      const count = category.items?.length ?? 0;
                      const tone = sectionTone[section.key];
                      const noun = section.key === "Food" ? (count === 1 ? "dish" : "dishes") : (count === 1 ? "drink" : "drinks");
                      return (
                        <button key={category.id} type="button" onClick={() => { setSelectedCategory(category.name); setBrowsingDishes(true); setSearch(""); }} className={`rounded-[22px] px-4 py-3.5 text-left transition hover:brightness-[0.98] ${tone.card}`}>
                          <span className={`grid h-9 w-9 place-items-center rounded-full ${tone.icon}`}><Icon size={17} strokeWidth={2.1} /></span>
                          <span className="mt-3 block font-display text-[15px] font-extrabold leading-5 text-ink">{category.name}</span>
                          <span className={`mt-0.5 block text-[12px] font-semibold ${tone.count}`}>{count} {noun}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
              {!menuSections.length && (
                <Panel>
                  <EmptyState icon={Utensils} title="No categories yet" body="Add menu categories and they will show up here." />
                </Panel>
              )}
            </div>
          ) : menuItems.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {menuItems.map((item, index) => {
                const quantity = cart.reduce((sum, line) => line.item.id === item.id ? sum + line.quantity : sum, 0);
                const Icon = categoryIcon(item.category?.name ?? "");
                return (
                <article
                  key={item.id}
                  onClick={(event) => bumpMenuItem(item, 1, event.currentTarget.querySelector("[data-add-mark]")?.getBoundingClientRect() ?? null)}
                  className="group cursor-pointer overflow-hidden rounded-[24px] border border-[#f0e1e9] bg-white text-left shadow-card transition hover:border-[#ed168c]/40"
                >
                  <div
                    className={`relative flex h-28 items-start overflow-hidden bg-gradient-to-br ${categoryColors[index % categoryColors.length]} p-4`}
                  >
                    {item.imageUrl ? (
                      <img
                        src={mediaSrc(item.imageUrl)}
                        alt=""
                        className="absolute inset-0 h-28 w-full object-cover"
                      />
                    ) : (
                      <>
                        <div className="absolute -right-6 -top-10 h-36 w-36 rounded-full border-[18px] border-white/40" />
                        <div className="absolute right-8 top-6 h-16 w-16 rounded-full bg-white/40" />
                      </>
                    )}
                    <span className="relative z-10 inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-white/90 px-2 py-1 text-[10px] font-extrabold uppercase tracking-[.08em] text-[#e21888]">
                      <Icon size={12} />
                      {item.category?.name}
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-[16px] font-extrabold leading-5">
                        {item.name}
                      </h3>
                      <span className="shrink-0 text-[14px] font-bold">
                        {money(item.price)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-muted">
                      {item.description ||
                        "Prepared fresh by our kitchen team."}
                    </p>
                    {(item.allergens?.length || item.dietaryInfo?.length) ? (
                      <div className="mt-2 space-y-1">
                        {item.allergens?.length ? <p className="text-[10px] font-semibold text-amber-800">{language === "my" ? "ပါဝင်သည်:" : language === "th" ? "มี:" : "Contains:"} {localizedFoodLabels(item.allergens, item.allergensMy, item.allergensTh, language).join(", ")}</p> : null}
                        {item.dietaryInfo?.length ? <p className="text-[10px] font-semibold text-emerald-800">{localizedFoodLabels(item.dietaryInfo, item.dietaryInfoMy, item.dietaryInfoTh, language).join(", ")}</p> : null}
                      </div>
                    ) : null}
                    {item.availableExtras?.length ? <p className="mt-1 truncate text-[10px] text-sky-800">{language === "my" ? "အပိုထည့်စရာ:" : language === "th" ? "รายการเพิ่มเติม:" : "Extras:"} {localizedFoodLabels(item.availableExtras, item.availableExtrasMy, item.availableExtrasTh, language).join(", ")}</p> : null}
                    <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                      <span className="text-[12px] text-muted">{quantity ? "On the ticket" : "Tap to choose"}</span>
                      {quantity ? (
                        <div data-add-mark className="flex h-8 items-center rounded-lg bg-[#fff4f9] p-0.5" onClick={(event) => event.stopPropagation()}>
                          <button type="button" aria-label={`Remove one ${item.name}`} onClick={() => bumpMenuItem(item, -1)} className="grid h-7 w-7 place-items-center rounded-md text-[#d90c7d] hover:bg-white"><Minus size={12} /></button>
                          <span className="w-6 text-center text-[11px] font-bold text-[#d90c7d]">{quantity}</span>
                          <button type="button" aria-label={`Add one ${item.name}`} onClick={(event) => bumpMenuItem(item, 1, event.currentTarget.getBoundingClientRect())} className="grid h-7 w-7 place-items-center rounded-md text-[#d90c7d] hover:bg-white"><Plus size={12} /></button>
                        </div>
                      ) : (
                        <span data-add-mark className="grid h-9 w-9 place-items-center rounded-xl bg-[#fff0f7] text-[#d90c7d] transition group-hover:bg-[#ed168c] group-hover:text-white"><Plus size={16} /></span>
                      )}
                    </div>
                  </div>
                </article>
              );})}
            </div>
          ) : (
            <Panel>
              <EmptyState
                icon={Search}
                title="No dishes found"
                body="Try another search or pick a different menu category."
              />
            </Panel>
          )}
        </div>
        {androidTicket && ticketOpen && (
          <button
            type="button"
            aria-label="Close ticket"
            onClick={() => setTicketOpen(false)}
            className="fixed inset-0 z-40 bg-black/40"
          />
        )}
        {androidTicket && (
          <button
            type="button"
            onClick={() => setTicketOpen(true)}
            className={`fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-30 items-center gap-2 rounded-full bg-[#ed168c] px-4 py-3 text-sm font-bold text-white shadow-float ${ticketOpen ? "hidden" : "flex"}`}
          >
            <ShoppingBag size={18} />
            Ticket
            <span className="grid min-w-5 place-items-center rounded-full bg-white px-1.5 text-xs font-extrabold text-[#d90c7d]">
              {cartCount}
            </span>
          </button>
        )}
        <Panel className={androidTicket
          ? `fixed inset-y-0 right-0 z-50 flex h-dvh w-[min(22rem,88vw)] flex-col overflow-hidden shadow-float transition-transform duration-300 !rounded-r-none ${ticketOpen ? "translate-x-0" : "pointer-events-none translate-x-full"}`
          : "fixed bottom-5 right-5 top-8 z-30 flex w-80 min-h-0 flex-col overflow-hidden"}>
          <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-4">
            {roomService ? <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 border-b-2 border-[#2a2430] py-1.5 pl-1.5 text-[13px] font-bold text-ink">Room service<span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#ed168c] px-1 text-[11px] font-bold text-white">{wholeCount}</span></div>
              <p className="mt-1 text-[12px] text-[#8d939c]">{roomServiceStay ? `Room ${roomServiceStay.room?.roomNumber} · ${roomServiceStay.primaryGuestName}` : "Charged to this room"}</p>
            </div> : splits.length ? <div className="min-w-0 flex-1">
              <div className="scrollbar-hide flex items-end gap-1 overflow-x-auto">
                {splits.map((split) => {
                  const selected = split.id === activeSplit?.id;
                  const occupied = sideCount(split.id) > 0;
                  const lone = splits.length <= 1;
                  const locked = occupied || lone;
                  return <div key={split.id} className={`flex shrink-0 items-center gap-0.5 border-b-2 ${selected ? "border-[#2a2430]" : "border-transparent"}`}>
                    <button type="button" onClick={() => setActiveSplitId(split.id)} className={`flex items-center gap-1.5 py-1.5 pl-1.5 text-[13px] ${selected ? "font-bold text-ink" : "font-semibold text-[#8d939c]"}`}>{tableTitle}{lone ? "" : split.label}<span className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold ${selected ? "bg-[#ed168c] text-white" : "bg-[#efe8ec] text-[#8d939c]"}`}>{sideCount(split.id)}</span></button>
                    <button type="button" aria-label={`Close ${tableTitle}${lone ? "" : split.label}`} title={occupied ? "This side still has an order" : lone ? "This is the only side" : `Close ${tableTitle}${split.label}`} disabled={locked || addingSplit} onClick={() => void removeTableSplit(split.id)} className="grid h-5 w-5 place-items-center rounded-full text-[#8d939c] hover:bg-[#efe8ec] hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"><X size={12} /></button>
                  </div>;
                })}
                <button type="button" aria-label="Add a side of this table" disabled={addingSplit} onClick={() => void addTableSplit()} className="mb-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[#8d939c] hover:bg-white disabled:opacity-40"><Plus size={16} /></button>
              </div>
              <p className="mt-1 text-[12px] text-[#8d939c]">{headerRoom || "Choose a room for this side"}</p>
            </div> : selectedTable ? <div className="min-w-0 flex-1">
              <div className="flex items-end gap-1">
                <div className="flex items-center gap-1.5 border-b-2 border-[#2a2430] py-1.5 pl-1.5 text-[13px] font-bold text-ink">{tableTitle}<span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#ed168c] px-1 text-[11px] font-bold text-white">{wholeCount}</span></div>
                <button type="button" aria-label="Split this table" disabled={addingSplit} onClick={() => void addTableSplit()} className="mb-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[#8d939c] hover:bg-white disabled:opacity-40"><Plus size={16} /></button>
              </div>
              {headerRoom && <p className="mt-1 text-[12px] text-[#8d939c]">{headerRoom}</p>}
            </div> : <div className="min-w-0">
              <h2 className="font-display text-[16px] font-bold tracking-[-.02em]">Current ticket</h2>
              <p className="mt-0.5 text-[12px] text-[#8d939c]">Choose a table</p>
            </div>}
            <div className="flex shrink-0 items-center gap-2">
              <button ref={ticketMarkRef} type="button" aria-label="Ticket actions" aria-expanded={ticketMenu !== "closed"} onClick={() => { const rect = ticketMarkRef.current?.getBoundingClientRect(); if (rect) setTicketMenuBox({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) }); setTicketMenu((current) => current === "closed" ? "actions" : "closed"); }} className="grid h-9 w-9 place-items-center rounded-xl bg-[#ffe4f2] text-[#f2168d]">
                <MoreHorizontal size={18} />
              </button>
              {ticketMenu !== "closed" && ticketMenuBox && createPortal(<>
                <div className="fixed inset-0 z-[80]" onPointerDown={() => setTicketMenu("closed")} />
                <div style={{ top: ticketMenuBox.top, right: ticketMenuBox.right }} className="fixed z-[90] w-64 overflow-hidden rounded-xl border border-line bg-white p-1.5 shadow-float">
                  {ticketMenu === "actions" ? <>
                    {!roomService && <button type="button" disabled={!selectedTable || movingTable} onClick={() => setTicketMenu("tables")} className="flex min-h-10 w-full items-center rounded-lg px-2.5 text-left text-[13px] font-semibold text-ink hover:bg-canvas disabled:opacity-40">Move table</button>}
                    {!roomService && <button type="button" disabled={!selectedTable || savingRoomAssignments} onClick={() => setTicketMenu("guests")} className="flex min-h-10 w-full items-center rounded-lg px-2.5 text-left text-[13px] font-semibold text-ink hover:bg-canvas disabled:opacity-40">Who&apos;s at the table</button>}
                    <button type="button" onClick={() => setTicketMenu("note")} className="flex min-h-10 w-full items-center rounded-lg px-2.5 text-left text-[13px] font-semibold text-ink hover:bg-canvas">Kitchen note</button>
                  </> : ticketMenu === "tables" ? <>
                    <button type="button" onClick={() => setTicketMenu("actions")} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] font-semibold text-ink hover:bg-canvas"><ChevronLeft size={15} /> Back</button>
                    <div className="max-h-64 overflow-y-auto">
                      {tables.map((table) => {
                        const selected = table.id === selectedTable?.id;
                        const label = /^table\b/i.test(table.tableNumber) ? table.tableNumber : `Table ${table.tableNumber}`;
                        return <button key={table.id} type="button" disabled={movingTable} onClick={() => { setTicketMenu("closed"); if (!selected) void movePartyToTable(table.id); }} className={`flex min-h-10 w-full items-center rounded-lg px-2.5 text-left text-[13px] font-semibold disabled:opacity-60 ${selected ? "bg-[#fff1f8] text-[#d90c7d]" : "text-ink hover:bg-canvas"}`}>{label}</button>;
                      })}
                      {!tables.length && <p className="px-2.5 py-2 text-[11px] text-muted">No tables yet</p>}
                    </div>
                  </> : ticketMenu === "guests" ? <>
                    <button type="button" onClick={() => setTicketMenu("actions")} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] font-semibold text-ink hover:bg-canvas"><ChevronLeft size={15} /> Back</button>
                    <div className="max-h-64 overflow-y-auto">
                      {activeStays.map((stay) => {
                        const selected = activeSplit ? activeSplit.roomStayId === stay.id : assignedRoomStayIds.includes(stay.id);
                        return <button key={stay.id} type="button" disabled={savingRoomAssignments} onClick={() => {
                          if (activeSplit) { void setSplitRoom(selected ? null : stay.id); return; }
                          const next = selected ? assignedRoomStayIds.filter((id) => id !== stay.id) : [...assignedRoomStayIds, stay.id];
                          void assignRoomsToTable(next);
                        }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] font-semibold text-ink hover:bg-canvas disabled:opacity-60">
                          <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${selected ? "border-[#ed168c] bg-[#ed168c] text-white" : "border-[#d9c3cf]"}`}>{selected && <Check size={11} />}</span>
                          <span className="min-w-0 truncate">Room {stay.room?.roomNumber} · {stay.primaryGuestName}</span>
                        </button>;
                      })}
                      {!activeStays.length && <p className="px-2.5 py-2 text-[11px] text-muted">No one is checked in.</p>}
                    </div>
                  </> : <>
                    <button type="button" onClick={() => setTicketMenu("actions")} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] font-semibold text-ink hover:bg-canvas"><ChevronLeft size={15} /> Back</button>
                    <div className="px-2.5 pb-1.5 pt-1">
                      <label className="block text-[12px] font-semibold text-ink">
                        Note for kitchen <span className="font-normal text-muted">(optional)</span>
                        <textarea
                          value={orderKitchenNote}
                          onChange={(event) => setOrderKitchenNote(event.target.value)}
                          placeholder="Add a note for this ticket"
                          rows={3}
                          className="mt-1.5 w-full resize-y rounded-xl border border-[#eadfe6] bg-white px-3 py-2 text-xs font-normal text-ink outline-none transition placeholder:text-muted focus:border-[#ed168c]"
                        />
                      </label>
                      <button type="button" onClick={() => setTicketMenu("closed")} className="mt-2 flex h-9 w-full items-center justify-center rounded-xl bg-[#ed168c] text-[13px] font-bold text-white">Confirm</button>
                    </div>
                  </>}
                </div>
              </>, document.body)}
            </div>
            {androidTicket && (
              <button type="button" onClick={() => setTicketOpen(false)} aria-label="Close ticket" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-canvas hover:text-ink">
                <X size={18} />
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
            {(selectedTable || roomService) && <div className="relative z-20 border-b border-[#f3e6ec] pb-4">
              <p className="text-[12px] font-medium text-[#3c4248]">{roomService ? "Room service" : "At this table"}</p>
              {!roomService && roomPayers.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {roomPayers.map((payer, index) => {
                  const tone = ["bg-[#efe6fb] text-[#6a5a86]", "bg-[#fde7d8] text-[#c56b45]"][index % 2];
                  return <span key={payer.id} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{payer.label}</span>;
                })}
              </div>}
              {activeTableOrders.length > 0 && <div className="mt-3 space-y-2.5">
                {activeTableOrders.flatMap((order) => order.items.map((line, index) => {
                  const removed = Boolean(line.removedAt);
                  const fromRoom = Boolean(order.roomStayId) || roomPayers.length > 0;
                  const detail = [line.modifierSelections?.map((selection) => `${selection.groupName}: ${selection.options.map((option) => option.name).join(", ")}`).join(" · "), line.removeIngredients && `No ${line.removeIngredients}`, line.addExtras && line.addExtras, line.specialNotes].filter(Boolean).join(" · ");
                  const amount = lineAmount(line);
                  const rowKey = line.id ?? `${order.id}-${index}`;
                  const canClear = Boolean(line.id && !line.id.startsWith("local-") && !removed);
                  const row = <div className={`flex items-start justify-between gap-3 px-1 py-2.5 ${removed ? "text-[#a398a0]" : ""}`}>
                    <div className="min-w-0">
                      <div className="flex items-start gap-1.5">
                        <p className={`min-w-0 truncate text-[13px] font-bold leading-5 ${removed ? "line-through" : ""}`}><span className={`mr-1 ${removed ? "text-[#a398a0]" : "text-[#d80c7c]"}`}>{line.quantity}×</span>{line.menuItem.name}</p>
                        {canClear && <DishCommentButton flagged={Boolean(line.kitchenFlag)} label={line.menuItem.name} onClick={() => void toggleSentFlag(order.id, line.id, Boolean(line.kitchenFlag))} />}
                      </div>
                      {detail && <p className={`mt-0.5 text-[11px] leading-4 text-[#8d939c] ${removed ? "line-through" : ""}`}>{detail}</p>}
                      {removed && <p className="mt-0.5 text-[11px] leading-4 text-[#8d939c]">Removed · {line.removalReason || "No reason given"}</p>}
                    </div>
                    <span className={`shrink-0 text-[13px] font-semibold tabular-nums ${removed ? "line-through" : ""}`}>{money(removed ? Number(line.subtotal ?? 0) : amount)}</span>
                  </div>;
                  const reasonForm = fromRoom && line.id && removal?.itemId === line.id ? <form className="flex items-center gap-2 px-1 pb-2" onSubmit={(event) => { event.preventDefault(); const next = removal.reason.trim(); if (!next) return; void voidSentLine(order.id, line.id!, next); }}>
                    <input value={removal.reason} onChange={(event) => setRemoval({ ...removal, reason: event.target.value })} placeholder="Why is this dish removed?" maxLength={240} className="h-8 min-w-0 flex-1 rounded-lg border border-[#eadfe6] bg-white px-2 text-[11px] outline-none focus:border-[#ed168c]" />
                    <button type="submit" disabled={clearingId === line.id || !removal.reason.trim()} className="h-8 rounded-lg bg-[#2a2430] px-2.5 text-[11px] font-bold text-white disabled:opacity-40">Done</button>
                  </form> : null;
                  if (removed || !canClear || !line.id) return <div key={rowKey}>{row}</div>;
                  if (fromRoom) return <SwipeClearRow key={rowKey} rowKey={rowKey} tone="edit" open={openSwipe === rowKey} busy={clearingId === line.id} label={line.menuItem.name} onOpen={setOpenSwipe} onClear={() => { setRemoval({ orderId: order.id, itemId: line.id!, reason: "" }); setOpenSwipe(null); }}>{row}{reasonForm}</SwipeClearRow>;
                  return <SwipeClearRow key={rowKey} rowKey={rowKey} open={openSwipe === rowKey} busy={clearingId === line.id} label={line.menuItem.name} onOpen={setOpenSwipe} onClear={() => void clearSentLine(order.id, line.id!)}>{row}</SwipeClearRow>;
                }))}
              </div>}
            </div>}
            {cartLines.length ? (
              <div className="mt-4 space-y-3">
                {cartLines.map((line) => {
                  const unitPrice = getLineUnitPrice(line.item, line.modifierSelections);
                  const modifierLines = selectedModifierLines(line.item, line.modifierSelections);
                  const detail = [modifierLines.map((modifier) => `${modifier.name}${modifier.count > 1 ? ` ×${modifier.count}` : ""}`).join(", "), line.specialNotes].filter(Boolean).join(" · ");
                  const configured = itemModifierGroups(line.item).length > 0;
                  return <article key={line.id} className="border-b border-[#f3e6ec] pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-start gap-1.5">
                          <p className="min-w-0 truncate text-[13px] font-bold leading-5">{line.item.name}</p>
                          <DishCommentButton flagged={Boolean(line.kitchenFlag)} label={line.item.name} onClick={() => setCart((current) => current.map((entry) => entry.id === line.id ? { ...entry, kitchenFlag: !entry.kitchenFlag } : entry))} />
                        </div>
                        <p className="mt-0.5 text-[13px] font-semibold leading-5">{configured && line.quantity > 1 ? `${line.quantity} × ${money(unitPrice)}` : money(unitPrice * line.quantity)}</p>
                      </div>
                      {configured ? (
                        <button type="button" onClick={() => removeCartLine(line.id)} className="mt-0.5 shrink-0 text-[#b7b3b8] hover:text-rose-600" aria-label={`Remove ${line.item.name}`}><Trash2 size={15} /></button>
                      ) : (
                        <div className="flex h-8 shrink-0 items-center rounded-full bg-[#f6f1f4] px-0.5 text-[#c9a3b6]">
                          <button type="button" aria-label={`Remove one ${line.item.name}`} onClick={() => { if (line.quantity <= 1) removeCartLine(line.id); else updateCartQuantity(line.id, line.quantity - 1); }} className="grid h-7 w-7 place-items-center rounded-full hover:bg-white"><Minus size={13} /></button>
                          <span className="w-4 text-center text-[12px] font-bold text-ink">{line.quantity}</span>
                          <button type="button" aria-label={`Add one ${line.item.name}`} onClick={() => updateCartQuantity(line.id, line.quantity + 1)} className="grid h-7 w-7 place-items-center rounded-full hover:bg-white"><Plus size={13} /></button>
                        </div>
                      )}
                    </div>
                    {detail && <p className="mt-1 text-[11px] leading-4 text-[#8d939c]">{detail}</p>}
                    {(configured || line.specialNotes) && <button type="button" onClick={() => editCartLine(line)} className="mt-1 text-[12px] font-semibold text-[#ed168c] hover:text-[#d80d7c]">Edit choices</button>}
                  </article>;
                })}
              </div>
            ) : activeTableOrders.length ? null : (
              <div className="py-8 text-center">
                <p className="text-xs font-semibold">Your ticket is waiting</p>
                <p className="mt-1 text-[11px] text-muted">Add a dish from the menu to get started.</p>
              </div>
            )}
            </div>
          <div className="shrink-0 bg-white px-4 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-bold">Total</span>
                <span className="text-[15px] font-extrabold">{money(grand)}</span>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  disabled={placing || (roomService ? !stayId : !selectedTable) || !cartLines.length}
                  onClick={() => void placeOrder()}
                  className={roomService ? "focus-ring flex h-11 min-w-0 flex-1 items-center justify-center rounded-xl bg-[#ed168c] px-3 text-center text-[13px] font-bold text-white transition hover:bg-[#d80d7c] disabled:cursor-not-allowed disabled:opacity-40" : "focus-ring flex h-11 min-w-0 flex-1 items-center justify-center rounded-xl border border-[#eadfe6] bg-white px-3 text-center text-[13px] font-bold text-ink transition hover:bg-[#fff8fb] disabled:cursor-not-allowed disabled:opacity-40"}
                >
                  {placing ? "Sending…" : "Send"}
                </button>
                {!roomService && <button
                  disabled={placing || !selectedTable || !tableBill}
                  onClick={() => setSettleOpen(true)}
                  className="focus-ring flex h-11 min-w-0 flex-[1.4] items-center justify-center rounded-xl bg-[#ed168c] px-3 text-center text-[13px] font-bold text-white transition hover:bg-[#d80d7c] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Settle · {money(settleGrand)}
                </button>}
              </div>
            </div>
        </Panel>
    </div>
    {configuringItem && <div className="fixed inset-0 z-[9999] flex justify-end bg-black/40" onMouseDown={(event) => { if (event.target === event.currentTarget) closeItemEditor(); }}>
      <aside role="dialog" aria-modal="true" aria-label={`Customize ${configuringItem.name}`} className="flex h-dvh max-h-dvh w-full min-h-0 max-w-full flex-col border-l border-line bg-white shadow-float sm:max-w-[700px]">
        <header className="flex shrink-0 items-center gap-4 border-b border-line px-5 py-4 sm:px-6">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fff0f7] text-[#ed168c]"><Utensils size={19} /></span>
          <div className="min-w-0 flex-1"><h2 className="truncate font-display text-base font-bold">{configuringItem.name}</h2><p className="mt-0.5 line-clamp-1 text-xs text-muted">{configuringItem.description || "Choose options for this dish."} From {money(configuringItem.price)}.</p></div>
          <button type="button" onClick={closeItemEditor} aria-label="Close item options" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-canvas hover:text-ink"><X size={18} /></button>
        </header>
      {modifierPickerMode === "step" && configureGroups.length > 0 && <div className="shrink-0 border-b border-line px-5 py-3 sm:px-6"><div className="flex items-center justify-between text-xs font-semibold text-muted"><span>Step {Math.min(configStep + 1, configureGroups.length)} of {configureGroups.length}</span><span>{selectedModifierLines(configuringItem, draftSelections).length ? `${selectedModifierLines(configuringItem, draftSelections).length} choice${selectedModifierLines(configuringItem, draftSelections).length === 1 ? "" : "s"} selected` : "Your choices will show here"}</span></div><div className="mt-2 flex gap-1">{configureGroups.map((group, index) => <span key={group.id} className={`h-1 flex-1 rounded-full ${index <= configStep ? "bg-[#ed168c]" : "bg-[#f2e3eb]"}`} />)}</div></div>}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
          {modifierPickerMode === "step"
            ? currentConfigGroup ? renderModifierGroup(currentConfigGroup) : <section className="rounded-xl border border-[#f1dfe9] bg-white p-5"><h3 className="text-sm font-bold">Choices complete</h3><p className="mt-1 text-xs text-muted">Review your selections, then add this dish to the order.</p><div className="mt-4 space-y-2">{selectedModifierLines(configuringItem, draftSelections).map((choice) => <p key={choice.id} className="text-xs text-ink">{choice.name}{choice.amount > 0 ? <span className="ml-2 text-muted">+{money(choice.amount)}</span> : null}</p>)}</div></section>
            : (configuringItem?.modifierGroups ?? []).map((link) => renderModifierGroup(link.group))}
          {modifierError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{modifierError}</p>}
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-line bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3"><div className="flex h-9 items-center rounded-lg bg-[#fff4f9] p-1"><button type="button" aria-label="Decrease quantity" onClick={() => setDraftQuantity((quantity) => Math.max(1, quantity - 1))} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white"><Minus size={13} /></button><span className="w-7 text-center text-xs font-bold">{draftQuantity}</span><button type="button" aria-label="Increase quantity" onClick={() => setDraftQuantity((quantity) => Math.min(99, quantity + 1))} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white"><Plus size={13} /></button></div><div><p className="text-[10px] text-muted">Total</p><p className="font-display text-base font-extrabold">{money(configuredItemPrice * draftQuantity)}</p></div></div>
          {modifierPickerMode === "step" && configStep > 0 && <button type="button" onClick={() => { setModifierError(""); setConfigStep((step) => Math.max(0, step - 1)); }} className="flex h-11 items-center justify-center rounded-xl border border-line px-4 text-xs font-bold text-ink">Back</button>}
          {modifierPickerMode === "step" && currentConfigGroup && <button type="button" disabled={!stepCanContinue} onClick={advanceConfigStep} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ed168c] px-5 text-xs font-bold text-white transition hover:bg-[#d80d7c] disabled:cursor-not-allowed disabled:opacity-40">{configStep === configureGroups.length - 1 ? (editingCartLineId ? "Update item" : "Add to order") : "Continue"} <ArrowRight size={15} /></button>}
          {(modifierPickerMode !== "step" || !currentConfigGroup) && <button type="button" onClick={confirmConfiguredItem} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ed168c] px-5 text-xs font-bold text-white transition hover:bg-[#d80d7c]">{editingCartLineId ? "Update item" : "Add to order"} · {money(configuredItemPrice * draftQuantity)} <ArrowRight size={15} /></button>}
        </footer>
      </aside>
    </div>}
    {settleOpen && selectedTable && tableBill && <SettleTableDialog
      tableId={selectedTable.id}
      tableNumber={`${selectedTable.tableNumber}${splits.length > 1 ? activeSplit?.label ?? "" : ""}`}
      splitId={activeSplit?.id}
      orders={tableBill.orders}
      stays={activeStays}
      assignedStayIds={activeSplit ? (activeSplit.roomStayId ? [activeSplit.roomStayId] : []) : assignedRoomStayIds}
      cashierName={currentUser?.name ?? "Restaurant staff"}
      onClose={() => setSettleOpen(false)}
      onChanged={async () => {
        const { data } = await api.get<DiningTable[]>("/tables");
        setTables(data);
        await fetchOrders();
      }}
      onReceipt={(next) => setReceipt(next)}
    />}
    {receipt && <ReceiptPreview receipt={receipt} restaurantName={restaurantName} restaurantLogoUrl={restaurantLogoUrl} onClose={() => setReceipt(null)} />}
    {plusJumps.map((jump) => <PlusJumpBadge key={jump.id} jump={jump} onDone={clearPlusJump} />)}
    </>
  );
}
