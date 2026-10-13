import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  Utensils,
} from "lucide-react";
import { PageHeader, Panel, EmptyState, SelectField } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import type { Category, DiningTable, MenuItem, OrderPaymentMethod, Room } from "../lib/types";
import { money } from "../lib/types";
import { useOrderStore } from "../stores/orderStore";
import { useUiStore } from "../stores/uiStore";

type CartLine = {
  item: MenuItem;
  quantity: number;
  removeIngredients: string;
  addExtras: string;
  allergyDietNotes: string;
};
const categoryColors = [
  "from-[#e1edcf] to-[#f2f6e9]",
  "from-[#f4e6d9] to-[#fbf2e9]",
  "from-[#f3e3e4] to-[#fbf1f1]",
  "from-[#e0edf0] to-[#f1f7f7]",
  "from-[#ece7d8] to-[#f6f3e9]",
];

export function NewOrderPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [destinationType, setDestinationType] = useState<"TABLE" | "ROOM">("TABLE");
  const [paymentMethod, setPaymentMethod] = useState<OrderPaymentMethod>("CASH");
  const [roomStayId, setRoomStayId] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [tableId, setTableId] = useState("");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const createOrder = useOrderStore((state) => state.createOrder);
  const notify = useUiStore((state) => state.notify);
  useEffect(() => {
    void Promise.all([
      api.get<Category[]>("/categories"),
      api.get<DiningTable[]>("/tables"),
      api.get<Room[]>("/rooms"),
    ])
      .then(([cat, tbl, rm]) => {
        setCategories(cat.data);
        setTables(tbl.data);
        setRooms(rm.data);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);
  // An occupied table can place multiple tickets during the same sitting.
  const availableTables = tables;
  const activeStays = rooms.flatMap((room) => (room.stays ?? []).map((stay) => ({ ...stay, room })));
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
  const cartLines = Object.values(cart);
  const total = cartLines.reduce(
    (sum, line) => sum + Number(line.item.price) * line.quantity,
    0,
  );
  const add = (item: MenuItem) =>
    setCart((current) => ({
      ...current,
      [item.id]: {
        item,
        quantity: (current[item.id]?.quantity ?? 0) + 1,
        removeIngredients: current[item.id]?.removeIngredients ?? "",
        addExtras: current[item.id]?.addExtras ?? "",
        allergyDietNotes: current[item.id]?.allergyDietNotes ?? "",
      },
    }));
  const adjust = (id: string, delta: number) =>
    setCart((current) => {
      const qty = (current[id]?.quantity ?? 0) + delta;
      if (qty <= 0) {
        const next = { ...current };
        delete next[id];
        return next;
      }
      return { ...current, [id]: { ...current[id], quantity: qty } };
    });
  const placeOrder = async () => {
    if (destinationType === "TABLE" && !tableId) {
      setError("Choose a table before sending the order.");
      return;
    }
    if ((destinationType === "ROOM" || paymentMethod === "ROOM_CHECKOUT") && !roomStayId) {
      setError("Choose the in-house guest room for room service or checkout billing.");
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
        {
          ...(destinationType === "TABLE" ? { tableId } : {}),
          ...((destinationType === "ROOM" || paymentMethod === "ROOM_CHECKOUT") ? { roomStayId } : {}),
          paymentMethod,
        },
        cartLines.map(({ item, quantity, removeIngredients, addExtras, allergyDietNotes }) => ({
          menuItemId: item.id,
          quantity,
          ...(removeIngredients.trim() ? { removeIngredients: removeIngredients.trim() } : {}),
          ...(addExtras.trim() ? { addExtras: addExtras.trim() } : {}),
          ...(allergyDietNotes.trim() ? { specialNotes: allergyDietNotes.trim() } : {}),
        })),
      );
      notify("Order sent to the kitchen.");
      setCart({});
      setTableId("");
      setRoomStayId("");
      const { data } = await api.get<DiningTable[]>("/tables");
      setTables(data);
      const roomData = await api.get<Room[]>("/rooms");
      setRooms(roomData.data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Floor · New ticket"
        title="Build an order"
        description="Choose a table, add a few good things, and send it straight to the kitchen."
        action={
          <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-3.5 py-2.5 text-xs font-semibold">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Kitchen
            connected
          </div>
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
                    {cart[item.id] && (
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
                    {(item.allergens || item.dietaryInfo) && (
                      <div className="mt-2 space-y-1">
                        {item.allergens && <p className="text-[10px] font-semibold text-amber-800">Contains: {item.allergens}</p>}
                        {item.dietaryInfo && <p className="text-[10px] font-semibold text-emerald-800">{item.dietaryInfo}</p>}
                      </div>
                    )}
                    {item.availableExtras && <p className="mt-1 truncate text-[10px] text-sky-800">Extras: {item.availableExtras}</p>}
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
                {cartLines.reduce((sum, line) => sum + line.quantity, 0)} items
                in this order
              </p>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#edf2e9] text-olive">
              <ShoppingBag size={17} />
            </span>
          </div>
          <div className="p-5">
            <SelectField label="Order destination" value={destinationType} onChange={(e) => setDestinationType(e.target.value as "TABLE" | "ROOM")}>
              <option value="TABLE">Restaurant table</option>
              <option value="ROOM">Room service</option>
            </SelectField>
            {destinationType === "TABLE" && <SelectField label="Table" value={tableId} onChange={(e) => setTableId(e.target.value)}>
              <option value="">Select a table</option>
              {availableTables.map((table) => <option key={table.id} value={table.id}>Table {table.tableNumber} · {table.capacity} seats{table.status === "OCCUPIED" ? " · occupied" : table.status === "RESERVED" ? " · reserved" : ""}</option>)}
            </SelectField>}
            <SelectField label="Payment" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as OrderPaymentMethod)}>
              <option value="CASH">Pay by cash</option>
              <option value="ROOM_CHECKOUT">Charge to room for checkout</option>
            </SelectField>
            {(destinationType === "ROOM" || paymentMethod === "ROOM_CHECKOUT") && <SelectField label="In-house guest room" value={roomStayId} onChange={(e) => setRoomStayId(e.target.value)}>
              <option value="">Select a current guest</option>
              {activeStays.map((stay) => <option key={stay.id} value={stay.id}>Room {stay.room?.roomNumber} · {stay.primaryGuestName}</option>)}
            </SelectField>}
            <div className="my-4 h-px bg-line" />
            {cartLines.length ? (
              <div className="max-h-[min(45vh,430px)] space-y-4 overflow-y-auto pr-1">
                {cartLines.map(({ item, quantity, removeIngredients, addExtras, allergyDietNotes }) => (
                  <div key={item.id} className="flex gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-bold leading-5">
                          {item.name}
                        </p>
                        <button
                          onClick={() => adjust(item.id, -quantity)}
                          className="text-[#a4a89f] hover:text-rose-600"
                          aria-label={`Remove ${item.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-muted">
                          {money(Number(item.price) * quantity)}
                        </span>
                        <div className="flex items-center gap-2 rounded-lg bg-canvas p-1">
                          <button
                            onClick={() => adjust(item.id, -1)}
                            className="grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-white hover:text-ink"
                            aria-label="Decrease quantity"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="w-4 text-center text-xs font-bold">
                            {quantity}
                          </span>
                          <button
                            onClick={() => adjust(item.id, 1)}
                            className="grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-white hover:text-ink"
                            aria-label="Increase quantity"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </div>
                      {item.allergens && <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[10px] font-semibold leading-4 text-amber-900">Known allergens: {item.allergens}. Confirm allergy requests with the kitchen.</p>}
                      <label className="mt-2 block text-[9px] font-semibold text-muted">Remove ingredients
                        <input value={removeIngredients} onChange={(e) => setCart((current) => ({ ...current, [item.id]: { ...current[item.id], removeIngredients: e.target.value } }))} placeholder="e.g. no onion, no tomato" className="mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-2 text-[10px] font-normal text-ink outline-none focus:border-olive" />
                      </label>
                      <div className="mt-2">
                        <span className="text-[9px] font-semibold text-muted">Available extras</span>
                        {item.availableExtras ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {item.availableExtras.split(",").map((extra) => extra.trim()).filter(Boolean).map((extra) => {
                              const selectedExtras = addExtras.split(",").map((value) => value.trim()).filter(Boolean);
                              const selected = selectedExtras.some((value) => value.toLowerCase() === extra.toLowerCase());
                              return <button key={extra} type="button" onClick={() => {
                                const next = selected ? selectedExtras.filter((value) => value.toLowerCase() !== extra.toLowerCase()) : [...selectedExtras, extra];
                                setCart((current) => ({ ...current, [item.id]: { ...current[item.id], addExtras: next.join(", ") } }));
                              }} className={`rounded-full border px-2 py-1 text-[9px] font-semibold ${selected ? "border-olive bg-olive text-white" : "border-line bg-white text-muted hover:border-olive"}`}>{extra}</button>;
                            })}
                          </div>
                        ) : <p className="mt-1 text-[10px] text-muted">No extras configured for this dish.</p>}
                        <input value={addExtras} onChange={(e) => setCart((current) => ({ ...current, [item.id]: { ...current[item.id], addExtras: e.target.value } }))} placeholder="Other extras or special requests" className="mt-2 w-full rounded-lg border border-line bg-white px-2.5 py-2 text-[10px] font-normal text-ink outline-none focus:border-olive" />
                        <p className="mt-1 text-[9px] text-muted">Confirm any extra charges before sending.</p>
                      </div>
                      <label className="mt-2 block text-[9px] font-semibold text-muted">Allergy or dietary needs
                        <input value={allergyDietNotes} onChange={(e) => setCart((current) => ({ ...current, [item.id]: { ...current[item.id], allergyDietNotes: e.target.value } }))} placeholder="Tell the kitchen about allergies or diet" className="mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-2 text-[10px] font-normal text-ink outline-none focus:border-olive" />
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
                  placing || !cartLines.length || (destinationType === "TABLE" ? !availableTables.length : !activeStays.length)
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
  );
}
