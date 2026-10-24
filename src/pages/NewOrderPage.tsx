import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  Utensils,
} from "lucide-react";
import { PageHeader, Panel, EmptyState, OrderBadge, SelectField } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import type { Category, DiningTable, MenuItem, OrderPaymentMethod } from "../lib/types";
import { money } from "../lib/types";
import { useOrderStore } from "../stores/orderStore";
import { useUiStore } from "../stores/uiStore";
import { useAuthStore } from "../stores/authStore";
import { ReceiptPreview, type CheckoutReceipt } from "../components/ReceiptPreview";
import { localizedFoodLabels, splitFoodLabels } from "../lib/foodTranslations";
import { useNavigate, useParams } from "react-router-dom";
import { translateUiText } from "../lib/translations";

type CartLine = {
  id: string;
  item: MenuItem;
  quantity: 1;
  removeIngredients: string;
  addExtras: string;
  allergyDietNotes: string;
  selectedAllergens: string[];
};
const categoryColors = [
  "from-[#e1edcf] to-[#f2f6e9]",
  "from-[#f4e6d9] to-[#fbf2e9]",
  "from-[#f3e3e4] to-[#fbf1f1]",
  "from-[#e0edf0] to-[#f1f7f7]",
  "from-[#ece7d8] to-[#f6f3e9]",
];
type ActiveRoomStay = { id: string; primaryGuestName: string; occupants: { id: string; name: string }[]; room: { roomNumber: number } };
export function NewOrderPage() {
  const { tableId = "" } = useParams();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [activeStays, setActiveStays] = useState<ActiveRoomStay[]>([]);
  const [checkoutMethod, setCheckoutMethod] = useState<OrderPaymentMethod>("CASH");
  const [roomStayId, setRoomStayId] = useState("");
  const [assignedRoomStayIds, setAssignedRoomStayIds] = useState<string[]>([]);
  const [savingRoomAssignments, setSavingRoomAssignments] = useState(false);
  const [roomPickerOpen, setRoomPickerOpen] = useState(false);
  const roomPickerRef = useRef<HTMLDivElement>(null);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<CheckoutReceipt | null>(null);
  const createOrder = useOrderStore((state) => state.createOrder);
  const orders = useOrderStore((state) => state.orders);
  const fetchOrders = useOrderStore((state) => state.fetchOrders);
  const notify = useUiStore((state) => state.notify);
  const language = useUiStore((state) => state.language);
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
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(() => {
    void fetchOrders().catch(() => undefined);
  }, [fetchOrders]);
  const selectedTable = tables.find((table) => table.id === tableId);
  useEffect(() => {
    const assignedIds = selectedTable?.assignedRoomStays?.map((stay) => stay.id) ?? [];
    setAssignedRoomStayIds(assignedIds);
    setRoomStayId(assignedIds.length === 1 ? assignedIds[0] : "");
  }, [tableId, selectedTable?.assignedRoomStays]);
  const activeTableOrders = orders
    .filter((order) => order.tableId === tableId && ["PENDING", "PREPARING", "READY", "SERVED"].includes(order.status))
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
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
  const total = cartLines.reduce(
    (sum, line) => sum + Number(line.item.price) * line.quantity,
    0,
  );
  const tableTotal = activeTableOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
  const allOrdersServed = activeTableOrders.length > 0 && activeTableOrders.every((order) => order.status === "SERVED");
  const add = (item: MenuItem) =>
    setCart((current) => [...current, {
      id: crypto.randomUUID(),
      item,
      quantity: 1,
      removeIngredients: "",
      addExtras: "",
      allergyDietNotes: "",
      selectedAllergens: [],
    }]);
  const removeCartLine = (lineId: string) => setCart((current) => current.filter((line) => line.id !== lineId));
  const updateCartLine = (lineId: string, update: (line: CartLine) => CartLine) =>
    setCart((current) => current.map((line) => line.id === lineId ? update(line) : line));
  const placeOrder = async () => {
    if (!tableId || !selectedTable) {
      setError("Return to the floor and open a table before sending an order.");
      return;
    }
    if (!cartLines.length) {
      setError("Add at least one item to this order.");
      return;
    }
    setPlacing(true);
    setError("");
    try {
      await createOrder(
        { tableId },
        cartLines.map(({ item, quantity, removeIngredients, addExtras, allergyDietNotes, selectedAllergens }) => ({
            menuItemId: item.id,
            quantity,
            ...(removeIngredients.trim() ? { removeIngredients: removeIngredients.trim() } : {}),
            ...(addExtras.trim() ? { addExtras: addExtras.trim() } : {}),
            ...(selectedAllergens.length ? { selectedAllergens } : {}),
            ...(allergyDietNotes.trim() ? { specialNotes: allergyDietNotes.trim() } : {}),
          })),
      );
      notify("Order sent to the kitchen.");
      setCart([]);
      const { data } = await api.get<DiningTable[]>("/tables");
      setTables(data);
      await fetchOrders();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPlacing(false);
    }
  };
  const checkoutTable = async () => {
    if (!allOrdersServed) {
      setError("All table orders must be served before checkout.");
      return;
    }
    if (checkoutMethod === "ROOM_CHECKOUT" && !roomStayId) {
      setError("Choose the guest room that should receive this folio charge.");
      return;
    }
    setPlacing(true);
    setError("");
    try {
      const receiptOrders = activeTableOrders.map((order) => ({ ...order, items: order.items.map((line) => ({ ...line })) }));
      const { data } = await api.post<{ totalAmount: number; tableNumber: string; room: { roomNumber: number } | null; checkedOutAt: string }>(`/tables/${tableId}/checkout`, {
        paymentMethod: checkoutMethod,
        ...(checkoutMethod === "ROOM_CHECKOUT" ? { roomStayId } : {}),
      });
      const chargedStay = checkoutMethod === "ROOM_CHECKOUT" ? activeStays.find((stay) => stay.id === roomStayId) : undefined;
      const receiptStays = checkoutMethod === "ROOM_CHECKOUT"
        ? (chargedStay ? [chargedStay] : [])
        : (selectedTable?.assignedRoomStays ?? []);
      const receiptRooms = receiptStays.flatMap((stay) => stay.room ? [{
        roomNumber: stay.room.roomNumber,
        guestName: stay.primaryGuestName,
        guestNames: [...new Set([stay.primaryGuestName, ...stay.occupants.map((occupant) => occupant.name)])],
      }] : []);
      setReceipt({
        tableNumber: data.tableNumber,
        orders: receiptOrders,
        paymentMethod: checkoutMethod,
        room: null,
        rooms: receiptRooms,
        totalAmount: Number(data.totalAmount),
        checkedOutAt: data.checkedOutAt,
        cashierName: currentUser?.name ?? "Restaurant staff",
      });
      notify(checkoutMethod === "CASH" ? `${data.tableNumber} paid in cash and checked out.` : `${data.tableNumber} added to the guest folio.`);
      setRoomStayId("");
      setCheckoutMethod("CASH");
      await Promise.all([fetchOrders(), api.get<DiningTable[]>("/tables").then((result) => setTables(result.data))]);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPlacing(false);
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
      setError(errorMessage(cause));
    } finally {
      setSavingRoomAssignments(false);
    }
  };

  return (
    <>
    <div className="page-enter">
      <PageHeader
        eyebrow="Floor · Table service"
        title={selectedTable ? selectedTable.tableNumber : "Table not found"}
        description="Review this table’s open tickets, add items, send them to the kitchen, then settle the bill."
        action={
          <button onClick={() => navigate("/tables")} className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-xs font-semibold">Back to tables</button>
        }
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row">
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
            <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
              {["All", ...categories.map((category) => category.name)].map(
                (name) => (
                  <button
                    key={name}
                    onClick={() => setSelectedCategory(name)}
                    className={`whitespace-nowrap rounded-xl px-3.5 text-xs font-semibold transition ${selectedCategory === name ? "bg-olive text-white" : "border border-line bg-white text-[#697066] hover:border-olive/30"}`}
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
              {menuItems.map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => add(item)}
                  className="group overflow-hidden rounded-[18px] border border-line bg-white text-left shadow-card transition hover:-translate-y-0.5 hover:border-olive/30 hover:shadow-float"
                >
                  <div
                    className={`relative flex h-28 items-end overflow-hidden bg-gradient-to-br ${categoryColors[index % categoryColors.length]} p-4`}
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
                          className="relative z-10 text-olive/55"
                          size={23}
                        />
                      </>
                    )}
                    {cart.some((line) => line.item.id === item.id) && (
                      <span className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-olive text-white shadow-sm">
                        <Check size={15} />
                      </span>
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
                      <span className="text-[10px] text-muted">Tap to add</span>
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#edf2e9] text-olive transition group-hover:bg-olive group-hover:text-white">
                        <Plus size={16} />
                      </span>
                    </div>
                  </div>
                </button>
              ))}
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
        <Panel className="sticky top-[86px] overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="font-display text-[15px] font-bold">
                Current ticket
              </h2>
              <p className="mt-1 text-xs text-muted">
                {cartLines.length} individual items
                in this order
              </p>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#edf2e9] text-olive">
              <ShoppingBag size={17} />
            </span>
          </div>
          <div className="p-5">
            {selectedTable && <section className="mb-4 rounded-2xl border border-line bg-[#fbfcf9] p-4" aria-label={`Table ${selectedTable.tableNumber} open orders`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                <div><h3 className="text-sm font-bold">{selectedTable.tableNumber} · Open tab</h3><p className="mt-1 text-[10px] text-muted">{selectedTable.capacity} seats · {activeTableOrders.length} active tickets</p></div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-olive">{selectedTable.status}</span>
              </div>
              <div className="mt-3" ref={roomPickerRef}>
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
                {assignedRoomStayIds.length > 0 && <p className="mt-2 text-[10px] text-muted">{t("Choose the guest room to receive the table bill at folio checkout.")}</p>}
              </div>
              {activeTableOrders.length ? <div className="mt-3 space-y-3">
                {activeTableOrders.map((order) => <article key={order.id} className="rounded-xl border border-line bg-white p-3">
                  <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="font-mono text-[10px] font-bold">#{order.id.slice(-6).toUpperCase()}</span><OrderBadge status={order.status} /></div><span className="text-[10px] text-muted">Ordered by {order.waiter?.name}</span></div>
                  <ul className="mt-2 space-y-1 text-xs">{order.items.map((line, index) => <li key={line.id ?? `${order.id}-${index}`}><span className="font-bold">{line.quantity}×</span> {line.menuItem.name}{line.addExtras ? <span className="text-muted"> · {line.addExtras}</span> : null}</li>)}</ul>
                  {order.servedBy && <p className="mt-2 text-[10px] font-semibold text-emerald-700">Collected / served by {order.servedBy.name}</p>}
                </article>)}
                <p className="text-[10px] text-muted">Add another ticket below to continue this table’s order.</p>
              </div> : <p className="mt-3 text-xs text-muted">No items have been ordered at this table yet. Start with the menu below.</p>}
              {activeTableOrders.length > 0 && <div className="mt-4 border-t border-line pt-4">
                <div className="flex items-center justify-between"><span className="text-xs font-semibold">Open table total</span><span className="font-display text-lg font-extrabold">{money(tableTotal)}</span></div>
                <SelectField label="Checkout payment" value={checkoutMethod} onChange={(event) => setCheckoutMethod(event.target.value as OrderPaymentMethod)}>
                  <option value="CASH">Pay with cash</option><option value="ROOM_CHECKOUT">Add to room folio</option>
                </SelectField>
                {checkoutMethod === "ROOM_CHECKOUT" && assignedRoomStayIds.length > 1 && <SelectField label={t("Guest room to charge") } value={roomStayId} onChange={(event) => setRoomStayId(event.target.value)}>
                  <option value="">{t("Choose an assigned guest room")}</option>
                  {activeStays.filter((stay) => assignedRoomStayIds.includes(stay.id)).map((stay) => <option key={stay.id} value={stay.id}>Room {stay.room?.roomNumber} · {stay.primaryGuestName}</option>)}
                </SelectField>}
                {checkoutMethod === "ROOM_CHECKOUT" && !roomStayId && <p className="mt-2 text-[10px] font-semibold text-rose-700">{t("Assign a guest room above before charging the room folio.")}</p>}
                {!allOrdersServed && <p className="mt-2 text-[10px] text-muted">All active tickets must be marked served before checkout.</p>}
                <button onClick={() => void checkoutTable()} disabled={placing || !allOrdersServed || (checkoutMethod === "ROOM_CHECKOUT" && !roomStayId)} className="mt-3 h-11 w-full rounded-xl border border-olive bg-white text-xs font-bold text-olive hover:bg-[#edf2e9] disabled:cursor-not-allowed disabled:opacity-40">{placing ? "Checking out…" : checkoutMethod === "CASH" ? "Record cash payment & close table" : "Charge room folio & close table"}</button>
              </div>}
            </section>}
            <div className="my-4 h-px bg-line" />
            {cartLines.length ? (
              <div className="max-h-[min(45vh,430px)] space-y-4 overflow-y-auto pr-1">
                {cartLines.map(({ id, item, quantity, removeIngredients, addExtras, allergyDietNotes, selectedAllergens }, lineIndex) => (
                  <div key={id} className="flex gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div><p className="text-xs font-bold leading-5">{item.name}</p><p className="text-[9px] font-semibold uppercase tracking-wide text-muted">Item {lineIndex + 1}</p></div>
                        <button
                          onClick={() => removeCartLine(id)}
                          className="text-[#a4a89f] hover:text-rose-600"
                          aria-label={`Remove ${item.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-muted">{quantity}× {money(item.price)} · customize this item only</span>
                        <span className="text-xs font-bold">{money(item.price)}</span>
                      </div>
                      {item.allergens?.length ? <fieldset className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2"><legend className="text-[10px] font-bold leading-4 text-amber-900">{language === "my" ? "ဓာတ်မတည့်နိုင်သောပစ္စည်း · သက်ဆိုင်ပါက ရွေးပါ" : language === "th" ? "สารก่อภูมิแพ้ · เลือกรายการที่เกี่ยวข้อง" : "Known allergens · select any that apply"}</legend><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{item.allergens.map((allergen, index) => <label key={allergen} className="inline-flex cursor-pointer items-center gap-1 text-[10px] font-semibold text-amber-900"><input type="checkbox" checked={selectedAllergens.includes(allergen)} onChange={(event) => updateCartLine(id, (line) => ({ ...line, selectedAllergens: event.target.checked ? [...selectedAllergens, allergen] : selectedAllergens.filter((value) => value !== allergen) }))} className="accent-amber-700" />{localizedFoodLabels(item.allergens, item.allergensMy, item.allergensTh, language)[index] ?? allergen}</label>)}</div></fieldset> : null}
                      <label className="mt-2 block text-[9px] font-semibold text-muted">Remove ingredients
                        <input value={removeIngredients} onChange={(e) => updateCartLine(id, (line) => ({ ...line, removeIngredients: e.target.value }))} placeholder="e.g. no onion, no tomato" className="mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-2 text-[10px] font-normal text-ink outline-none focus:border-olive" />
                      </label>
                      <div className="mt-2">
                        <span className="text-[9px] font-semibold text-muted">{language === "my" ? "ရရှိနိုင်သောအပိုများ" : language === "th" ? "รายการเสริมที่เลือกได้" : "Available extras"}</span>
                        {splitFoodLabels(item.availableExtras).length ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {splitFoodLabels(item.availableExtras).map((extra, index) => {
                              const selectedExtras = addExtras.split(",").map((value) => value.trim()).filter(Boolean);
                              const selected = selectedExtras.some((value) => value.toLowerCase() === extra.toLowerCase());
                              return <label key={extra} className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-semibold ${selected ? "border-olive bg-olive text-white" : "border-line bg-white text-muted hover:border-olive"}`}>
                                <input type="checkbox" checked={selected} onChange={() => {
                                const next = selected ? selectedExtras.filter((value) => value.toLowerCase() !== extra.toLowerCase()) : [...selectedExtras, extra];
                                updateCartLine(id, (line) => ({ ...line, addExtras: next.join(", ") }));
                              }} className="accent-olive" />{localizedFoodLabels(item.availableExtras, item.availableExtrasMy, item.availableExtrasTh, language)[index] ?? extra}</label>;
                            })}
                          </div>
                        ) : <p className="mt-1 text-[10px] text-muted">No extras configured for this dish.</p>}
                        <input value={addExtras} onChange={(e) => updateCartLine(id, (line) => ({ ...line, addExtras: e.target.value }))} placeholder="Other extras or special requests" className="mt-2 w-full rounded-lg border border-line bg-white px-2.5 py-2 text-[10px] font-normal text-ink outline-none focus:border-olive" />
                        <p className="mt-1 text-[9px] text-muted">Confirm any extra charges before sending.</p>
                      </div>
                      <label className="mt-2 block text-[9px] font-semibold text-muted">Allergy or dietary needs
                        <input value={allergyDietNotes} onChange={(e) => updateCartLine(id, (line) => ({ ...line, allergyDietNotes: e.target.value }))} placeholder="Tell the kitchen about allergies or diet" className="mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-2 text-[10px] font-normal text-ink outline-none focus:border-olive" />
                      </label>
                    </div>
                  </div>
                ))}
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
            <div className="mt-4 border-t border-line pt-4">
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
                className="focus-ring mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-olive text-sm font-bold text-white transition hover:bg-[#334438] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {placing ? "Sending to kitchen…" : "Send to kitchen"}
                <ArrowRight size={16} />
              </button>
              <p className="mt-3 text-center text-[10px] text-muted">
                The kitchen sees new tickets instantly.
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
    {receipt && <ReceiptPreview receipt={receipt} restaurantName={restaurantName} restaurantLogoUrl={restaurantLogoUrl} onClose={() => setReceipt(null)} />}
    </>
  );
}
