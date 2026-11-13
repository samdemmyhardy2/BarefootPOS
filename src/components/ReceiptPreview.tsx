import { useEffect, useRef, useState } from "react";
import { Eye, Mail, Printer, X } from "lucide-react";
import { money, orderCode, type Order, type OrderPaymentMethod, type RoomCharge } from "../lib/types";
import { mediaSrc } from "../lib/media";
import { api, errorMessage } from "../lib/api";
import { useUiStore } from "../stores/uiStore";
import { localUuid } from "../lib/outbox";
import { dishVat, moneyRound, roundUpBaht, vatAmount, vatRateText } from "../lib/vat";

function isAppleTouch() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function openPdf(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

type SlipRow = { left: string; right?: string; note?: string };
type SlipPayload = {
  title: string;
  restaurantName: string;
  location?: string;
  printedAt: string;
  lines: SlipRow[];
  vat?: SlipRow;
  total: string;
  rows: SlipRow[];
  signatureLabel?: string;
  signatureName?: string;
  signatureNote?: string;
  signatureImage?: string;
  logoImage?: string;
  footer: string;
  orderId?: string;
};

function countOf(value: unknown) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.round(count) : 1;
}

function groupedChargeLines(lines: { name?: string | null; quantity?: number | null; amount?: number | string | null; detail?: string | null }[]) {
  const groups = new Map<string, { name: string; quantity: number; amount: number; detail: string | null }>();
  for (const line of lines) {
    const name = line.name?.trim() || "Item";
    const detail = line.detail?.trim() || null;
    const group = groups.get(`${name}\0${detail ?? ""}`) ?? { name, quantity: 0, amount: 0, detail };
    group.quantity += countOf(line.quantity);
    const amount = Number(line.amount);
    group.amount = Math.round((group.amount + (Number.isFinite(amount) ? amount : 0)) * 100) / 100;
    groups.set(`${name}\0${detail ?? ""}`, group);
  }
  return [...groups.values()];
}

type GuestSign = { name: string; data: string };

function guestSign(name?: string | null, data?: string | null): GuestSign | null {
  const image = data?.trim();
  if (!image) return null;
  return { name: name?.trim() || "Guest", data: image };
}

function rememberSign(signs: GuestSign[], sign: GuestSign | null) {
  if (sign && !signs.some((existing) => existing.data === sign.data)) signs.push(sign);
}

function plainTable(value: string) {
  return value.replace(/^table\s+/i, "").trim();
}

function dayStamp(value?: string | null) {
  if (!value) return "";
  const when = new Date(value);
  return Number.isNaN(when.getTime()) ? "" : `${when.getFullYear()}-${when.getMonth()}-${when.getDate()}`;
}

function dayText(value?: string | null) {
  if (!value) return "";
  const when = new Date(value);
  return Number.isNaN(when.getTime()) ? "" : new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(when);
}

function chargeSign(charge: RoomCharge, order?: Order) {
  const own = guestSign(charge.signedByName, charge.signatureData);
  if (own) return own;
  if (order && charge.orderId === order.id) return guestSign(order.roomCharge?.signedByName, order.roomCharge?.signatureData);
  return null;
}

function orderSigns(order: Order) {
  const signs: GuestSign[] = [];
  rememberSign(signs, guestSign(order.roomCharge?.signedByName, order.roomCharge?.signatureData));
  for (const split of order.splits ?? []) rememberSign(signs, guestSign(split.signedByName, split.signatureData));
  return signs;
}

