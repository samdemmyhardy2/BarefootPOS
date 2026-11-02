import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Split, X } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { money, type Order, type OrderLine, type TableBill, type TableBillLine } from "../lib/types";
import type { CheckoutReceipt } from "./ReceiptPreview";

type Stay = { id: string; primaryGuestName: string; cashOnly?: boolean; occupants: { id: string; name: string }[]; room: { roomNumber: string | number } };
type Unit = TableBillLine & { key: string };
type PayMethod = "ROOM_CHECKOUT" | "CASH" | "CARD" | "PROMPTPAY";
type View = "whole" | "split" | "bills";

const tones = [
  { on: "bg-[#5c6b86] text-white", off: "bg-[#e7ebf2] text-[#5c6b86]", dot: "bg-[#5c6b86]" },
  { on: "bg-[#c56a3a] text-white", off: "bg-[#f8e4d6] text-[#c56a3a]", dot: "bg-[#c56a3a]" },
  { on: "bg-[#7a4ea3] text-white", off: "bg-[#efe6fb] text-[#7a4ea3]", dot: "bg-[#7a4ea3]" },
  { on: "bg-[#2f7d6d] text-white", off: "bg-[#e3f3ef] text-[#2f7d6d]", dot: "bg-[#2f7d6d]" },
];

function tone(number: number) {
  return tones[(number - 1) % tones.length];
}

function guestNames(stay: Stay) {
  return [...new Set([stay.primaryGuestName, ...stay.occupants.map((person) => person.name)].filter(Boolean))];
}

function groupUnits(units: Unit[]) {
  const groups = new Map<string, { name: string; detail: string | null; quantity: number; amount: number }>();
  for (const unit of units) {
    const key = `${unit.name}\0${unit.detail ?? ""}`;
    const group = groups.get(key) ?? { name: unit.name, detail: unit.detail, quantity: 0, amount: 0 };
    group.quantity += 1;
    group.amount = Math.round((group.amount + unit.amount) * 100) / 100;
    groups.set(key, group);
  }
  return [...groups.values()];
}

function groupLines(lines: TableBillLine[]) {
  return groupUnits(lines.map((line) => ({ ...line, key: `${line.orderItemId}:${line.unit}` })));
}

function payPhrase(method: PayMethod, amount: number, roomNumber?: string | number) {
  if (method === "ROOM_CHECKOUT") return roomNumber ? `Add ${money(amount)} to Room ${roomNumber}'s tab and sign` : "Choose a room";
  if (method === "CARD") return `Take ${money(amount)} card`;
  if (method === "PROMPTPAY") return `Take ${money(amount)} PromptPay`;
  return `Take ${money(amount)} cash`;
}

