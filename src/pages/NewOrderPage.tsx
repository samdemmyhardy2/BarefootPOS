import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import { PageHeader, Panel, EmptyState, OrderBadge, SelectField } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { postOnce, SavedLocallyError } from "../lib/outbox";
import type { Category, DiningTable, MenuItem, ModifierGroup, PrepStation } from "../lib/types";
import { money } from "../lib/types";
import { useOrderStore } from "../stores/orderStore";
import { useUiStore } from "../stores/uiStore";
import { useAuthStore } from "../stores/authStore";
import { ReceiptPreview, type CheckoutReceipt } from "../components/ReceiptPreview";
import { ModifierGroupIcon } from "../components/ModifierGroupIcon";
import { LevelSlider } from "../components/LevelSlider";
import { localizedFoodLabels } from "../lib/foodTranslations";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { translateUiText } from "../lib/translations";

type CartLine = {
  id: string;
  item: MenuItem;
  quantity: number;
  specialNotes: string;
  modifierSelections: Record<string, string[]>;
  prepStation: PrepStation;
  payerId: string;
};
type PlusJump = { id: string; fromX: number; fromY: number; toX: number; toY: number; label: string };
function PlusJumpBadge({ jump, onDone }: { jump: PlusJump; onDone: (id: string) => void }) {
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMoved(true));
    const timer = window.setTimeout(() => onDone(jump.id), 850);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [jump.id, onDone]);
  return <span className="pointer-events-none fixed z-[90] [perspective:600px]" style={{ left: moved ? jump.toX : jump.fromX, top: moved ? jump.toY : jump.fromY, transform: "translate(-50%, -50%)", transition: "left 700ms ease-in-out, top 700ms ease-in-out" }}>
    <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-sm font-extrabold text-emerald-700 [transform-style:preserve-3d]" style={{ transform: moved ? "rotateX(720deg)" : "rotateX(0deg)", transition: "transform 700ms linear" }}>{jump.label}</span>
  </span>;
}
const categoryColors = [
  "from-[#e1edcf] to-[#f2f6e9]",
  "from-[#f4e6d9] to-[#fbf2e9]",
  "from-[#f3e3e4] to-[#fbf1f1]",
  "from-[#e0edf0] to-[#f1f7f7]",
  "from-[#ece7d8] to-[#f6f3e9]",
];
type ActiveRoomStay = { id: string; primaryGuestName: string; occupants: { id: string; name: string }[]; room: { roomNumber: string | number } };

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
  const { tableId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const partySetup = location.state as { walkInCount?: number; roomStayIds?: string[] } | null;
  const [categories, setCategories] = useState<Category[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [activeStays, setActiveStays] = useState<ActiveRoomStay[]>([]);
  const [assignedRoomStayIds, setAssignedRoomStayIds] = useState<string[]>([]);
  const [savingRoomAssignments, setSavingRoomAssignments] = useState(false);
  const [roomPickerOpen, setRoomPickerOpen] = useState(false);
  const roomPickerRef = useRef<HTMLDivElement>(null);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [plusJumps, setPlusJumps] = useState<PlusJump[]>([]);
  const ticketMarkRef = useRef<HTMLSpanElement>(null);
  const pendingAddOrigin = useRef<DOMRect | null>(null);
  const [walkInPartyCount] = useState(partySetup?.walkInCount ?? 1);
  const [orderKitchenNote, setOrderKitchenNote] = useState("");
  const [configuringItem, setConfiguringItem] = useState<MenuItem | null>(null);
  const [editingCartLineId, setEditingCartLineId] = useState<string | null>(null);
  const [draftQuantity, setDraftQuantity] = useState(1);
  const [draftKitchenNote, setDraftKitchenNote] = useState("");
  const [draftSelections, setDraftSelections] = useState<Record<string, string[]>>({});
  const [configStep, setConfigStep] = useState(0);
  const [modifierError, setModifierError] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<CheckoutReceipt | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settlementMethods, setSettlementMethods] = useState<Record<string, "ROOM_CHECKOUT" | "CASH" | "CARD" | "PROMPTPAY">>({});
  const [signaturePayerId, setSignaturePayerId] = useState<string | null>(null);
  const [signatureName, setSignatureName] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const [signatureDrawing, setSignatureDrawing] = useState(false);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const [settledPayers, setSettledPayers] = useState<{ id: string; label: string; total: number; note: string }[]>([]);
  const createOrder = useOrderStore((state) => state.createOrder);
  const cookAction = useOrderStore((state) => state.cookAction);
  const [ticketActionId, setTicketActionId] = useState<string | null>(null);
  const orders = useOrderStore((state) => state.orders);
  const fetchOrders = useOrderStore((state) => state.fetchOrders);
  const notify = useUiStore((state) => state.notify);
  const reportError = (message: string) => { setError(message); notify(message, "error"); };
  const language = useUiStore((state) => state.language);
  const modifierPickerMode = useUiStore((state) => state.modifierPickerMode);
  const t = (text: string) => translateUiText(language, text);
  const restaurantName = useUiStore((state) => state.restaurantName);
  const restaurantLogoUrl = useUiStore((state) => state.restaurantLogoUrl);
  const currentUser = useAuthStore((state) => state.user);
  useEffect(() => {
    if (!roomPickerOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !roomPickerRef.current?.contains(event.target)) setRoomPickerOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setRoomPickerOpen(false); };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [roomPickerOpen]);
  useEffect(() => {
    void Promise.all([
      api.get<Category[]>("/categories"),
      api.get<DiningTable[]>("/tables"),
      api.get<ActiveRoomStay[]>("/orders/active-room-stays"),
    ])
      .then(([cat, tbl, stays]) => { setCategories(cat.data); setTables(tbl.data); setActiveStays(stays.data); })
      .catch((e) => reportError(errorMessage(e)));
  }, []);
  useEffect(() => {
    void fetchOrders().catch(() => undefined);
  }, [fetchOrders]);
  const selectedTable = tables.find((table) => table.id === tableId);
  useEffect(() => {
    const assignedIds = selectedTable?.assignedRoomStays?.map((stay) => stay.id) ?? [];
    setAssignedRoomStayIds(assignedIds);
  }, [tableId, selectedTable?.assignedRoomStays]);
  const activeTableOrders = orders
    .filter((order) => order.tableId === tableId && ["PENDING", "PREPARING", "READY", "SERVED"].includes(order.status))
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const payers = [
    ...assignedRoomStayIds.map((id) => {
      const stay = activeStays.find((entry) => entry.id === id);
      const assigned = selectedTable?.assignedRoomStays?.find((entry) => entry.id === id);
      const roomNumber = stay?.room.roomNumber ?? assigned?.room?.roomNumber;
      return { id, label: `R${roomNumber ?? "?"}`, name: stay?.primaryGuestName ?? assigned?.primaryGuestName ?? `Room ${roomNumber ?? ""}`, roomStayId: id };
    }),
    ...(walkInPartyCount > 0 ? [{ id: "walk-ins", label: "Walk-ins", name: "Walk-ins", roomStayId: undefined }] : []),
  ];
  const menuItems = useMemo(
    () =>
      categories
        .flatMap((category) =>
          (category.items ?? []).map((item) => ({ ...item, category })),
        )
        .filter(
          (item) =>
            (selectedCategory === "All" ||
              item.category?.name === selectedCategory) &&
            `${item.name} ${item.description ?? ""}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        ),
    [categories, selectedCategory, search],
  );
  const cartLines = cart;
  const serveAtTable = cartLines.length > 0 && cartLines.every((line) => line.prepStation === "BAR");
  const getLineUnitPrice = (item: MenuItem, selections: Record<string, string[]>) => Number(item.price) + openModifierGroups(item, selections).filter((group) => group.appearance !== "TEXT").reduce((sum, group) => {
    const selected = selections[group.id] ?? [];
    const selectedOptions = selected.flatMap((id) => {
      const option = group.options.find((candidate) => candidate.id === id);
      return option ? [option] : [];
    });
    return sum + selectedOptions.reduce((charge, option, index) => charge + (index < group.includedPicks ? 0 : Number(option.priceAdjustment) + Number(group.extraPickPrice ?? 0)), 0);
  }, 0);
  const total = cartLines.reduce(
    (sum, line) => sum + getLineUnitPrice(line.item, line.modifierSelections) * line.quantity,
    0,
  );
  const partyTotals = payers.map((payer) => ({ ...payer, total: cartLines.reduce((sum, line) => sum + (line.payerId === payer.id ? getLineUnitPrice(line.item, line.modifierSelections) * line.quantity : 0), 0) })).filter((payer) => payer.total > 0);
  const tableTotal = activeTableOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
  const allOrdersServed = activeTableOrders.length > 0 && activeTableOrders.every((order) => order.status === "SERVED");
  const orderPayerGroups = activeTableOrders.reduce<{ id: string; label: string; name: string; roomStayId?: string; orders: typeof activeTableOrders; total: number }[]>((groups, order) => {
    const id = order.roomStayId ?? "walk-ins";
    let group = groups.find((entry) => entry.id === id);
    if (!group) {
      const payer = payers.find((entry) => entry.id === id);
      const roomNumber = order.roomStay?.room?.roomNumber;
      group = { id, label: payer?.label ?? (roomNumber ? `R${roomNumber}` : "Walk-ins"), name: payer?.name ?? order.roomStay?.primaryGuestName ?? "Walk-ins", roomStayId: order.roomStayId ?? undefined, orders: [], total: 0 };
      groups.push(group);
    }
    group.orders.push(order);
    group.total += Number(order.totalAmount);
    return groups;
  }, []);
  const signatureGroup = orderPayerGroups.find((group) => group.id === signaturePayerId);
  const clearPlusJump = useCallback((id: string) => setPlusJumps((current) => current.filter((jump) => jump.id !== id)), []);
  const launchPlus = (origin: DOMRect | null, amount = 1) => {
    const ticket = ticketMarkRef.current?.getBoundingClientRect();
    if (!origin || !ticket) return;
    setPlusJumps((current) => [...current, { id: crypto.randomUUID(), fromX: origin.left + origin.width / 2, fromY: origin.top + origin.height / 2, toX: ticket.left + ticket.width / 2, toY: ticket.top + ticket.height / 2, label: `+${amount}` }]);
  };
  const addToCart = (item: MenuItem, modifierSelections: Record<string, string[]> = {}, quantity = 1, specialNotes = "") => setCart((current) => [...current, {
      id: crypto.randomUUID(),
      item,
      quantity,
      specialNotes,
      modifierSelections,
      prepStation: item.prepStation ?? "KITCHEN",
      payerId: payers[0]?.id ?? "walk-ins",
    }]);
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
      const nextValues = group.selectionType === "SINGLE"
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
    if (change > 0 && selected.length >= group.maxPicks) return;
    if (change < 0 && optionCount === 0) return;
    updateDraftSelection(group, optionId, change > 0);
  };
  const confirmConfiguredItem = () => {
    if (!configuringItem) return;
    const groups = openModifierGroups(configuringItem, draftSelections);
    const invalid = groups.find((group) => {
      const count = draftSelections[group.id]?.length ?? 0;
      return group.appearance !== "TEXT" && (count < group.minPicks || count > group.maxPicks || (group.required && count === 0));
    });
    if (invalid) { setModifierError(`${invalid.name}: choose ${invalid.minPicks === invalid.maxPicks ? invalid.minPicks : `${invalid.minPicks}–${invalid.maxPicks}`} option${invalid.maxPicks === 1 ? "" : "s"}.`); return; }
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
  const placeOrder = async () => {
    if (!tableId || !selectedTable) {
      reportError("Return to the floor and open a table before sending an order.");
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
      const byPayer = new Map<string, CartLine[]>();
      cartLines.forEach((line) => byPayer.set(line.payerId, [...(byPayer.get(line.payerId) ?? []), line]));
      for (const [payerId, lines] of byPayer) {
        try {
        await createOrder(
          { tableId, ...(payerId !== "walk-ins" ? { roomStayId: payerId } : {}) },
          lines.map(({ item, quantity, specialNotes, modifierSelections, prepStation }) => ({
            menuItemId: item.id,
            quantity,
            prepStation,
            modifierSelections: openModifierGroups(item, modifierSelections).filter((group) => group.appearance !== "TEXT").map((group) => ({ groupId: group.id, optionIds: modifierSelections[group.id] ?? [] })),
            ...([orderKitchenNote.trim() && `Order note: ${orderKitchenNote.trim()}`, specialNotes.trim()].filter(Boolean).length ? { specialNotes: [orderKitchenNote.trim() && `Order note: ${orderKitchenNote.trim()}`, specialNotes.trim()].filter(Boolean).join(" · ") } : {}),
          })),
        );
        } catch (cause) {
          if (!(cause instanceof SavedLocallyError)) throw cause;
          waitingToSend = true;
        }
        lines.forEach((line) => submittedLineIds.add(line.id));
      }
      if (waitingToSend) {
        setCart((current) => current.filter((line) => !submittedLineIds.has(line.id)));
        notify("Saved on this device. It will send when the connection returns.");
        return;
      }
      const paidAtTable = cartLines.every((line) => line.prepStation === "BAR");
      setCart([]);
      setOrderKitchenNote("");
      const { data } = await api.get<DiningTable[]>("/tables");
      setTables(data);
      await fetchOrders();
      if (paidAtTable) {
        const openTickets = useOrderStore.getState().orders.filter((order) => order.tableId === tableId && ["PENDING", "PREPARING", "READY", "SERVED"].includes(order.status));
        const readyToPay = openTickets.length > 0 && openTickets.every((order) => order.status === "SERVED");
        notify(readyToPay ? "Ready to pay. Nothing was sent to the kitchen." : "Saved on the ticket. Pay once the kitchen orders are served.");
        if (readyToPay) setSettleOpen(true);
      } else notify("Order sent to the kitchen.");
    } catch (e) {
      if (submittedLineIds.size) setCart((current) => current.filter((line) => !submittedLineIds.has(line.id)));
      reportError(errorMessage(e));
    } finally {
      setPlacing(false);
    }
  };
  const settlePayer = async (group: typeof orderPayerGroups[number], method: "ROOM_CHECKOUT" | "CASH" | "CARD" | "PROMPTPAY", signedName?: string, signature?: string) => {
    if (!allOrdersServed) { reportError("All table orders must be served before settlement."); return; }
    if (method === "ROOM_CHECKOUT" && (!signedName?.trim() || !signature)) { setSignaturePayerId(group.id); setSignatureName(group.name); setSignatureData(""); return; }
    setPlacing(true); setError("");
    try {
      const data = await postOnce<{ tableNumber: string; totalAmount: number; checkedOutAt: string; tableCleared: boolean; signedByName?: string | null }>({
        scope: "table.settle",
        url: `/tables/${tableId}/settle-party`,
        body: { orderIds: group.orders.map((order) => order.id), paymentMethod: method, ...(method === "ROOM_CHECKOUT" ? { signedByName: signedName, signatureData: signature } : {}) },
        label: `Settle ${group.label}`,
        dedupeKey: `table-settle:${tableId}:${group.orders.map((order) => order.id).sort().join(",")}`,
      });
      const stays = group.roomStayId ? activeStays.filter((stay) => stay.id === group.roomStayId) : [];
      const rooms = stays.map((stay) => ({ roomNumber: stay.room.roomNumber, guestName: stay.primaryGuestName, guestNames: [...new Set([stay.primaryGuestName, ...stay.occupants.map((occupant) => occupant.name)])] }));
      if (method === "ROOM_CHECKOUT") setReceipt({ tableNumber: data.tableNumber, orders: group.orders, paymentMethod: method, room: null, rooms, totalAmount: Number(data.totalAmount), checkedOutAt: data.checkedOutAt, cashierName: currentUser?.name ?? "Restaurant staff", signature: { name: data.signedByName ?? signedName ?? "Guest", data: signature ?? "" } });
      notify(method === "ROOM_CHECKOUT" ? `Added to Room ${rooms[0]?.roomNumber ?? "guest"}’s tab. Signed by ${data.signedByName ?? signedName}.` : `${group.label} paid by ${method === "PROMPTPAY" ? "PromptPay QR" : method.toLowerCase()}.`);
      setSettledPayers((current) => [...current.filter((entry) => entry.id !== group.id), { id: group.id, label: group.label, total: Number(data.totalAmount), note: method === "ROOM_CHECKOUT" ? `Added to Room ${rooms[0]?.roomNumber ?? "guest"}’s tab. Signed by ${data.signedByName ?? signedName}.` : `Paid by ${method === "PROMPTPAY" ? "PromptPay QR" : method.toLowerCase()}.` }]);
      if (signaturePayerId) setSignaturePayerId(null);
      const updated = await api.get<DiningTable[]>("/tables"); setTables(updated.data);
      await fetchOrders();
      if (data.tableCleared) { setSettleOpen(false); notify(`${data.tableNumber} is settled and cleared.`); }
    } catch (cause) {
      if (cause instanceof SavedLocallyError) notify("Settlement saved on this device. It will send when the connection returns.");
      else reportError(errorMessage(cause));
    }
    finally { setPlacing(false); }
  };
  const saveSignature = async () => {
    if (!signatureGroup || !signatureData) { reportError("Please sign before adding the bill to the room tab."); return; }
    await settlePayer(signatureGroup, "ROOM_CHECKOUT", signatureName, signatureData);
  };
  const signaturePoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  };
  const startSignature = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current; const point = signaturePoint(event); if (!canvas || !point) return;
    canvas.setPointerCapture(event.pointerId); const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.beginPath(); ctx.moveTo(point.x, point.y); ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.strokeStyle = "#30242b"; setSignatureDrawing(true);
  };
  const drawSignature = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!signatureDrawing) return; const canvas = signatureCanvasRef.current; const point = signaturePoint(event); const ctx = canvas?.getContext("2d"); if (!canvas || !point || !ctx) return;
    ctx.lineTo(point.x, point.y); ctx.stroke(); setSignatureData(canvas.toDataURL("image/png"));
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
  const stepCanContinue = currentConfigGroup ? currentConfigGroup.appearance === "TEXT"
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
    const groupDone = group.appearance === "TEXT" ? (!group.required || Boolean(draftKitchenNote.trim())) : selected.length >= group.minPicks && selected.length <= group.maxPicks;
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
            <div className="flex h-8 shrink-0 items-center rounded-lg bg-[#fff4f9] p-0.5"><button type="button" aria-label={`Remove one ${modifierLabel(option, language)}`} disabled={!count} onClick={() => updateQuantityOption(group, option.id, -1)} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white disabled:opacity-30"><Minus size={12} /></button><span className="w-6 text-center text-[11px] font-bold">{count}</span><button type="button" aria-label={`Add one ${modifierLabel(option, language)}`} disabled={selected.length >= group.maxPicks} onClick={() => updateQuantityOption(group, option.id, 1)} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white disabled:opacity-30"><Plus size={12} /></button></div>
          </div>
          {childForOption(option.id)}
        </div>;
      })}
    </div> : group.appearance === "SLIDER" && groupOptions.length > 0 ? <div className="rounded-xl border border-line px-4 py-4">
      <h4 className="text-sm font-bold">How {modifierLabel(group, language).toLowerCase()} is it?</h4>
      <p className="mb-4 mt-1 text-[11px] text-muted">Tap a level. The kitchen makes it this way unless the guest asks for different.</p>
      <LevelSlider labels={groupOptions.map((option) => modifierLabel(option, language))} value={Math.max(0, groupOptions.findIndex((option) => selected.includes(option.id)))} onChange={(index) => updateDraftSelection(group, groupOptions[index].id, true)} ariaLabel={`Choose ${modifierLabel(group, language)} level`} />
      {modifierPickerMode === "list" && selected[0] && childForOption(selected[0])}
    </div> : <div className="grid gap-2 sm:grid-cols-2">
      {groupOptions.map((option) => {
        const isSelected = selected.includes(option.id);
        const atLimit = selected.length >= group.maxPicks;
        const chargeIndex = isSelected ? selected.slice(0, selected.indexOf(option.id)).length : selected.length;
        const price = chargeIndex < group.includedPicks ? 0 : Number(option.priceAdjustment) + Number(group.extraPickPrice ?? 0);
        return <div key={option.id}>
          <label className={`flex min-h-[62px] cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${isSelected ? "border-[#ed168c] bg-[#fff8fb]" : "border-line bg-white hover:border-[#ed168c]/40"}`}>
            <input type={group.selectionType === "SINGLE" ? "radio" : "checkbox"} name={`modifier-${group.id}`} checked={isSelected} disabled={group.selectionType !== "SINGLE" && !isSelected && atLimit} onChange={(event) => { updateDraftSelection(group, option.id, group.selectionType === "SINGLE" ? true : event.target.checked); if (modifierPickerMode === "step" && group.selectionType === "SINGLE" && event.target.checked) setConfigStep((step) => step + 1); }} className="h-4 w-4 accent-[#ed168c]" />
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
        <div className="flex min-w-0 items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#fff0f7] text-[#d90c7d]"><ModifierGroupIcon name={group.icon} size={16} /></span><div className="min-w-0"><h3 className="text-sm font-bold">{modifierLabel(group, language)}{language !== "en" && group.name ? <span className="ml-1 font-normal text-muted">{group.name}</span> : null}</h3><p className="mt-0.5 text-[10px] text-muted">{group.required ? "Required" : "Optional"}{group.appearance === "TEXT" ? " · Free text" : ` · Pick ${group.minPicks === group.maxPicks ? group.minPicks : `${group.minPicks}–${group.maxPicks}`}`}</p></div></div>
        <div className="shrink-0 text-right"><span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${groupDone ? "bg-emerald-50 text-emerald-700" : "bg-[#f5f5f4] text-muted"}`}>{groupDone ? "Done" : group.required ? "Required" : "Optional"}</span><p className="mt-1 text-[10px] text-muted">{group.appearance === "TEXT" ? "Free text" : `${selected.length} picked`}</p></div>
      </div>
      {groupBody}
    </section>;
  }

  return (
    <>
    <div className="page-enter">
      <PageHeader
        eyebrow="Floor · New ticket"
        title="Build an order"
        description={selectedTable
          ? `Choose dishes for ${selectedTable.tableNumber}, customize each item, and send the ticket to the kitchen.`
          : "Choose dishes, customize each item, and send the ticket to the kitchen."}
        action={
          <button onClick={() => navigate("/tables")} className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-xs font-semibold transition hover:border-[#ed168c]/40 hover:text-[#d90c7d]">Back to tables</button>
        }
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find something delicious…"
                className="focus-ring h-11 w-full rounded-xl border border-line bg-white pl-10 pr-4 text-sm outline-none focus:border-olive"
              />
            </div>
            <div aria-label="Menu categories" className="scrollbar-hide flex min-w-0 gap-2 overflow-x-auto pb-1 lg:flex-1">
              {["All", ...categories.map((category) => category.name)].map(
                (name) => (
                  <button
                    key={name}
                    onClick={() => setSelectedCategory(name)}
                    className={`shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-xs font-semibold transition ${selectedCategory === name ? "bg-[#ed168c] text-white" : "border border-line bg-white text-[#697066] hover:border-[#ed168c]/40 hover:text-[#d90c7d]"}`}
                  >
                    {name}
                  </button>
                ),
              )}
            </div>
          </div>
          {error && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            >
              {error}
            </div>
          )}
          {menuItems.length ? (
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {menuItems.map((item, index) => {
                const quantity = cart.reduce((sum, line) => line.item.id === item.id ? sum + line.quantity : sum, 0);
                return (
                <article
                  key={item.id}
                  onClick={(event) => bumpMenuItem(item, 1, event.currentTarget.querySelector("[data-add-mark]")?.getBoundingClientRect() ?? null)}
                  className="group cursor-pointer overflow-hidden rounded-[18px] border border-[#f0e1e9] bg-white text-left shadow-card transition hover:-translate-y-0.5 hover:border-[#ed168c]/40 hover:shadow-float"
                >
                  <div
                    className={`relative flex h-32 items-end overflow-hidden bg-gradient-to-br ${categoryColors[index % categoryColors.length]} p-4`}
                  >
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <>
                        <div className="absolute -right-5 -top-10 h-36 w-36 rounded-full border-[20px] border-white/25" />
                        <div className="absolute right-7 top-5 h-12 w-12 rounded-full bg-white/25 blur-sm" />
                        <Utensils
                          className="relative z-10 text-[#bd5188]/70"
                          size={23}
                        />
                      </>
                    )}
                    <span className="relative z-10 rounded-full bg-white/85 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.08em] text-olive backdrop-blur">
                      {item.category?.name}
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-sm font-bold leading-5">
                        {item.name}
                      </h3>
                      <span className="shrink-0 text-sm font-bold">
                        {money(item.price)}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 min-h-9 text-xs leading-[18px] text-muted">
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
                      <span className="text-[10px] text-muted">{quantity ? "On the ticket" : "Tap to add"}</span>
                      {quantity ? (
                        <div data-add-mark className="flex h-8 items-center rounded-lg bg-[#fff4f9] p-0.5" onClick={(event) => event.stopPropagation()}>
                          <button type="button" aria-label={`Remove one ${item.name}`} onClick={() => bumpMenuItem(item, -1)} className="grid h-7 w-7 place-items-center rounded-md text-[#d90c7d] hover:bg-white"><Minus size={12} /></button>
                          <span className="w-6 text-center text-[11px] font-bold text-[#d90c7d]">{quantity}</span>
                          <button type="button" aria-label={`Add one ${item.name}`} onClick={(event) => bumpMenuItem(item, 1, event.currentTarget.getBoundingClientRect())} className="grid h-7 w-7 place-items-center rounded-md text-[#d90c7d] hover:bg-white"><Plus size={12} /></button>
                        </div>
                      ) : (
                        <span data-add-mark className="grid h-8 w-8 place-items-center rounded-lg bg-[#fff0f7] text-[#d90c7d] transition group-hover:bg-[#ed168c] group-hover:text-white"><Plus size={16} /></span>
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
        <Panel className="sticky top-[86px] z-20 flex max-h-[calc(100dvh-6.5rem)] flex-col self-start overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="font-display text-[15px] font-bold">
                Current ticket
              </h2>
              <p className="mt-1 text-xs text-muted">
                {cartLines.reduce((count, line) => count + line.quantity, 0)} {cartLines.reduce((count, line) => count + line.quantity, 0) === 1 ? "item" : "items"} · {payers.length} {payers.length === 1 ? "payer" : "payers"}
              </p>
            </div>
            <span ref={ticketMarkRef} className="grid h-9 w-9 place-items-center rounded-xl bg-[#fff0f7] text-[#d90c7d]">
              <ShoppingBag size={17} />
            </span>
          </div>
          <div className="min-h-0 overflow-y-auto p-5">
            <div className="mb-4 border-b border-line pb-4">
              <SelectField label="Table" value={selectedTable?.id ?? ""} onChange={(event) => {
                if (event.target.value) navigate(`/tables/${event.target.value}`);
              }}>
                <option value="" disabled>Choose a table</option>
                {tables.map((table) => <option key={table.id} value={table.id}>{table.tableNumber}</option>)}
              </SelectField>
            </div>
            {selectedTable && <div className="mb-4 border-b border-line pb-3" ref={roomPickerRef}>
              <label className="mb-2 block text-xs font-semibold text-ink">{t("Assign guest rooms to this table")}</label>
              {activeStays.length ? <div className="relative">
                <button type="button" aria-haspopup="listbox" aria-expanded={roomPickerOpen} disabled={savingRoomAssignments} onClick={() => setRoomPickerOpen((open) => !open)} className="flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 py-2 text-left text-xs font-semibold text-ink hover:bg-canvas disabled:opacity-60">
                  <span className="min-w-0 truncate">{assignedRoomStayIds.length ? `${assignedRoomStayIds.length} ${t("guest rooms assigned")}` : t("Select guest rooms")}</span>
                  <ChevronDown size={15} className={`shrink-0 text-muted transition-transform ${roomPickerOpen ? "rotate-180" : ""}`} />
                </button>
                {roomPickerOpen && <div role="listbox" aria-multiselectable="true" aria-label={t("Assign guest rooms to this table")} className="absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-56 overflow-y-auto rounded-xl border border-line bg-white p-1.5 shadow-float">
                  {activeStays.map((stay) => <label key={stay.id} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-ink hover:bg-canvas">
                    <input type="checkbox" checked={assignedRoomStayIds.includes(stay.id)} disabled={savingRoomAssignments} onChange={(event) => {
                      const next = event.target.checked ? [...assignedRoomStayIds, stay.id] : assignedRoomStayIds.filter((id) => id !== stay.id);
                      void assignRoomsToTable(next);
                    }} />
                    <span className="truncate">Room {stay.room?.roomNumber} · {stay.primaryGuestName}</span>
                    {assignedRoomStayIds.includes(stay.id) && <Check size={13} className="ml-auto shrink-0 text-olive" />}
                  </label>)}
                </div>}
              </div> : <p className="rounded-xl border border-line bg-white px-3 py-2.5 text-[10px] text-muted">{t("No active guest stays to assign.")}</p>}
            </div>}
            {selectedTable && activeTableOrders.length > 0 && <section className="mb-4 rounded-2xl border border-line bg-[#fbfcf9] p-4" aria-label={`Table ${selectedTable.tableNumber} open orders`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                <div><h3 className="text-sm font-bold">{selectedTable.tableNumber} · Open tab</h3><p className="mt-1 text-[10px] text-muted">{selectedTable.capacity} seats · {activeTableOrders.length} active tickets</p></div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-olive">{selectedTable.status}</span>
              </div>
              {activeTableOrders.length ? <div className="mt-3">
                <div className={`space-y-3 ${activeTableOrders.length > 2 ? "max-h-[26rem] overflow-y-auto pr-1" : ""}`}>
                {activeTableOrders.map((order) => <article key={order.id} className="rounded-xl border border-line bg-white p-3">
                  <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="font-mono text-[10px] font-bold">#{order.id.slice(-6).toUpperCase()}</span><OrderBadge status={order.status} /></div><span className="text-[10px] text-muted">Ordered by {order.waiter?.name}</span></div>
                  <ul className="mt-2 space-y-1 text-xs">{order.items.map((line, index) => <li key={line.id ?? `${order.id}-${index}`}><span className="font-bold">{line.quantity}×</span> {line.menuItem.name}{line.addExtras ? <span className="text-muted"> · {line.addExtras}</span> : null}</li>)}</ul>
                  {order.servedBy && <p className="mt-2 text-[10px] font-semibold text-emerald-700">Collected / served by {order.servedBy.name}</p>}
                  {order.status === "SERVED" && <button type="button" disabled={ticketActionId === order.id} onClick={() => void (async () => {
                    setTicketActionId(order.id); setError("");
                    try { await cookAction(order.id, "revert"); notify("Pickup undone. Ticket is ready again."); }
                    catch (cause) { reportError(errorMessage(cause)); }
                    finally { setTicketActionId(null); }
                  })()} className="mt-3 h-9 w-full rounded-lg border border-line bg-white text-[11px] font-bold text-ink hover:bg-canvas disabled:opacity-50">Revert</button>}
                </article>)}
                </div>
                <p className="mt-3 text-[10px] text-muted">Add another ticket below to continue this table’s order.</p>
              </div> : <p className="mt-3 text-xs text-muted">No items have been ordered at this table yet. Start with the menu below.</p>}
              {activeTableOrders.length > 0 && <div className="mt-4 border-t border-line pt-4">
                <div className="flex items-center justify-between"><span className="text-xs font-semibold">Open table total</span><span className="font-display text-lg font-extrabold">{money(tableTotal)}</span></div>
                {!allOrdersServed && <p className="mt-2 text-[10px] text-muted">All active tickets must be marked served before checkout.</p>}
                <button onClick={() => setSettleOpen(true)} disabled={placing || !allOrdersServed} className="mt-3 h-11 w-full rounded-xl bg-[#ed168c] text-xs font-bold text-white hover:bg-[#d80d7c] disabled:cursor-not-allowed disabled:opacity-40">Pay</button>
              </div>}
            </section>}
            <div className="my-4 h-px bg-line" />
            {cartLines.length ? (
              <div className="space-y-3 pr-1">
                {cartLines.map((line) => {
                  const unitPrice = getLineUnitPrice(line.item, line.modifierSelections);
                  const modifierLines = selectedModifierLines(line.item, line.modifierSelections);
                  return <article key={line.id} className="border-b border-line pb-3 last:border-0">
                    <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className={`shrink-0 rounded-full px-2 py-1 text-[8px] font-bold ${line.payerId === "walk-ins" ? "bg-[#f4f3f1] text-[#726b67]" : "bg-[#eef0ff] text-[#5866a0]"}`}>{payers.find((payer) => payer.id === line.payerId)?.label ?? "Walk-ins"}</span><p className="min-w-0 truncate text-xs font-bold leading-5">{line.item.name}</p></div><button onClick={() => removeCartLine(line.id)} className="shrink-0 text-[#a4a89f] hover:text-rose-600" aria-label={`Remove ${line.item.name}`}><Trash2 size={14} /></button></div>
                    {payers.length > 0 && <label className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted"><span>For</span><select value={payers.some((payer) => payer.id === line.payerId) ? line.payerId : payers[0].id} onChange={(event) => setCart((current) => current.map((entry) => entry.id === line.id ? { ...entry, payerId: event.target.value } : entry))} className="max-w-[150px] rounded-lg border border-line bg-white px-2 py-1 text-[10px] font-semibold text-ink">{payers.map((payer) => <option key={payer.id} value={payer.id}>{payer.name}</option>)}</select></label>}
                    <label className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted"><span>Send dish to</span><select value={line.prepStation} onChange={(event) => setCart((current) => current.map((entry) => entry.id === line.id ? { ...entry, prepStation: event.target.value as PrepStation } : entry))} className="rounded-lg border border-line bg-white px-2 py-1 text-[10px] font-semibold text-ink"><option value="KITCHEN">Kitchen</option><option value="BAR">Serve at table</option></select></label>
                    <div className="mt-2 flex items-center justify-between gap-3"><span className="text-xs text-muted">{money(unitPrice * line.quantity)}</span><div className="flex h-8 items-center rounded-lg bg-[#fff4f9] p-0.5"><button type="button" aria-label={`Remove one ${line.item.name}`} onClick={() => updateCartQuantity(line.id, line.quantity - 1)} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white"><Minus size={12} /></button><span className="w-6 text-center text-[11px] font-bold">{line.quantity}</span><button type="button" aria-label={`Add one ${line.item.name}`} onClick={() => updateCartQuantity(line.id, line.quantity + 1)} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white"><Plus size={12} /></button></div></div>
                    {modifierLines.length > 0 && <div className="mt-2 space-y-1">{modifierLines.map((modifier) => <div key={modifier.id} className={`flex items-start justify-between gap-2 text-[10px] leading-4 text-muted ${modifier.depth ? "ml-3 border-l border-[#f3cade] pl-2" : ""}`}><span className="min-w-0">{modifier.name}{modifier.count > 1 ? ` ×${modifier.count}` : ""}</span>{!(modifier.nested && modifier.amount <= 0) && <span className="shrink-0">{modifier.amount > 0 ? `+${money(modifier.amount)}` : "Free"}</span>}</div>)}</div>}
                    {line.specialNotes && <p className="mt-2 inline-block rounded-lg bg-amber-50 px-2 py-1 text-[10px] italic text-amber-800">“{line.specialNotes}”</p>}
                    {(itemModifierGroups(line.item).length > 0 || line.specialNotes) && <button type="button" onClick={() => editCartLine(line)} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#ed168c] hover:text-[#d80d7c]">Edit choices <ArrowRight size={12} /></button>}
                  </article>;
                })}
              </div>
            ) : (
              <div className="py-9 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-canvas text-[#a0a69e]">
                  <ShoppingBag size={20} />
                </div>
                <p className="mt-3 text-xs font-semibold">
                  Your ticket is waiting
                </p>
                <p className="mt-1 text-[11px] text-muted">
                  Add a dish from the menu to get started.
                </p>
              </div>
            )}
            <label className="mt-4 block border-t border-line pt-4 text-xs font-semibold text-ink">
              Note for kitchen <span className="font-normal text-muted">(optional)</span>
              <textarea
                value={orderKitchenNote}
                onChange={(event) => setOrderKitchenNote(event.target.value)}
                placeholder="Add a note for this ticket"
                rows={3}
                className="mt-2 w-full resize-y rounded-xl border border-line bg-white px-3 py-2.5 text-xs font-normal text-ink outline-none transition placeholder:text-muted focus:border-[#ed168c]"
              />
            </label>
            </div>
          <div className="shrink-0 border-t border-line bg-white px-5 pb-5 pt-4">
              {partyTotals.length > 0 && <div className="mb-4 space-y-2 border-b border-line pb-3">{partyTotals.map((payer, index) => <div key={payer.id} className="flex items-center justify-between gap-2 text-[10px]"><span className="flex min-w-0 items-center gap-2 text-muted"><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${payer.id === "walk-ins" ? "bg-[#f4f3f1] text-[#726b67]" : index % 2 ? "bg-[#fff0e9] text-[#a64728]" : "bg-[#eef0ff] text-[#5866a0]"}`}>{payer.label}</span><span className="truncate">{payer.name}</span></span><span className="shrink-0 font-bold text-ink">{money(payer.total)}</span></div>)}</div>}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Subtotal</span>
                <span className="text-sm font-bold">{money(total)}</span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-display text-sm font-bold">Total</span>
                <span className="font-display text-lg font-extrabold">
                  {money(total)}
                </span>
              </div>
              <button
                disabled={
                  placing || !cartLines.length || !selectedTable
                }
                onClick={() => void placeOrder()}
                className="focus-ring mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#ed168c] text-sm font-bold text-white transition hover:bg-[#d80d7c] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {placing ? (serveAtTable ? "Saving ticket…" : "Sending to kitchen…") : serveAtTable ? "Pay" : "Send new items to kitchen"}
                <ArrowRight size={16} />
              </button>
              <p className="mt-3 text-center text-[10px] text-muted">
                {serveAtTable ? "Staff serve these at the table. They stay on the ticket and receipt." : cartLines.some((line) => line.prepStation === "BAR") ? "Only kitchen dishes are sent. Anything served straight away stays on the ticket." : "The kitchen sees new tickets instantly."}
              </p>
            </div>
        </Panel>
      </div>
    </div>
    {configuringItem && <div className="fixed inset-0 z-[9999] flex justify-end bg-ink/35 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) closeItemEditor(); }}>
      <aside role="dialog" aria-modal="true" aria-label={`Customize ${configuringItem.name}`} className="flex h-full w-full max-w-[min(100vw,700px)] flex-col border-l border-line bg-white shadow-float">
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
    {settleOpen && selectedTable && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/40 p-3 backdrop-blur-[2px] sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettleOpen(false); }}><section role="dialog" aria-modal="true" aria-label={`Settle ${selectedTable.tableNumber}`} className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-float"><header className="flex items-start gap-4 border-b border-line px-5 py-4"><div className="min-w-0 flex-1"><h2 className="font-display text-lg font-bold">Settle {selectedTable.tableNumber}</h2><p className="mt-1 text-[11px] text-muted">Each payer settles separately. Room guests can add their bill to the room tab or pay now; walk-ins pay now.</p></div><button type="button" onClick={() => setSettleOpen(false)} aria-label="Close settlement" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas"><X size={16} /></button></header><div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{orderPayerGroups.map((group, index) => { const method = settlementMethods[group.id] ?? (group.roomStayId ? "ROOM_CHECKOUT" : "CASH"); const paid = settledPayers.find((entry) => entry.id === group.id); const stay = activeStays.find((entry) => entry.id === group.roomStayId); return <article key={group.id} className="self-start rounded-xl border border-line bg-white p-3.5"><header className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-start gap-2"><span className={`shrink-0 rounded-full px-2 py-1 text-[8px] font-bold ${group.roomStayId ? index % 2 ? "bg-[#fff0e9] text-[#a64728]" : "bg-[#eef0ff] text-[#5866a0]" : "bg-[#f4f3f1] text-[#726b67]"}`}>{group.label}</span><div className="min-w-0"><h3 className="truncate text-xs font-bold">{group.name}</h3><p className="text-[9px] text-muted">{group.orders.length} {group.orders.length === 1 ? "item" : "items"}{stay ? ` · Room ${stay.room.roomNumber}` : group.id === "walk-ins" ? ` · ${walkInPartyCount} people · pay now` : ""}</p></div></div><span className="shrink-0 text-xs font-bold">{money(group.total)}</span></header><div className="mt-3 space-y-1.5 border-b border-line pb-3">{group.orders.flatMap((order) => order.items.map((line) => <div key={`${order.id}-${line.id}`} className="flex justify-between gap-2 text-[9px] text-muted"><span>{line.quantity} × {line.menuItem.name}</span><span>{money(Number(line.subtotal ?? Number(line.unitPrice ?? line.menuItem.price) * line.quantity))}</span></div>))}</div>{paid ? <div className="mt-3 rounded-lg bg-emerald-50 px-2.5 py-2 text-[10px] font-semibold text-emerald-800"><Check size={13} className="mr-1 inline" />{paid.note}</div> : <><p className="mt-3 text-[9px] text-muted">{group.roomStayId ? "How are they paying?" : "Payment method"}</p>{group.roomStayId && <div className="mt-1.5 inline-flex rounded-lg bg-[#fbf4f8] p-1">{([["ROOM_CHECKOUT", "Add to room tab"], ["CASH", "Pay now"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={(method === "ROOM_CHECKOUT") === (value === "ROOM_CHECKOUT")} onClick={() => setSettlementMethods((current) => ({ ...current, [group.id]: value }))} className={`rounded-md px-2.5 py-1.5 text-[9px] font-semibold ${(method === "ROOM_CHECKOUT") === (value === "ROOM_CHECKOUT") ? "bg-white text-ink shadow-sm" : "text-muted"}`}>{label}</button>)}</div>}{(method !== "ROOM_CHECKOUT" || !group.roomStayId) && <div className="mt-1.5 inline-flex rounded-lg bg-[#fbf4f8] p-1">{([["CASH", "Cash"], ["CARD", "Card"], ["PROMPTPAY", "PromptPay QR"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={method === value} onClick={() => setSettlementMethods((current) => ({ ...current, [group.id]: value }))} className={`rounded-md px-2 py-1.5 text-[9px] font-semibold ${method === value ? "bg-white text-ink shadow-sm" : "text-muted"}`}>{label}</button>)}</div>}<button type="button" disabled={placing} onClick={() => void settlePayer(group, method)} className="mt-2.5 h-9 w-full rounded-lg bg-[#ed168c] px-2 text-[10px] font-bold text-white disabled:opacity-50">{method === "ROOM_CHECKOUT" ? `Add ${money(group.total)} to room tab` : `Take ${money(group.total)} ${method === "PROMPTPAY" ? "PromptPay" : method.toLowerCase()}`}</button></>}</article>; })}{settledPayers.filter((entry) => !orderPayerGroups.some((group) => group.id === entry.id)).map((entry) => <article key={entry.id} className="self-start rounded-xl border border-emerald-200 bg-white p-3.5"><div className="flex justify-between text-xs font-bold"><span>{entry.label}</span><span>{money(entry.total)}</span></div><p className="mt-3 rounded-lg bg-emerald-50 px-2.5 py-2 text-[10px] font-semibold text-emerald-800"><Check size={13} className="mr-1 inline" />{entry.note}</p></article>)}</div>{error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}</div><footer className="flex items-end justify-between gap-4 border-t border-line px-5 py-3"><div><p className="text-[10px] text-muted">Table total</p><p className="font-display text-base font-extrabold">{money(orderPayerGroups.reduce((sum, group) => sum + group.total, 0) + settledPayers.reduce((sum, payer) => sum + payer.total, 0))}</p></div><p className="text-right text-[9px] text-muted">The table clears once everyone has settled.</p></footer></section></div>}
    {signaturePayerId && signatureGroup && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setSignaturePayerId(null); }}><section role="dialog" aria-modal="true" aria-label={`Sign for ${signatureGroup.name}`} className="w-full max-w-lg rounded-2xl border border-line bg-white p-5 shadow-float"><header className="flex items-start justify-between gap-3"><div><h2 className="font-display text-lg font-bold">Sign for Room {activeStays.find((stay) => stay.id === signatureGroup.roomStayId)?.room.roomNumber}</h2><p className="mt-1 text-[11px] text-muted">{signatureName}, please sign to add {money(signatureGroup.total)} to the room’s tab. You’ll pay at checkout.</p></div><button type="button" onClick={() => setSignaturePayerId(null)} aria-label="Close signature" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas"><X size={16} /></button></header><div className="mt-4 flex justify-between rounded-lg border border-line px-3 py-2 text-[10px] text-muted"><span>{signatureGroup.orders.map((order) => `${order.items.reduce((sum, line) => sum + line.quantity, 0)} × ${order.items.map((line) => line.menuItem.name).join(", ")}`).join(" · ")} · {selectedTable?.tableNumber}</span><span className="font-semibold">{money(signatureGroup.total)}</span></div><label className="mt-4 block text-[10px] font-semibold text-muted">Guest signing<input value={signatureName} onChange={(event) => setSignatureName(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-line px-3 text-xs text-ink outline-none focus:border-[#ed168c]" /></label><canvas ref={signatureCanvasRef} width={900} height={220} onPointerDown={startSignature} onPointerMove={drawSignature} onPointerUp={() => setSignatureDrawing(false)} onPointerCancel={() => setSignatureDrawing(false)} className="mt-3 h-40 w-full touch-none rounded-lg border border-line bg-[#fffafb]" aria-label="Sign here" /><p className="mt-1 text-[9px] text-muted">Sign above</p><div className="mt-4 flex gap-2"><button type="button" onClick={() => { const canvas = signatureCanvasRef.current; canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height); setSignatureData(""); }} className="h-10 flex-1 rounded-lg border border-line text-xs font-bold">Clear</button><button type="button" disabled={placing || !signatureName.trim() || !signatureData} onClick={() => void saveSignature()} className="h-10 flex-1 rounded-lg bg-[#ed168c] text-xs font-bold text-white disabled:opacity-40">{placing ? "Saving…" : "Confirm and add to tab"}</button></div></section></div>}
    {receipt && <ReceiptPreview receipt={receipt} restaurantName={restaurantName} restaurantLogoUrl={restaurantLogoUrl} onClose={() => setReceipt(null)} />}
    {plusJumps.map((jump) => <PlusJumpBadge key={jump.id} jump={jump} onDone={clearPlusJump} />)}
    </>
  );
}