function uniqueRooms<T extends { roomNumber: string | number; guestName: string; guestNames?: string[] }>(rooms: T[]) {
  const seen = new Set<string>();
  return rooms.filter((room) => {
    const names = (room.guestNames?.length ? room.guestNames : [room.guestName]).filter(Boolean).join("\0");
    const key = `${room.roomNumber}\0${names}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function SignMark({ sign }: { sign: GuestSign }) {
  return <div className="mt-3"><img src={sign.data} alt={`Signature by ${sign.name}`} className="mx-auto h-14 max-w-[220px] object-contain" /><div className="mx-auto mt-1 h-px w-48 bg-slate-800" /><p className="mt-1 text-center text-[10px] font-semibold text-slate-700">{sign.name}</p></div>;
}

function clip(value: string, max: number) {
  const indent = value.startsWith("  ") ? "  " : "";
  const text = value.trim().replace(/\s+/g, " ");
  const clipped = text.length > max ? `${text.slice(0, max - 1)}…` : text;
  return `${indent}${clipped}`.slice(0, max);
}

async function localImageUrl(src: string) {
  if (src.startsWith("data:") || src.startsWith("blob:")) return { url: src, revoke: () => undefined };
  const response = await fetch(src, { mode: "cors", credentials: "omit", cache: "reload" });
  if (!response.ok) throw new Error("Could not read the image.");
  const url = URL.createObjectURL(await response.blob());
  return { url, revoke: () => URL.revokeObjectURL(url) };
}

function pngFromImage(src: string, maxWidth: number) {
  return localImageUrl(src).then(({ url, revoke }) => new Promise<string>((resolve, reject) => {
    const image = new Image();
    const fail = (error?: unknown) => {
      revoke();
      reject(error instanceof Error ? error : new Error("Could not read the image."));
    };
    image.onload = () => {
      try {
        const scale = Math.min(1, maxWidth / Math.max(image.width, 1));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          fail();
          return;
        }
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const png = canvas.toDataURL("image/png");
        revoke();
        resolve(png);
      } catch (error) {
        fail(error);
      }
    };
    image.onerror = () => fail();
    image.src = url;
  }));
}

export type CheckoutReceipt = {
  tableNumber?: string;
  locationLabel?: string;
  orders: Order[];
  folioCharges?: RoomCharge[];
  paymentMethod: OrderPaymentMethod;
  receiptKind?: "DINING" | "STAY_CHECKOUT";
  room: { roomNumber: string | number; guestName: string; guestNames?: string[] } | null;
  rooms?: { roomNumber: string | number; guestName: string; guestNames?: string[] }[];
  totalAmount: number;
  checkedOutAt: string;
  cashierName: string;
  signature?: { name: string; data: string };
};

export function priceFolioCharge(charge: RoomCharge, order: Order | undefined, settingsRate: number) {
  const activeLines = charge.lines?.filter((line) => !line.removedAt);
  const lined = charge.lines?.length ? moneyRound((activeLines ?? []).reduce((sum, line) => sum + Number(line.amount), 0)) : null;
  const itemDishes = order ? order.items.filter((line) => !line.removedAt).map((line) => Number(line.subtotal ?? Number(line.unitPrice ?? line.menuItem?.price ?? 0) * countOf(line.quantity))) : [];
  const itemFood = order ? moneyRound(itemDishes.reduce((sum, amount) => sum + amount, 0)) : null;
  const lineDishes = (() => {
    const groups = new Map<string, number>();
    (activeLines ?? []).forEach((line, index) => groups.set(line.orderItemId || `line-${index}`, moneyRound((groups.get(line.orderItemId || `line-${index}`) ?? 0) + Number(line.amount))));
    return [...groups.values()];
  })();
  const stored = moneyRound(Number(charge.amount));
  const restaurant = charge.kind === "RESTAURANT_ORDER" || lined !== null || Boolean(order);
  const percent = Number(order?.vatPercent || 0) > 0 ? Number(order?.vatPercent) : settingsRate;
  let food = stored;
  if (lined !== null) food = lined;
  else if (itemFood !== null) {
    const withRate = moneyRound(itemFood + vatAmount(itemFood, percent));
    const withDishes = moneyRound(itemFood + dishVat(itemDishes, percent));
    if (Math.abs(stored - itemFood) < 0.02 || Math.abs(stored - withRate) < 0.02 || Math.abs(stored - withDishes) < 0.02) food = itemFood;
  }
  if (!restaurant) return { food: stored, vat: 0, percent: 0, total: stored };
  const gap = moneyRound(stored - food);
  if (gap > 0.009) return { food, vat: gap, percent: percent || settingsRate, total: stored };
  const dishes = lineDishes.length ? lineDishes : itemDishes.length ? itemDishes : [food];
  const vat = dishVat(dishes, percent);
  return { food, vat, percent, total: moneyRound(food + vat) };
}

export function ReceiptPreview({ receipt, restaurantName, restaurantLogoUrl, onClose }: {
  receipt: CheckoutReceipt;
  restaurantName: string;
  restaurantLogoUrl: string | null;
  onClose: () => void;
}) {
  const [signatureCopy, setSignatureCopy] = useState(receipt.paymentMethod === "ROOM_CHECKOUT");
  const [preparing, setPreparing] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);
  const appleTouch = isAppleTouch();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [mailNote, setMailNote] = useState("");
  const [printerNote, setPrinterNote] = useState("");
  const [printerPreview, setPrinterPreview] = useState("");
  const [sendingPrinter, setSendingPrinter] = useState(false);
  const [preparingPreview, setPreparingPreview] = useState(false);
  const printRequestId = useRef("");
  const slipPayload = useRef<SlipPayload | null>(null);
  const pdfBytes = useRef<ArrayBuffer | null>(null);
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
  const storedRate = useUiStore((state) => state.vatPercent);
  const [settingsRate, setSettingsRate] = useState(storedRate);
  useEffect(() => {
    let cancelled = false;
    api.get<{ vatPercent?: number }>("/restaurant-settings").then(({ data }) => {
      if (!cancelled) setSettingsRate(Number(data.vatPercent) || 0);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const isFolio = receipt.paymentMethod === "ROOM_CHECKOUT";
  const folioCharges = receipt.folioCharges?.filter((charge) => charge.kind !== "ROOM_FEE");
  const folioPriced = folioCharges?.map((charge) => {
    const order = charge.orderId ? receipt.orders.find((candidate) => candidate.id === charge.orderId) : undefined;
    return { charge, order, ...priceFolioCharge(charge, order, settingsRate) };
  });
  const folioFood = moneyRound((folioPriced ?? []).reduce((sum, row) => sum + row.food, 0));
  const folioVat = moneyRound((folioPriced ?? []).reduce((sum, row) => sum + row.vat, 0));
  const folioPercent = folioPriced?.length && folioPriced.every((row) => row.percent === folioPriced[0].percent) ? folioPriced[0].percent : 0;
  const diningFood = moneyRound(receipt.orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0));
  const diningVat = moneyRound(receipt.orders.reduce((sum, order) => {
    const percent = Number(order.vatPercent || 0) || settingsRate;
    const dishes = order.items.filter((line) => !line.removedAt).map((line) => Number(line.subtotal ?? Number(line.unitPrice ?? line.menuItem?.price ?? 0) * countOf(line.quantity)));
    return sum + dishVat(dishes.length ? dishes : [Number(order.totalAmount || 0)], percent);
  }, 0));
  const diningPercent = receipt.orders.length && receipt.orders.every((order) => Number(order.vatPercent || 0) === Number(receipt.orders[0]?.vatPercent || 0)) ? Number(receipt.orders[0]?.vatPercent || 0) || settingsRate : settingsRate;
  const receiptVat = folioPriced ? folioVat : diningVat;
  const receiptExact = folioPriced ? moneyRound(folioFood + folioVat) : moneyRound(diningFood + diningVat);
  const receiptTotal = receiptVat > 0 ? roundUpBaht(receiptExact) : receiptExact;
  const folioGroups = (() => {
    if (!folioPriced) return null;
    const groups: { key: string; title: string | null; rows: typeof folioPriced }[] = [];
    const index = new Map<string, number>();
    for (const row of folioPriced) {
      const raw = row.order?.table?.tableNumber ? String(row.order.table.tableNumber) : row.charge.description.match(/^Table\s+(.+?)(?:\s+restaurant\b|\s+·|\s*:|$)/i)?.[1] ?? "";
      const table = plainTable(raw);
      const when = row.charge.occurredAt || row.order?.createdAt || "";
      const day = dayStamp(when);
      const bill = row.charge.billNumber;
      const roomServiceOrder = row.order?.type === "ROOM_SERVICE" || (!table && /^room service\b/i.test(row.charge.description));
      const key = bill ? `bill:${row.charge.id}` : table ? `table:${table}:${day}` : roomServiceOrder ? `room-service:${day}` : `charge:${row.charge.id}`;
      let at = index.get(key);
      if (at == null) {
        at = groups.length;
        index.set(key, at);
        const title = bill ? `Bill ${bill}` : roomServiceOrder ? ["Room service", day ? dayText(when) : ""].filter(Boolean).join(" · ") : [table ? `Table ${table}` : "", day ? dayText(when) : ""].filter(Boolean).join(" · ") || null;
        groups.push({ key, title, rows: [] });
      }
      groups[at].rows.push(row);
    }
    return groups;
  })();
  const diningSigns = (() => {
    const signs: GuestSign[] = [];
    for (const order of receipt.orders) for (const sign of orderSigns(order)) rememberSign(signs, sign);
    rememberSign(signs, guestSign(receipt.signature?.name, receipt.signature?.data));
    return signs;
  })();
  const shownSigns = folioGroups ? folioGroups.flatMap((group) => group.rows.map((row) => chargeSign(row.charge, row.order)).filter((sign): sign is GuestSign => Boolean(sign))) : diningSigns;
  const signatureImage = shownSigns[0]?.data;
  const showSignature = isFolio && signatureCopy && Boolean(signatureImage);
  const receiptRooms = uniqueRooms(receipt.rooms?.length ? receipt.rooms : receipt.room ? [receipt.room] : []);
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
    setMailNote("");
    setPrinterNote("");
    setPrinterPreview("");
    printRequestId.current = "";
    slipPayload.current = null;
  }, [receipt]);
  useEffect(() => {
    setPrinterPreview("");
    slipPayload.current = null;
  }, [signatureCopy]);
  const printReceipt = () => {
    if (appleTouch && pdfFile) {
      const title = `${restaurantName} receipt`;
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [pdfFile] }))) {
        void navigator.share({ files: [pdfFile], title }).catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          openPdf(pdfFile);
        });
        return;
      }
      openPdf(pdfFile);
      return;
    }
    const paper = paperRef.current;
    paper?.style.removeProperty("zoom");
    document.body.classList.add("printing-receipt");
    window.print();
  };
  const buildPdf = async () => {
    const paper = paperRef.current;
    if (!paper) throw new Error("Unable to generate receipt PDF.");
    paper.style.removeProperty("zoom");
    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = "position:fixed;left:0;top:0;width:480px;z-index:-1;pointer-events:none;background:#fffafd;";
    const clone = paper.cloneNode(true) as HTMLElement;
    clone.style.zoom = "1";
    clone.style.width = "480px";
    clone.style.maxWidth = "480px";
    clone.style.overflow = "hidden";
    clone.style.transform = "none";
    host.appendChild(clone);
    document.body.appendChild(host);
    const releases: Array<() => void> = [];
    try {
      await Promise.all([...clone.querySelectorAll("img")].map(async (img) => {
        const src = img.getAttribute("src");
        if (!src) return;
        try {
          const local = await localImageUrl(src);
          releases.push(local.revoke);
          img.removeAttribute("crossorigin");
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = local.url;
          });
        } catch {
          img.removeAttribute("src");
        }
      }));
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const measured = Math.max(clone.scrollHeight, clone.getBoundingClientRect().height, 1);
      const scale = Math.min(2, 8000 / measured);
      const canvas = await html2canvas(clone, { scale: Math.max(1, scale), backgroundColor: "#fffafd", useCORS: true, logging: false, scrollX: 0, scrollY: 0, width: 480, height: measured, windowWidth: 480, windowHeight: measured });
      if (!canvas.width || !canvas.height) throw new Error("Unable to generate receipt PDF.");
      const pageWidth = 420;
      const maxPageHeight = 1000;
      const slicePixels = Math.max(1, Math.floor(canvas.width * (maxPageHeight / pageWidth)));
      let offset = 0;
      let pdf: InstanceType<typeof jsPDF> | null = null;
      while (offset < canvas.height) {
        const sliceHeight = Math.min(slicePixels, canvas.height - offset);
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = sliceHeight;
        const context = slice.getContext("2d");
        if (!context) throw new Error("Unable to generate receipt PDF.");
        context.fillStyle = "#fffafd";
        context.fillRect(0, 0, slice.width, slice.height);
        context.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
        const pageHeight = Math.max(120, (sliceHeight / canvas.width) * pageWidth);
        if (!pdf) pdf = new jsPDF({ unit: "pt", format: [pageWidth, pageHeight], compress: true });
        else pdf.addPage([pageWidth, pageHeight]);
        pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageWidth, pageHeight);
        offset += sliceHeight;
      }
      if (!pdf) throw new Error("Unable to generate receipt PDF.");
      const buffer = pdf.output("arraybuffer");
      pdfBytes.current = buffer;
      return new File([buffer], "receipt.pdf", { type: "application/pdf" });
    } finally {
      host.remove();
      releases.forEach((release) => release());
    }
  };
  useEffect(() => {
    let cancelled = false;
    setPdfFile(null);
    pdfBytes.current = null;
    setPdfFailed(false);
    setPreparing(true);
    const timer = window.setTimeout(() => {
      void buildPdf().then((file) => {
        if (!cancelled) setPdfFile(file);
      }).catch(() => {
        if (!cancelled) {
          setPdfFailed(true);
          setMailNote("Unable to generate receipt PDF.");
        }
      }).finally(() => {
        if (!cancelled) setPreparing(false);
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [receipt, signatureCopy, restaurantLogoUrl]);
  const receiptFile = () => {
    const bytes = pdfBytes.current;
    return bytes ? new File([bytes], "receipt.pdf", { type: "application/pdf" }) : null;
  };
  const sendMail = () => {
    const file = receiptFile();
    if (!file || typeof navigator.share !== "function") {
      setMailNote(file ? "This device cannot attach receipt.pdf." : "Receipt PDF is not ready yet.");
      return;
    }
    void navigator.share({ files: [file] }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMailNote("Could not attach receipt.pdf.");
    });
  };
  const buildSlip = async (): Promise<SlipPayload> => {
    let logoImage: string | undefined;
    if (restaurantLogoUrl) {
      try { logoImage = await pngFromImage(mediaSrc(restaurantLogoUrl), 360); } catch { logoImage = undefined; }
    }
    let signaturePng: string | undefined;
    if (showSignature && signatureImage) {
      try { signaturePng = await pngFromImage(signatureImage, 520); } catch { signaturePng = undefined; }
    }
    const lines: SlipRow[] = [];
    if (folioGroups) {
      for (const group of folioGroups) {
        const food = moneyRound(group.rows.reduce((sum, row) => sum + row.food, 0));
        const only = group.rows.length === 1 ? group.rows[0] : null;
        const heading = group.title || (only?.charge.billNumber ? `Bill ${only.charge.billNumber} · ${only.charge.description}` : only?.charge.description || "Restaurant order");
        lines.push({ left: clip(heading, 160), right: clip(money(food), 40) });
        if (only && !only.order && !only.charge.lines?.length) {
          lines.push({ left: clip(`  ${only.charge.quantity} × ${money(only.charge.unitPrice)}`, 160) });
          continue;
        }
        for (const { charge, order } of group.rows) {
          if (charge.lines?.length) {
            for (const line of groupedChargeLines((charge.lines ?? []).filter((line) => !line.removedAt))) lines.push({ left: clip(`  ${line.quantity}× ${line.name}`, 160), right: clip(money(line.amount), 40), note: line.detail ? clip(line.detail, 240) : undefined });
          } else if (order) {
            for (const line of order.items.filter((line) => !line.removedAt)) {
              const extras = [line.addExtras, line.removeIngredients ? `No ${line.removeIngredients}` : ""].filter(Boolean).join(" · ");
              const mods = line.modifierSelections?.map((selection) => `${selection.groupName}: ${selection.options.map((option) => option.name).join(", ")}`).join(" · ");
              lines.push({ left: clip(`  ${countOf(line.quantity)}× ${line.menuItem?.name || "Item"}${extras ? ` · ${extras}` : ""}`, 160), right: clip(money(line.subtotal ?? Number(line.unitPrice ?? line.menuItem.price) * countOf(line.quantity)), 40), note: mods ? clip(mods, 240) : undefined });
            }
          }
        }
      }
    } else {
      for (const order of receipt.orders) {
        lines.push({ left: clip(`Order #${orderCode(order)}`, 160), right: order.waiter?.name ? clip(order.waiter.name, 40) : undefined });
        for (const line of order.items.filter((line) => !line.removedAt)) {
          const extras = [line.addExtras, line.removeIngredients ? `No ${line.removeIngredients}` : ""].filter(Boolean).join(" · ");
          const mods = line.modifierSelections?.map((selection) => `${selection.groupName}: ${selection.options.map((option) => option.name).join(", ")}`).join(" · ");
          const kitchen = [line.removeIngredients && `No: ${line.removeIngredients}`, line.addExtras && `Extra: ${line.addExtras}`, line.selectedAllergens?.length && `Allergy: ${line.selectedAllergens.join(", ")}`, line.specialNotes].filter(Boolean).join(" · ");
          lines.push({ left: clip(`  ${countOf(line.quantity)}× ${line.menuItem?.name || "Item"}${extras ? ` · ${extras}` : ""}`, 160), right: clip(money(line.subtotal ?? Number(line.unitPrice ?? line.menuItem.price) * countOf(line.quantity)), 40), note: mods || kitchen ? clip([mods, kitchen].filter(Boolean).join(" · "), 240) : undefined });
        }
      }
    }
    const vatMoney = folioPriced ? folioVat : diningVat;
    const vatRate = vatRateText(folioPriced ? folioPercent : diningPercent);
    const vat = vatMoney > 0 ? { left: "VAT", right: vatRate || undefined } : undefined;
    const payment = receipt.paymentMethod === "CASH" ? "Cash · Paid" : receipt.paymentMethod === "CARD" ? "Card · Paid" : receipt.paymentMethod === "PROMPTPAY" ? "PromptPay QR · Paid" : "Room folio";
    const rows: SlipRow[] = [{ left: "Payment", right: payment }];
    for (const room of receiptRooms) {
      rows.push({ left: "Room number", right: clip(String(room.roomNumber), 40) });
      rows.push({ left: "Guest name", right: clip((room.guestNames?.length ? room.guestNames : [room.guestName]).filter(Boolean).join(" and ") || "—", 80) });
    }
    const signedBy = shownSigns[0]?.name ?? "Guest";
    const orderId = receipt.orders.find((order) => order.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(order.id))?.id;
    return {
      title: showSignature ? "Room charge authorization" : "Restaurant receipt",
      restaurantName: clip(restaurantName, 80),
      location: clip(receipt.locationLabel ?? receipt.tableNumber ?? "", 120) || undefined,
      printedAt: clip(new Date(receipt.checkedOutAt).toLocaleString(), 80),
      lines: lines.slice(0, 200),
      vat,
      total: clip(money(receiptTotal), 40),
      rows,
      signatureLabel: signaturePng ? "Guest signature" : undefined,
      signatureName: signaturePng ? clip(signedBy, 80) : undefined,
      signatureNote: signaturePng ? "I authorize these restaurant charges to be added to my room folio." : undefined,
      signatureImage: signaturePng,
      logoImage,
      footer: clip(thankYouPhrase, 160),
      orderId,
    };
  };
  const showPrinterPreview = async () => {
    setPreparingPreview(true);
    setPrinterNote("");
    try {
      const payload = await buildSlip();
      slipPayload.current = payload;
      const { data } = await api.post<{ html: string }>("/printing/slips/preview", payload, { timeout: 30000 });
      setPrinterPreview(data.html);
    } catch (cause) {
      setPrinterNote(errorMessage(cause));
    } finally {
      setPreparingPreview(false);
    }
  };
  const printToPrinter = async (reprint = false) => {
    setSendingPrinter(true);
    setPrinterNote("");
    try {
      if (reprint || !printRequestId.current) printRequestId.current = localUuid();
      const payload = slipPayload.current ?? await buildSlip();
      slipPayload.current = payload;
      const { data } = await api.post<{ status: string; error?: string | null; note?: string }>("/printing/slips", { ...payload, clientRequestId: printRequestId.current }, { timeout: 30000 });
      if (data.status === "FAILED") throw new Error(data.error || "The printer did not accept the receipt.");
      setPrinterNote(data.note || "Sent one receipt. The words are printed as text.");
    } catch (cause) {
      setPrinterNote(errorMessage(cause));
    } finally {
      setSendingPrinter(false);
    }
  };

  return <div className="receipt-print-root fixed inset-0 z-[100] h-[100dvh] max-h-[100dvh] overflow-y-auto overscroll-contain bg-black/55" role="dialog" aria-modal="true" aria-label="Checkout receipt" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="flex min-h-full justify-center p-0 sm:p-5">
    <div className="receipt-dialog-shell my-auto w-full max-w-3xl bg-[#fff7fb] px-4 py-4 text-slate-900 shadow-2xl sm:rounded-2xl sm:px-8 sm:py-6">
      <div className="receipt-ui-surface no-print sticky top-0 z-10 mb-5 flex items-center justify-between border-b border-pink-200 bg-[#fff7fb] pb-3"><div><h2 className="text-base font-bold">Receipt ready</h2><p className="mt-1 text-xs text-slate-500">Print it, or send it from your mail app.</p></div><button onClick={onClose} aria-label="Close receipt" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-pink-100"><X size={18} /></button></div>
      <div ref={paperRef} className="receipt-paper relative isolate mx-auto max-w-[480px] overflow-hidden rounded-2xl border border-pink-200 bg-[#fffafd] px-6 py-7 font-sans text-[12px] leading-5 text-slate-800 shadow-[0_12px_36px_rgba(143,49,94,.08)] print:shadow-none">
        {restaurantLogoUrl && <img src={mediaSrc(restaurantLogoUrl)} alt="" aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-60 w-60 -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.055]" />}
        <div className="relative z-10">
        <header className="relative mb-6 text-center">
          {restaurantLogoUrl && <img src={mediaSrc(restaurantLogoUrl)} alt="" className="receipt-logo mx-auto mb-3 h-14 max-w-36 rounded-xl border border-pink-100 bg-white p-1.5 object-contain shadow-sm" />}
          <p className="text-[9px] font-bold uppercase tracking-[.22em] text-[#d80c7c]">{showSignature ? "Room charge authorization" : isFolio ? "Restaurant receipt · Guest copy" : "Restaurant receipt"}</p>
          <h1 className="mt-1 font-display text-xl font-extrabold tracking-tight text-slate-900">{restaurantName}</h1>
          <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-pink-100 px-3 py-1 text-[11px] font-bold text-[#b90b6b]"><span className="h-1.5 w-1.5 rounded-full bg-[#f71591]" />{receipt.locationLabel ?? receipt.tableNumber}</div>
          <p className="mt-2 text-[10px] text-slate-500">{new Date(receipt.checkedOutAt).toLocaleString()}</p>
        </header>
        <div className="relative border-y border-dashed border-pink-300 py-3">
          {folioGroups ? folioGroups.map((group) => <div key={group.key} className="mb-4 border-b border-dashed border-pink-200 pb-3 last:mb-0 last:border-b-0 last:pb-0">
            {(() => {
              const signs: GuestSign[] = [];
              for (const row of group.rows) rememberSign(signs, chargeSign(row.charge, row.order));
              const food = moneyRound(group.rows.reduce((sum, row) => sum + row.food, 0));
              const only = group.rows.length === 1 ? group.rows[0] : null;
              const heading = group.title || (only?.charge.billNumber ? `Bill ${only.charge.billNumber} · ${only.charge.description}` : only?.charge.description || "Restaurant order");
              const plain = Boolean(only && !only.order && !only.charge.lines?.length);
              return <>
                <div className="flex justify-between gap-3 py-1"><span className="font-semibold">{heading}</span><span className="shrink-0 font-semibold tabular-nums">{money(food)}</span></div>
                {plain && only ? <p className="ml-3 text-[10px] text-slate-500">{only.charge.quantity} × {money(only.charge.unitPrice)}</p> : group.rows.map(({ charge, order }) => charge.lines?.length ? groupedChargeLines((charge.lines ?? []).filter((line) => !line.removedAt)).map((line, index) => <div key={`${charge.id}-${index}`} className="ml-3 py-0.5 text-[10px]"><div className="flex justify-between gap-3"><span>{line.quantity}× {line.name}</span><span className="shrink-0 tabular-nums">{money(line.amount)}</span></div>{line.detail && <p className="ml-4 mt-0.5 text-slate-500">{line.detail}</p>}</div>) : order ? order.items.filter((line) => !line.removedAt).map((line, index) => <div key={line.id ?? `${order.id}-${index}`} className="ml-3 py-0.5 text-[10px]"><div className="flex justify-between gap-3"><span>{countOf(line.quantity)}× {line.menuItem?.name || "Item"}{line.addExtras ? ` · ${line.addExtras}` : ""}{line.removeIngredients ? ` · No ${line.removeIngredients}` : ""}</span><span className="shrink-0 tabular-nums">{money(line.subtotal ?? Number(line.unitPrice ?? line.menuItem.price) * countOf(line.quantity))}</span></div>{line.modifierSelections?.map((selection) => <p key={selection.groupId} className="ml-4 mt-0.5 text-slate-500">{selection.groupName}: {selection.options.map((option) => option.name).join(", ")}</p>)}</div>) : null)}
                {signs.map((sign) => <SignMark key={sign.data} sign={sign} />)}
              </>;
            })()}
          </div>) : <>{receipt.orders.map((order) => <div key={order.id} className="receipt-item mb-3 last:mb-0">
            <div className="mb-2 flex justify-between gap-2 text-[10px] font-bold text-slate-500"><span className="font-mono uppercase tracking-wide">Order #{orderCode(order)}</span><span>{order.waiter?.name ?? ""}</span></div>
            {order.items.filter((line) => !line.removedAt).map((line, index) => <div key={line.id ?? `${order.id}-${index}`} className="mb-1">
              <div className="flex justify-between gap-3 py-1"><span className="font-semibold"><span className="mr-1 text-[#d80c7c]">{countOf(line.quantity)}×</span>{line.menuItem?.name || "Item"}</span><span className="shrink-0 font-semibold tabular-nums">{money(line.subtotal ?? Number(line.unitPrice ?? line.menuItem.price) * countOf(line.quantity))}</span></div>
              {line.modifierSelections?.map((selection) => <p key={selection.groupId} className="ml-5 text-[10px] leading-4 text-slate-500">{selection.groupName}: {selection.options.map((option) => option.name).join(", ")}</p>)}
              {(line.removeIngredients || line.addExtras || line.selectedAllergens?.length || line.specialNotes) && <p className="ml-5 rounded-lg bg-pink-50 px-2 py-1 text-[10px] leading-4 text-slate-600">{[line.removeIngredients && `No: ${line.removeIngredients}`, line.addExtras && `Extra: ${line.addExtras}`, line.selectedAllergens?.length && `Allergy: ${line.selectedAllergens.join(", ")}`, line.specialNotes].filter(Boolean).join(" · ")}</p>}
            </div>)}
            {orderSigns(order).map((sign) => <SignMark key={sign.data} sign={sign} />)}
          </div>)}{diningSigns.filter((sign) => !receipt.orders.some((order) => orderSigns(order).some((own) => own.data === sign.data))).map((sign) => <SignMark key={sign.data} sign={sign} />)}</>}
        </div>
        <div className="relative space-y-2 border-b border-dashed border-pink-300 py-4">
          {(folioPriced ? folioVat : diningVat) > 0 && <div className="flex justify-between gap-2 px-1 text-[11px] text-slate-500"><span>VAT</span><span className="tabular-nums">{vatRateText(folioPriced ? folioPercent : diningPercent)}</span></div>}
          <div className="flex justify-between gap-2 rounded-xl bg-pink-100/80 px-3 py-2.5 font-display text-sm font-extrabold text-slate-900"><span>Total</span><span className="tabular-nums">{money(receiptTotal)}</span></div>
          <div className="flex justify-between gap-2 px-1 pt-1"><span className="text-slate-500">Payment</span><span className="font-bold text-[#b90b6b]">{receipt.paymentMethod === "CASH" ? "Cash · Paid" : receipt.paymentMethod === "CARD" ? "Card · Paid" : receipt.paymentMethod === "PROMPTPAY" ? "PromptPay QR · Paid" : "Room folio"}</span></div>
          {receiptRooms.map((room, index) => <div key={`${room.roomNumber}-${index}`} className="space-y-1"><div className="flex justify-between gap-2 px-1"><span className="text-slate-500">Room number</span><span className="text-right font-semibold">{room.roomNumber}</span></div><div className="flex justify-between gap-2 px-1"><span className="shrink-0 text-slate-500">Guest name</span><span className="text-right font-semibold">{(room.guestNames?.length ? room.guestNames : [room.guestName]).filter(Boolean).join(" and ") || "—"}</span></div></div>)}
        </div>
        {showSignature && <p className="relative mt-4 text-center text-[10px] leading-4 text-slate-500">I authorize these restaurant charges to be added to my room folio.</p>}
        <p className="relative mt-6 text-center text-[10px] font-semibold tracking-wide text-[#b90b6b]">{thankYouPhrase}</p>
        </div>
      </div>
      <div className="receipt-ui-surface no-print sticky bottom-0 z-10 mt-5 flex flex-col gap-3 border-t border-pink-200 bg-[#fff7fb] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4">
        {isFolio && signatureImage ? <div className="receipt-mode-group flex rounded-xl border border-pink-200 bg-white p-1" aria-label="Receipt type">
          <button type="button" aria-pressed={!signatureCopy} onClick={() => setSignatureCopy(false)} className={`receipt-mode-button rounded-lg px-3 py-2 text-[10px] font-bold ${!signatureCopy ? "is-active bg-pink-100 text-[#b90b6b]" : "text-slate-600 hover:bg-pink-50"}`}>Guest receipt</button>
          <button type="button" aria-pressed={signatureCopy} onClick={() => setSignatureCopy(true)} className={`receipt-mode-button rounded-lg px-3 py-2 text-[10px] font-bold ${signatureCopy ? "is-active bg-pink-100 text-[#b90b6b]" : "text-slate-600 hover:bg-pink-50"}`}>Folio slip</button>
        </div> : null}
        {mailNote && <p className="text-right text-xs text-rose-700">{mailNote}</p>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" disabled={preparing || !pdfFile} onClick={sendMail} className="inline-flex h-10 items-center gap-2 rounded-xl border border-pink-200 bg-white px-4 text-xs font-bold text-[#b90b6b] disabled:opacity-50"><Mail size={15} /> Send mail</button>
          <button onClick={onClose} className="receipt-action-secondary h-10 rounded-xl border border-pink-200 bg-white px-4 text-xs font-bold text-slate-700">Close</button>
          <button type="button" disabled={preparingPreview || sendingPrinter} onClick={() => void showPrinterPreview()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-pink-200 bg-white px-4 text-xs font-bold text-[#b90b6b] disabled:opacity-50"><Eye size={15} /> {preparingPreview ? "Preparing…" : "Show preview"}</button>
          <button type="button" disabled={sendingPrinter || preparingPreview} onClick={() => void printToPrinter(Boolean(printerNote))} className="inline-flex h-10 items-center gap-2 rounded-xl border border-pink-200 bg-white px-4 text-xs font-bold text-[#b90b6b] disabled:opacity-50"><Printer size={15} /> {sendingPrinter ? "Sending…" : "Print to printer"}</button>
          <button type="button" disabled={appleTouch && !pdfFailed && (preparing || !pdfFile)} onClick={printReceipt} className="receipt-action-primary inline-flex h-10 items-center gap-2 rounded-xl bg-[#f71591] px-4 text-xs font-bold text-white hover:bg-[#d90d7b] disabled:opacity-50"><Printer size={15} /> {appleTouch && preparing && !pdfFailed ? "Preparing…" : "Print / Save PDF"}</button>
        </div>
      </div>
      {printerNote && <p className="no-print mt-3 text-right text-xs text-slate-500">{printerNote}</p>}
      {printerPreview && <div className="no-print fixed inset-0 z-[120] flex h-[100dvh] items-start justify-center overflow-y-auto bg-black/55 p-0 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label="Printer preview" onMouseDown={(event) => { if (event.target === event.currentTarget) setPrinterPreview(""); }}>
        <div className="my-0 min-h-[100dvh] w-full max-w-3xl bg-[#fff7fb] px-4 py-4 text-slate-900 shadow-2xl sm:my-5 sm:min-h-0 sm:rounded-2xl sm:px-8 sm:py-6">
          <div className="sticky top-0 z-10 mb-5 flex items-center justify-between border-b border-pink-200 bg-[#fff7fb] pb-3">
            <div><h2 className="text-base font-bold">Printer preview</h2><p className="mt-1 text-xs text-slate-500">This is the one slip the printer will print. Nothing has been sent yet.</p></div>
            <button type="button" onClick={() => setPrinterPreview("")} aria-label="Close preview" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-pink-100"><X size={18} /></button>
          </div>
          <iframe title="Printer preview" srcDoc={printerPreview} className="mx-auto block h-[70vh] w-[92mm] max-w-full border-0 bg-white shadow-sm" />
          <div className="sticky bottom-0 z-10 mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-pink-200 bg-[#fff7fb] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4">
            <button type="button" onClick={() => setPrinterPreview("")} className="h-10 rounded-xl border border-pink-200 bg-white px-4 text-xs font-bold text-slate-700">Back</button>
            <button type="button" disabled={sendingPrinter} onClick={() => void printToPrinter(Boolean(printerNote))} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#f71591] px-4 text-xs font-bold text-white hover:bg-[#d90d7b] disabled:opacity-50"><Printer size={15} /> {sendingPrinter ? "Sending…" : "Print this"}</button>
          </div>
          {printerNote && <p className="mt-3 text-right text-xs text-slate-500">{printerNote}</p>}
        </div>
      </div>}
    </div>
    </div>
  </div>;
}