export function SettleTableDialog({
  tableId,
  tableNumber,
  orders,
  stays,
  assignedStayIds,
  cashierName,
  onClose,
  onChanged,
  onReceipt,
}: {
  tableId: string;
  tableNumber: string;
  orders: Order[];
  stays: Stay[];
  assignedStayIds: string[];
  cashierName: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onReceipt: (receipt: CheckoutReceipt) => void;
}) {
  const [view, setView] = useState<View>("whole");
  const [splitFrom, setSplitFrom] = useState<View>("whole");
  const [units, setUnits] = useState<Unit[]>([]);
  const [bills, setBills] = useState<TableBill[]>([]);
  const [assign, setAssign] = useState<Record<string, number>>({});
  const [billCount, setBillCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wholeMode, setWholeMode] = useState<"ROOM_CHECKOUT" | "NOW">("NOW");
  const [wholeMethod, setWholeMethod] = useState<Exclude<PayMethod, "ROOM_CHECKOUT">>("CASH");
  const [wholeStayId, setWholeStayId] = useState("");
  const [billMode, setBillMode] = useState<Record<string, "ROOM_CHECKOUT" | "NOW">>({});
  const [billMethod, setBillMethod] = useState<Record<string, Exclude<PayMethod, "ROOM_CHECKOUT">>>({});
  const [billStay, setBillStay] = useState<Record<string, string>>({});
  const [roomQuery, setRoomQuery] = useState<Record<string, string>>({});
  const [signFor, setSignFor] = useState<{ billId: string | null; stayId: string; amount: number; lines: TableBillLine[] } | null>(null);
  const [signName, setSignName] = useState("");
  const [signData, setSignData] = useState("");
  const [drawing, setDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const load = async () => {
    const { data } = await api.get<{ units: Unit[]; bills: TableBill[] }>(`/tables/${tableId}/bills`);
    setUnits(data.units);
    setBills(data.bills);
    const open = data.bills.filter((bill) => bill.status === "OPEN");
    const settled = data.bills.filter((bill) => bill.status === "SETTLED");
    setView(open.length || settled.length ? "bills" : "whole");
    return data;
  };

  useEffect(() => {
    let cancel = false;
    void load().catch((cause) => { if (!cancel) setError(errorMessage(cause)); }).finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [tableId]);

  const openBills = bills.filter((bill) => bill.status === "OPEN").sort((a, b) => a.number - b.number);
  const settledBills = bills.filter((bill) => bill.status === "SETTLED").sort((a, b) => a.number - b.number);
  const total = Math.round([...units, ...settledBills.flatMap((bill) => bill.lines)].reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
  const wholeTotal = Math.round(units.reduce((sum, unit) => sum + unit.amount, 0) * 100) / 100;

  const reservedNumbers = new Set(settledBills.map((bill) => bill.number));
  const openSplit = (from: View) => {
    const next: Record<string, number> = {};
    let count = Math.max(1, ...settledBills.map((bill) => bill.number), 0);
    if (from === "bills" && openBills.length) {
      openBills.forEach((bill) => {
        count = Math.max(count, bill.number);
        bill.lines.forEach((line) => { next[`${line.orderItemId}:${line.unit}`] = bill.number; });
      });
    }
    const firstOpen = [...Array(count + 1).keys()].slice(1).find((number) => !reservedNumbers.has(number)) ?? count + 1;
    units.forEach((unit) => { if (!next[unit.key]) next[unit.key] = firstOpen; });
    setAssign(next);
    setBillCount(Math.max(count, firstOpen));
    setSplitFrom(from);
    setView("split");
    setError("");
  };

  const draftBills = () => {
    const groups = new Map<number, Unit[]>();
    units.forEach((unit) => {
      const number = assign[unit.key] ?? 1;
      groups.set(number, [...(groups.get(number) ?? []), unit]);
    });
    return [...groups.entries()].filter(([, lines]) => lines.length).sort((a, b) => a[0] - b[0]);
  };

  const saveSplit = async () => {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.put<{ units: Unit[]; bills: TableBill[] }>(`/tables/${tableId}/bill-split`, {
        bills: draftBills().map(([number, lines]) => ({ number, lines: lines.map((line) => ({ orderItemId: line.orderItemId, unit: line.unit })) })),
      });
      setUnits(data.units);
      setBills(data.bills);
      setView("bills");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const receiptFor = (lines: TableBillLine[], amount: number, method: PayMethod, stay: Stay | undefined, paidAt: string, signature?: { name: string; data: string }, billNumber?: number): CheckoutReceipt => {
    const grouped = groupLines(lines);
    const items: OrderLine[] = grouped.map((line, index) => ({
      id: `bill-line-${index}`,
      menuItemId: `bill-line-${index}`,
      quantity: line.quantity,
      unitPrice: line.quantity ? line.amount / line.quantity : line.amount,
      subtotal: line.amount,
      specialNotes: line.detail,
      menuItem: { id: `bill-line-${index}`, name: line.name, price: line.amount } as unknown as OrderLine["menuItem"],
    }));
    const names = stay ? guestNames(stay) : [];
    const charged = stay ? [{ roomNumber: stay.room.roomNumber, guestName: stay.primaryGuestName, guestNames: names }] : [];
    const assigned = stays.filter((entry) => assignedStayIds.includes(entry.id)).map((entry) => ({ roomNumber: entry.room.roomNumber, guestName: entry.primaryGuestName, guestNames: guestNames(entry) }));
    return {
      tableNumber,
      locationLabel: billNumber ? `Table ${tableNumber} · Bill ${billNumber}` : `Table ${tableNumber}`,
      orders: [{
        id: `bill-${billNumber ?? 1}`,
        paymentMethod: method,
        paymentStatus: method === "ROOM_CHECKOUT" ? "ROOM_FOLIO" : "PAID",
        waiterId: "",
        waiter: { id: "", name: cashierName },
        status: "COMPLETED",
        totalAmount: amount,
        items,
        createdAt: paidAt,
        updatedAt: paidAt,
      }],
      paymentMethod: method,
      room: null,
      rooms: charged.length ? charged : assigned,
      totalAmount: amount,
      checkedOutAt: paidAt,
      cashierName,
      ...(signature ? { signature } : {}),
    };
  };

  const settleWhole = async (signature?: { name: string; data: string }) => {
    const method: PayMethod = wholeMode === "ROOM_CHECKOUT" ? "ROOM_CHECKOUT" : wholeMethod;
    const stay = stays.find((entry) => entry.id === wholeStayId);
    if (method === "ROOM_CHECKOUT" && !stay) { setError("Choose a room for this bill."); return; }
    if (method === "ROOM_CHECKOUT" && !signature) {
      setSignName(stay?.primaryGuestName ?? "");
      setSignData("");
      setSignFor({ billId: null, stayId: stay?.id ?? "", amount: wholeTotal, lines: units });
      return;
    }
    setBusy(true);
    setError("");
    try {
      const orderIds = orders.map((order) => order.id).filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
      if (!orderIds.length) { setError("These orders are still saving. Wait a moment, then settle again."); setBusy(false); return; }
      const seated = assignedStayIds.length === 1 ? stays.find((entry) => entry.id === assignedStayIds[0]) : undefined;
      const guest = stay ?? (method === "ROOM_CHECKOUT" ? undefined : seated);
      const { data } = await api.post<{ tableNumber: string; totalAmount: number; checkedOutAt: string; tableCleared: boolean; signedByName?: string | null }>(`/tables/${tableId}/settle-party`, { orderIds, paymentMethod: method, amount: wholeTotal, ...(guest ? { roomStayId: guest.id } : {}), ...(method === "ROOM_CHECKOUT" && signature ? { signedByName: signature.name, signatureData: signature.data } : {}) });
      await onChanged();
      onReceipt(receiptFor(units, Number(data.totalAmount), method, stay, data.checkedOutAt, signature && { name: data.signedByName ?? signature.name, data: signature.data }));
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const settleBill = async (bill: TableBill, signature?: { name: string; data: string }) => {
    const mode = billMode[bill.id] ?? "NOW";
    const method: PayMethod = mode === "ROOM_CHECKOUT" ? "ROOM_CHECKOUT" : (billMethod[bill.id] ?? "CASH");
    const stay = stays.find((entry) => entry.id === billStay[bill.id]);
    if (method === "ROOM_CHECKOUT" && !stay) { setError("Choose a room for this bill."); return; }
    if (method === "ROOM_CHECKOUT" && stay?.cashOnly) { setError("This stay is cash only. Take cash, card, or PromptPay."); return; }
    if (method === "ROOM_CHECKOUT" && !signature) {
      setSignName(stay?.primaryGuestName ?? "");
      setSignData("");
      setSignFor({ billId: bill.id, stayId: stay?.id ?? "", amount: bill.amount, lines: bill.lines });
      return;
    }
    setBusy(true);
    setError("");
    try {
      const seated = assignedStayIds.length === 1 ? stays.find((entry) => entry.id === assignedStayIds[0]) : undefined;
      const guest = stay ?? (method === "ROOM_CHECKOUT" ? undefined : seated);
      const { data } = await api.post<{ bill: TableBill; tableNumber: string; tableCleared: boolean; checkedOutAt: string; room: { roomNumber: string; guestName: string; guestNames: string[] } | null }>(`/tables/${tableId}/bills/${bill.id}/settle`, { paymentMethod: method, ...(guest ? { roomStayId: guest.id } : {}), ...(method === "ROOM_CHECKOUT" && signature ? { signedByName: signature.name, signatureData: signature.data } : {}) });
      await onChanged();
      onReceipt(receiptFor(bill.lines, bill.amount, method, stay, data.checkedOutAt, signature && { name: data.bill.signedByName ?? signature.name, data: signature.data }, bill.number));
      if (data.tableCleared) onClose();
      else {
        const next = await load();
        if (!next.units.length && next.bills.every((entry) => entry.status === "SETTLED")) onClose();
      }
      setSignFor(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  };

  const roomChoices = (query: string, selectedId: string) => {
    const q = query.trim().toLowerCase();
    const text = (stay: Stay) => `${stay.room.roomNumber} ${guestNames(stay).join(" ")}`.toLowerCase();
    if (q) return stays.filter((stay) => text(stay).includes(q));
    const assigned = stays.filter((stay) => assignedStayIds.includes(stay.id));
    const visible = assigned.length ? [...assigned] : [...stays];
    const selected = stays.find((stay) => stay.id === selectedId);
    if (selected && !visible.some((stay) => stay.id === selected.id)) visible.unshift(selected);
    return visible;
  };

  const payCard = (key: string, amount: number, onTake: () => void, mode: "ROOM_CHECKOUT" | "NOW", setMode: (mode: "ROOM_CHECKOUT" | "NOW") => void, method: Exclude<PayMethod, "ROOM_CHECKOUT">, setMethod: (method: Exclude<PayMethod, "ROOM_CHECKOUT">) => void, stayId: string, setStayId: (id: string) => void) => {
    const stay = stays.find((entry) => entry.id === stayId);
    const query = roomQuery[key] ?? "";
    const choices = roomChoices(query, stayId);
    return <>
      <p className="text-[11px] font-semibold text-ink">How are they paying?</p>
      <div className="mt-2 inline-flex rounded-lg bg-[#f6f1f4] p-1">
        {([["ROOM_CHECKOUT", "Add to room tab"], ["NOW", "Pay now"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`rounded-md px-3 py-1.5 text-[11px] font-semibold ${mode === value ? "bg-white text-ink shadow-sm" : "text-muted"}`}>{label}</button>)}
      </div>
      {mode === "ROOM_CHECKOUT" ? <div className="mt-3">
        <p className="text-[11px] font-semibold text-ink">Which room?</p>
        <div className="mt-2 space-y-1.5">
          {choices.map((choice) => {
            const selected = stayId === choice.id;
            return <button key={choice.id} type="button" aria-pressed={selected} onClick={() => setStayId(choice.id)} className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[12px] ${selected ? "border-[#f2168d] bg-[#fff5fa]" : "border-[#eadfe6]"}`}>
              <span className={`grid h-3.5 w-3.5 place-items-center rounded-full border ${selected ? "border-[#f2168d]" : "border-[#d9c3cf]"}`}>{selected && <span className="h-2 w-2 rounded-full bg-[#f2168d]" />}</span>
              <span className="min-w-0 truncate">Room {choice.room.roomNumber} <span className="text-muted">{guestNames(choice).join(" and ")}</span></span>
            </button>;
          })}
          <label className="flex items-center gap-2 rounded-lg border border-[#eadfe6] px-2.5 py-2 text-[12px]">
            <span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border border-[#d9c3cf]" />
            <span className="shrink-0 text-muted">Another room</span>
            <input value={query} onChange={(event) => setRoomQuery((current) => ({ ...current, [key]: event.target.value }))} placeholder="Search all rooms" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#b0b4bb]" />
          </label>
        </div>
        {stay?.cashOnly && <p className="mt-2 text-[11px] font-semibold text-[#a64728]">Cash only. Pay now.</p>}
      </div> : <div className="mt-3">
        <p className="text-[11px] font-semibold text-ink">Payment method</p>
        <div className="mt-2 inline-flex rounded-lg bg-[#f6f1f4] p-1">
          {([["CASH", "Cash"], ["CARD", "Card"], ["PROMPTPAY", "PromptPay QR"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={method === value} onClick={() => setMethod(value)} className={`rounded-md px-3 py-1.5 text-[11px] font-semibold ${method === value ? "bg-white text-ink shadow-sm" : "text-muted"}`}>{label}</button>)}
        </div>
      </div>}
      <button type="button" disabled={busy || (mode === "ROOM_CHECKOUT" && (!stay || stay.cashOnly))} onClick={onTake} className="mt-3 h-11 w-full rounded-xl bg-[#f2168d] text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
        {payPhrase(mode === "ROOM_CHECKOUT" ? "ROOM_CHECKOUT" : method, amount, stay?.room.roomNumber)}
      </button>
    </>;
  };

  const drafts = view === "split" ? draftBills() : [];

  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/40 p-3 backdrop-blur-[2px] sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label={view === "split" ? `Split the bill · Table ${tableNumber}` : `Settle Table ${tableNumber}`} className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-float">
      <header className="flex items-start gap-4 px-5 pb-2 pt-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold">{view === "split" ? `Split the bill · Table ${tableNumber}` : `Settle Table ${tableNumber}`}</h2>
          <p className="mt-1 max-w-3xl text-[12px] text-[#6d7380]">{view === "split" ? "Tap a number to move an item to that bill, or New bill to start another. Anything ordered twice is listed twice, so each one can go on a different bill." : view === "bills" ? "Each bill settles on its own. Add it to a room's tab, where the guest signs, or pay now." : "Everything is on one bill. Settle it all at once, or split it so each person pays their part or adds it to their room."}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close settlement" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas"><X size={16} /></button>
      </header>
      {loading ? <p className="px-5 py-10 text-sm text-muted">Loading the bill…</p> : view === "split" ? <>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 py-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#9aa09a]">Items · {units.length}</p>
            <div className="mt-2 overflow-hidden rounded-xl border border-[#f0e4ea]">
              {units.map((unit) => {
                const selected = assign[unit.key] ?? 1;
                return <div key={unit.key} className={`flex items-center gap-3 border-b border-[#f6eef2] px-3 py-2.5 last:border-0 ${selected > 1 ? "bg-[#fff5f8]" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold">{unit.name}</p>
                    {unit.detail && <p className="truncate text-[11px] text-[#8d939c]">{unit.detail}</p>}
                  </div>
                  <span className="shrink-0 text-[12px] font-semibold">{money(unit.amount)}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    {Array.from({ length: billCount }, (_, index) => index + 1).filter((number) => !reservedNumbers.has(number)).map((number) => <button key={number} type="button" aria-pressed={selected === number} onClick={() => setAssign((current) => ({ ...current, [unit.key]: number }))} className={`grid h-7 w-7 place-items-center rounded-full text-[12px] font-bold ${selected === number ? tone(number).on : tone(number).off}`}>{number}</button>)}
                    <button type="button" onClick={() => { const number = billCount + 1; setBillCount(number); setAssign((current) => ({ ...current, [unit.key]: number })); }} className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-[#f3a3cb] px-2 text-[11px] font-bold text-[#f2168d]">+ New bill</button>
                  </div>
                </div>;
              })}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#9aa09a]">Bills · {drafts.length}</p>
            <div className="mt-2 space-y-2">
              {drafts.map(([number, lines]) => <article key={number} className="rounded-xl border border-[#f0e4ea] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2"><span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-white ${tone(number).dot}`}>{number}</span><div><p className="text-[13px] font-bold">Bill {number}</p><p className="text-[11px] text-muted">{lines.length} item{lines.length === 1 ? "" : "s"}</p></div></div>
                  <strong className="text-[13px]">{money(lines.reduce((sum, line) => sum + line.amount, 0))}</strong>
                </div>
                <div className="mt-2 space-y-1 border-t border-[#f6eef2] pt-2">
                  {groupUnits(lines).map((line) => <div key={`${line.name}-${line.detail ?? ""}`} className="flex justify-between gap-2 text-[11px] text-[#5c6370]"><span className="min-w-0 truncate">{line.quantity > 1 ? `${line.quantity} × ` : ""}{line.name}</span><span className="shrink-0">{money(line.amount)}</span></div>)}
                </div>
              </article>)}
            </div>
          </div>
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-[#f3e7ed] px-5 py-3">
          <div><p className="text-[11px] text-muted">Table total</p><p className="text-[15px] font-extrabold">{money(wholeTotal)} · {drafts.length} bill{drafts.length === 1 ? "" : "s"}</p></div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setView(splitFrom)} className="h-10 rounded-xl border border-[#eadfe6] px-4 text-[13px] font-bold">Cancel</button>
            <button type="button" disabled={busy || !drafts.length} onClick={() => void saveSplit()} className="h-10 rounded-xl bg-[#f2168d] px-4 text-[13px] font-bold text-white disabled:opacity-40">Settle {drafts.length} bill{drafts.length === 1 ? "" : "s"}</button>
          </div>
        </footer>
      </> : view === "whole" ? <>
        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto px-5 py-3 lg:grid-cols-2">
          <article className="rounded-xl border border-[#f0e4ea] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-[#5c6b86] text-[10px] font-bold text-white">1</span><div><p className="text-[13px] font-bold">Whole table</p><p className="text-[11px] text-muted">Bill 1 · {units.length} item{units.length === 1 ? "" : "s"}</p></div></div>
              <strong>{money(wholeTotal)}</strong>
            </div>
            <div className="mt-3 space-y-1 border-b border-[#f3e7ed] pb-3">
              {groupUnits(units).map((line) => <div key={`${line.name}-${line.detail ?? ""}`} className="flex justify-between gap-2 text-[12px]"><span className="min-w-0">{line.quantity > 1 ? `${line.quantity} × ` : ""}{line.name}</span><span className="shrink-0 text-[#5c6370]">{money(line.amount)}</span></div>)}
            </div>
            <div className="pt-3">{payCard("whole", wholeTotal, () => void settleWhole(), wholeMode, setWholeMode, wholeMethod, setWholeMethod, wholeStayId, setWholeStayId)}</div>
          </article>
          <button type="button" onClick={() => openSplit("whole")} className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-[#f3b6d4] bg-[#fffafc] px-6 text-center">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#ffe4f2] text-[#f2168d]"><Split size={18} /></span>
            <span className="mt-3 text-[14px] font-bold text-[#f2168d]">Split the bill</span>
            <span className="mt-1 text-[12px] text-muted">Put items on separate bills</span>
          </button>
        </div>
        <footer className="flex items-end justify-between gap-3 border-t border-[#f3e7ed] px-5 py-3">
          <div><p className="text-[11px] text-muted">Table total</p><p className="text-[18px] font-extrabold leading-none">{money(wholeTotal)}</p></div>
          <p className="max-w-xs text-right text-[11px] text-[#8d939c]">The table clears once every bill is settled.</p>
        </footer>
      </> : <>
        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto px-5 py-3 md:grid-cols-2 xl:grid-cols-3">
          {settledBills.map((bill) => <article key={bill.id} className="rounded-xl border border-[#e7f3ef] bg-[#fbfefd] p-3">
            <div className="flex items-start justify-between gap-2"><div className="flex items-center gap-2"><span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-white ${tone(bill.number).dot}`}>{bill.number}</span><div><p className="text-[13px] font-bold">Bill {bill.number}</p><p className="text-[11px] text-emerald-700">{bill.method === "ROOM_CHECKOUT" ? `On Room ${bill.roomNumber ?? ""}'s tab` : "Paid"}</p></div></div><strong>{money(bill.amount)}</strong></div>
            <div className="mt-2 space-y-1">{groupLines(bill.lines).map((line) => <div key={`${line.name}-${line.detail ?? ""}`} className="flex justify-between gap-2 text-[11px] text-[#5c6370]"><span>{line.quantity > 1 ? `${line.quantity} × ` : ""}{line.name}</span><span>{money(line.amount)}</span></div>)}</div>
          </article>)}
          {openBills.map((bill) => <article key={bill.id} className="rounded-xl border border-[#f0e4ea] p-3">
            <div className="flex items-start justify-between gap-2"><div className="flex items-center gap-2"><span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-white ${tone(bill.number).dot}`}>{bill.number}</span><div><p className="text-[13px] font-bold">Bill {bill.number}</p><p className="text-[11px] text-muted">{bill.lines.length} item{bill.lines.length === 1 ? "" : "s"}</p></div></div><strong>{money(bill.amount)}</strong></div>
            <div className="mt-2 space-y-1 border-b border-[#f3e7ed] pb-3">{groupLines(bill.lines).map((line) => <div key={`${line.name}-${line.detail ?? ""}`} className="flex justify-between gap-2 text-[12px]"><span className="min-w-0">{line.quantity > 1 ? `${line.quantity} × ` : ""}{line.name}</span><span className="shrink-0 text-[#5c6370]">{money(line.amount)}</span></div>)}</div>
            <div className="pt-3">{payCard(bill.id, bill.amount, () => void settleBill(bill), billMode[bill.id] ?? "NOW", (mode) => setBillMode((current) => ({ ...current, [bill.id]: mode })), billMethod[bill.id] ?? "CASH", (method) => setBillMethod((current) => ({ ...current, [bill.id]: method })), billStay[bill.id] ?? "", (id) => setBillStay((current) => ({ ...current, [bill.id]: id })))}</div>
          </article>)}
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-[#f3e7ed] px-5 py-3">
          <div><p className="text-[11px] text-muted">Table total</p><p className="text-[15px] font-extrabold">{money(total)} · {openBills.length + settledBills.length} bill{openBills.length + settledBills.length === 1 ? "" : "s"}</p></div>
          <button type="button" onClick={() => openSplit("bills")} className="h-10 rounded-xl border border-[#eadfe6] px-4 text-[13px] font-bold">Change split</button>
        </footer>
      </>}
      {error && <p role="alert" className="mx-5 mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
    </section>
    {signFor && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSignFor(null); }}>
      <section role="dialog" aria-modal="true" aria-label="Sign for the room tab" className="w-full max-w-lg rounded-2xl border border-line bg-white p-5 shadow-float">
        <header className="flex items-start justify-between gap-3"><div><h2 className="font-display text-lg font-bold">Sign for Room {stays.find((stay) => stay.id === signFor.stayId)?.room.roomNumber}</h2><p className="mt-1 text-[11px] text-muted">{signName || "The guest"}, please sign to add {money(signFor.amount)} to the room’s tab.</p></div><button type="button" onClick={() => setSignFor(null)} aria-label="Close signature" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas"><X size={16} /></button></header>
        <label className="mt-4 block text-[10px] font-semibold text-muted">Guest signing<input value={signName} onChange={(event) => setSignName(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-line px-3 text-xs text-ink outline-none focus:border-[#ed168c]" /></label>
        <canvas ref={canvasRef} width={900} height={220} onPointerDown={(event) => { const canvas = canvasRef.current; const at = point(event); if (!canvas || !at) return; canvas.setPointerCapture(event.pointerId); const ctx = canvas.getContext("2d"); if (!ctx) return; ctx.beginPath(); ctx.moveTo(at.x, at.y); ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.strokeStyle = "#30242b"; setDrawing(true); }} onPointerMove={(event) => { if (!drawing) return; const canvas = canvasRef.current; const at = point(event); const ctx = canvas?.getContext("2d"); if (!canvas || !at || !ctx) return; ctx.lineTo(at.x, at.y); ctx.stroke(); setSignData(canvas.toDataURL("image/png")); }} onPointerUp={() => setDrawing(false)} onPointerCancel={() => setDrawing(false)} className="mt-3 h-40 w-full touch-none rounded-lg border border-line bg-[#fffafb]" aria-label="Sign here" />
        <div className="mt-4 flex gap-2"><button type="button" onClick={() => { const canvas = canvasRef.current; canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height); setSignData(""); }} className="h-10 flex-1 rounded-lg border border-line text-xs font-bold">Clear</button><button type="button" disabled={busy || !signName.trim() || !signData} onClick={() => { const signature = { name: signName.trim(), data: signData }; if (signFor.billId) { const bill = openBills.find((entry) => entry.id === signFor.billId); if (bill) void settleBill(bill, signature); } else void settleWhole(signature); }} className="h-10 flex-1 rounded-lg bg-[#ed168c] text-xs font-bold text-white disabled:opacity-40">{busy ? "Saving…" : "Confirm and add to tab"}</button></div>
      </section>
    </div>}
  </div>;
}
