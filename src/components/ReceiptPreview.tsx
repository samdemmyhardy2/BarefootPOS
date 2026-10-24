import { useEffect, useRef, useState } from "react";
import { Printer, X } from "lucide-react";
import { money, type Order, type OrderPaymentMethod, type RoomCharge } from "../lib/types";

export type CheckoutReceipt = {
  tableNumber?: string;
  locationLabel?: string;
  orders: Order[];
  folioCharges?: RoomCharge[];
  paymentMethod: OrderPaymentMethod;
  receiptKind?: "DINING" | "STAY_CHECKOUT";
  room: { roomNumber: number; guestName: string; guestNames?: string[] } | null;
  rooms?: { roomNumber: number; guestName: string; guestNames?: string[] }[];
  totalAmount: number;
  checkedOutAt: string;
  cashierName: string;
};

export function ReceiptPreview({ receipt, restaurantName, restaurantLogoUrl, onClose }: {
  receipt: CheckoutReceipt;
  restaurantName: string;
  restaurantLogoUrl: string | null;
  onClose: () => void;
}) {
  const [signatureCopy, setSignatureCopy] = useState(receipt.paymentMethod === "ROOM_CHECKOUT");
  const diningThanks = [
    "Thank you for dining with us.",
    "We hope to welcome you back soon.",
    "Thank you for sharing a meal with us.",
    "We appreciate your visit.",
    "Enjoy the rest of your day.",
  ];
  const stayThanks = [
    "Thank you for staying with us.",
    "We hope you enjoyed your stay.",
    "Thank you for choosing to stay with us.",
    "We look forward to welcoming you again.",
    "Wishing you a pleasant journey.",
  ];
  const getThanks = (kind: CheckoutReceipt["receiptKind"]) => {
    const phrases = kind === "STAY_CHECKOUT" ? stayThanks : diningThanks;
    return phrases[Math.floor(Math.random() * phrases.length)];
  };
  const [thankYouPhrase, setThankYouPhrase] = useState(() => getThanks(receipt.receiptKind));
  const paperRef = useRef<HTMLDivElement>(null);
  const isFolio = receipt.paymentMethod === "ROOM_CHECKOUT";
  const showSignature = isFolio && signatureCopy;
  const receiptRooms = receipt.rooms?.length ? receipt.rooms : receipt.room ? [receipt.room] : [];
  useEffect(() => {
    const clearPrintMode = () => {
      document.body.classList.remove("printing-receipt");
      paperRef.current?.style.removeProperty("zoom");
    };
    window.addEventListener("afterprint", clearPrintMode);
    return () => {
      window.removeEventListener("afterprint", clearPrintMode);
      clearPrintMode();
    };
  }, []);
  useEffect(() => {
    setSignatureCopy(receipt.paymentMethod === "ROOM_CHECKOUT");
    setThankYouPhrase(getThanks(receipt.receiptKind));
  }, [receipt]);
  const printReceipt = () => {
    const paper = paperRef.current;
    if (paper) {
      const availableHeight = Math.max(320, window.innerHeight - 48);
      // Printed receipt is narrower than the preview, so leave room for extra wrapping.
      const fitScale = Math.min(1, availableHeight / (paper.getBoundingClientRect().height * 1.15));
      paper.style.zoom = String(fitScale);
    }
    document.body.classList.add("printing-receipt");
    window.print();
  };

  return <div className="receipt-print-root fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/55 p-0 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label="Checkout receipt">
    <div className="receipt-dialog-shell my-0 min-h-[100dvh] w-full max-w-3xl bg-[#fff7fb] px-4 py-4 text-slate-900 shadow-2xl sm:my-5 sm:min-h-0 sm:rounded-2xl sm:px-8 sm:py-6">
      <div className="receipt-ui-surface no-print sticky top-0 z-10 mb-5 flex items-center justify-between border-b border-pink-200 bg-[#fff7fb] pb-3"><div><h2 className="text-base font-bold">Receipt ready</h2><p className="mt-1 text-xs text-slate-500">Print it or choose “Save as PDF” in the print dialog.</p></div><button onClick={onClose} aria-label="Close receipt" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-pink-100"><X size={18} /></button></div>
      <div ref={paperRef} className="receipt-paper relative isolate mx-auto max-w-[480px] overflow-hidden rounded-2xl border border-pink-200 bg-[#fffafd] px-6 py-7 font-sans text-[12px] leading-5 text-slate-800 shadow-[0_12px_36px_rgba(143,49,94,.08)] print:shadow-none">
        {restaurantLogoUrl && <img src={restaurantLogoUrl} alt="" aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-60 w-60 -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.055]" />}
        <div className="relative z-10">
        <header className="relative mb-6 text-center">
          {restaurantLogoUrl && <img src={restaurantLogoUrl} alt="" className="receipt-logo mx-auto mb-3 h-14 max-w-36 rounded-xl border border-pink-100 bg-white p-1.5 object-contain shadow-sm" />}
          <p className="text-[9px] font-bold uppercase tracking-[.22em] text-[#d80c7c]">{showSignature ? "Room charge authorization" : isFolio ? "Restaurant receipt · Guest copy" : "Restaurant receipt"}</p>
          <h1 className="mt-1 font-display text-xl font-extrabold tracking-tight text-slate-900">{restaurantName}</h1>
          <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-pink-100 px-3 py-1 text-[11px] font-bold text-[#b90b6b]"><span className="h-1.5 w-1.5 rounded-full bg-[#f71591]" />{receipt.locationLabel ?? receipt.tableNumber}</div>
          <p className="mt-2 text-[10px] text-slate-500">{new Date(receipt.checkedOutAt).toLocaleString()}</p>
        </header>
        <div className="relative border-y border-dashed border-pink-300 py-3">
          {receipt.folioCharges ? receipt.folioCharges.map((charge) => {
            const order = charge.orderId ? receipt.orders.find((candidate) => candidate.id === charge.orderId) : undefined;
            return <div key={charge.id} className="receipt-item mb-3 last:mb-0">
              <div className="flex justify-between gap-3 py-1"><span className="font-semibold">{order ? `Restaurant order #${order.id.slice(0, 8)}` : charge.description}</span><span className="shrink-0 font-semibold tabular-nums">{money(charge.amount)}</span></div>
              {order ? <>
                <p className="ml-3 text-[10px] text-slate-500">{order.table?.tableNumber ?? "—"} · Served by {order.servedBy?.name ?? "—"}</p>
                {order.items.map((line, index) => <div key={line.id ?? `${order.id}-${index}`} className="ml-3 flex justify-between gap-3 py-0.5 text-[10px]"><span>{line.quantity}× {line.menuItem.name}{line.addExtras ? ` · ${line.addExtras}` : ""}{line.removeIngredients ? ` · No ${line.removeIngredients}` : ""}</span><span className="shrink-0 tabular-nums">{money(line.subtotal ?? Number(line.unitPrice ?? line.menuItem.price) * line.quantity)}</span></div>)}
              </> : <p className="ml-3 text-[10px] text-slate-500">{charge.quantity} × {money(charge.unitPrice)}</p>}
            </div>;
          }) : receipt.orders.map((order) => <div key={order.id} className="receipt-item mb-3 last:mb-0">
            <div className="mb-2 flex justify-between gap-2 text-[10px] font-bold text-slate-500"><span className="font-mono uppercase tracking-wide">Order #{order.id.slice(0, 8)}</span><span>{order.waiter?.name ?? ""}</span></div>
            {order.items.map((line, index) => <div key={line.id ?? `${order.id}-${index}`} className="mb-1">
              <div className="flex justify-between gap-3 py-1"><span className="font-semibold"><span className="mr-1 text-[#d80c7c]">{line.quantity}×</span>{line.menuItem.name}</span><span className="shrink-0 font-semibold tabular-nums">{money(line.subtotal ?? Number(line.unitPrice ?? line.menuItem.price) * line.quantity)}</span></div>
              {(line.removeIngredients || line.addExtras || line.selectedAllergens?.length || line.specialNotes) && <p className="ml-5 rounded-lg bg-pink-50 px-2 py-1 text-[10px] leading-4 text-slate-600">{[line.removeIngredients && `No: ${line.removeIngredients}`, line.addExtras && `Extra: ${line.addExtras}`, line.selectedAllergens?.length && `Allergy: ${line.selectedAllergens.join(", ")}`, line.specialNotes].filter(Boolean).join(" · ")}</p>}
            </div>)}
            <div className="mt-2 flex justify-between border-t border-pink-100 pt-2 text-[10px] font-semibold text-slate-500"><span>Ticket subtotal</span><span className="tabular-nums">{money(order.totalAmount)}</span></div>
          </div>)}
        </div>
        <div className="relative space-y-2 border-b border-dashed border-pink-300 py-4">
          <div className="flex justify-between gap-2 rounded-xl bg-pink-100/80 px-3 py-2.5 font-display text-sm font-extrabold text-slate-900"><span>Total</span><span className="tabular-nums">{money(receipt.totalAmount)}</span></div>
          <div className="flex justify-between gap-2 px-1 pt-1"><span className="text-slate-500">Payment</span><span className="font-bold text-[#b90b6b]">{receipt.paymentMethod === "CASH" ? "Cash · Paid" : receipt.paymentMethod === "CARD" ? "Card · Paid" : "Room folio"}</span></div>
          {receiptRooms.map((room) => <div key={room.roomNumber} className="space-y-1"><div className="flex justify-between gap-2 px-1"><span className="text-slate-500">Room</span><span className="font-semibold">{room.roomNumber}</span></div><div className="flex justify-between gap-2 px-1"><span className="shrink-0 text-slate-500">Guests</span><span className="text-right font-semibold">{(room.guestNames?.length ? room.guestNames : [room.guestName]).join(", ")}</span></div></div>)}
          <div className="flex justify-between gap-2 px-1"><span className="text-slate-500">Served by</span><span className="text-right font-semibold">{[...new Set(receipt.orders.map((order) => order.servedBy?.name).filter(Boolean))].join(", ") || "—"}</span></div>
          <div className="flex justify-between gap-2 px-1"><span className="text-slate-500">Processed by</span><span className="text-right font-semibold">{receipt.cashierName}</span></div>
        </div>
        {showSignature && <div className="relative mt-7 rounded-xl border border-pink-200 bg-white/80 px-4 pb-3 pt-2 text-center"><p className="font-bold text-[#b90b6b]">Guest signature</p><div className="mt-9 border-t border-slate-400" /><p className="mt-2 text-[10px] leading-4 text-slate-500">I authorize these restaurant charges to be added to my room folio.</p></div>}
        <p className="relative mt-6 text-center text-[10px] font-semibold tracking-wide text-[#b90b6b]">{thankYouPhrase}</p>
        </div>
      </div>
      <div className="receipt-ui-surface no-print mt-5 flex flex-col gap-3 border-t border-pink-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        {isFolio ? <div className="receipt-mode-group flex rounded-xl border border-pink-200 bg-white p-1" aria-label="Receipt type">
          <button type="button" aria-pressed={!signatureCopy} onClick={() => setSignatureCopy(false)} className={`receipt-mode-button rounded-lg px-3 py-2 text-[10px] font-bold ${!signatureCopy ? "is-active bg-pink-100 text-[#b90b6b]" : "text-slate-600 hover:bg-pink-50"}`}>Guest receipt · no signature</button>
          <button type="button" aria-pressed={signatureCopy} onClick={() => setSignatureCopy(true)} className={`receipt-mode-button rounded-lg px-3 py-2 text-[10px] font-bold ${signatureCopy ? "is-active bg-pink-100 text-[#b90b6b]" : "text-slate-600 hover:bg-pink-50"}`}>Folio slip · signature</button>
        </div> : <p className="text-[10px] font-semibold text-slate-500">Cash receipt · no signature</p>}
        <div className="flex justify-end gap-2"><button onClick={onClose} className="receipt-action-secondary h-10 rounded-xl border border-pink-200 bg-white px-4 text-xs font-bold text-slate-700">Close</button><button onClick={printReceipt} className="receipt-action-primary inline-flex h-10 items-center gap-2 rounded-xl bg-[#f71591] px-4 text-xs font-bold text-white hover:bg-[#d90d7b]"><Printer size={15} /> Print / Save PDF</button></div>
      </div>
    </div>
  </div>;
}
