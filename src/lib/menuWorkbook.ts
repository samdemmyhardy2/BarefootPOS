export type MenuField = "category" | "name" | "description" | "price" | "sendTo";
export type SendChoice = "KITCHEN" | "BAR" | "NONE";
export type MenuMapping = Partial<Record<MenuField, number>>;

export const menuFields: { id: MenuField; label: string; required: boolean }[] = [
  { id: "category", label: "Category", required: true },
  { id: "name", label: "Name", required: true },
  { id: "description", label: "Description", required: false },
  { id: "price", label: "Price (THB)", required: true },
  { id: "sendTo", label: "Send to", required: false },
];

export interface ImportedDish {
  category: string;
  name: string;
  description: string;
  price: number;
  sendTo: SendChoice;
}

export interface MappedLine {
  row: number;
  dish: ImportedDish | null;
  problem: string | null;
}

const headerAliases: Record<MenuField, string[]> = {
  category: ["category", "categories", "section", "menu section", "group"],
  name: ["name", "dish", "dish name", "item", "item name", "menu item", "product"],
  description: ["description", "desc", "details", "detail"],
  price: ["price", "price (thb)", "price(thb)", "price thb", "thb", "amount"],
  sendTo: ["send to", "sendto", "station", "prep", "prep station", "destination"],
};

function cleanHeader(value: string) {
  return value.trim().toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ");
}

function matchHeader(value: string): MenuField | null {
  const text = cleanHeader(value);
  if (!text) return null;
  for (const field of Object.keys(headerAliases) as MenuField[]) {
    if (headerAliases[field].includes(text)) return field;
    if (field === "price" && text.startsWith("price")) return "price";
    if (field === "sendTo" && text.startsWith("send to")) return "sendTo";
  }
  return null;
}

export function inspectSheet(rows: string[][]) {
  let headerIndex: number | null = null;
  let mapping: MenuMapping = {};
  let bestScore = 0;
  const limit = Math.min(rows.length, 15);
  for (let index = 0; index < limit; index += 1) {
    const next: MenuMapping = {};
    rows[index].forEach((cell, column) => {
      const field = matchHeader(cell);
      if (field && next[field] == null) next[field] = column;
    });
    const score = (["category", "name", "price"] as const).filter((field) => next[field] != null).length;
    if (score > bestScore) {
      bestScore = score;
      headerIndex = index;
      mapping = next;
    }
  }
  if (bestScore < 2) return { headerIndex: null as number | null, mapping: {} as MenuMapping };
  return { headerIndex, mapping };
}

export function parsePrice(value: string) {
  const text = value.trim().replace(/,/g, "").replace(/฿/g, "").replace(/thb/ig, "").trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const price = Number(text);
  if (!Number.isFinite(price) || price < 0) return null;
  return Math.round(price * 100) / 100;
}

export function parseSendTo(value: string): SendChoice | null {
  const text = value.trim().toLowerCase().replace(/[’']/g, "'").replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!text) return null;
  if (text === "kitchen") return "KITCHEN";
  if (text === "bar") return "BAR";
  if (["don't send", "dont send", "do not send", "none", "no send", "not sent"].includes(text)) return "NONE";
  return null;
}

export function sendLabel(value: SendChoice) {
  if (value === "KITCHEN") return "Kitchen";
  if (value === "BAR") return "Bar";
  return "Don't send";
}

export function mapRows(rows: string[][], headerIndex: number | null, mapping: MenuMapping): MappedLine[] {
  const start = headerIndex == null ? 0 : headerIndex + 1;
  const lines: MappedLine[] = [];
  for (let index = start; index < rows.length; index += 1) {
    const source = rows[index] ?? [];
    const cell = (field: MenuField) => {
      const column = mapping[field];
      return column == null ? "" : (source[column] ?? "").trim();
    };
    const category = cell("category").replace(/\s+/g, " ");
    const name = cell("name").replace(/\s+/g, " ");
    const description = cell("description");
    const priceText = cell("price");
    const sendText = cell("sendTo");
    if (!category && !name && !description && !priceText && !sendText) continue;
    const row = index + 1;
    if (!category) {
      lines.push({ row, dish: null, problem: "Category is empty" });
      continue;
    }
    if (!name) {
      lines.push({ row, dish: null, problem: "Name is empty" });
      continue;
    }
    const price = priceText ? parsePrice(priceText) : 0;
    if (price == null) {
      lines.push({ row, dish: null, problem: "Price must be a number in THB" });
      continue;
    }
    let sendTo: SendChoice = "KITCHEN";
    if (mapping.sendTo != null && sendText) {
      const parsed = parseSendTo(sendText);
      if (!parsed) {
        lines.push({ row, dish: null, problem: "Send to must be Kitchen, Bar, or Don't send" });
        continue;
      }
      sendTo = parsed;
    }
    lines.push({ row, dish: { category, name, description, price, sendTo }, problem: null });
  }
  return lines;
}

export function columnLabel(index: number, header: string[]) {
  const letter = index < 26 ? String.fromCharCode(65 + index) : `Column ${index + 1}`;
  const name = header[index]?.trim();
  return name ? `${letter} · ${name}` : letter;
}

function sheetTable(XLSX: typeof import("xlsx"), sheet: import("xlsx").WorkSheet) {
  const table = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][];
  return table.map((row) => (Array.isArray(row) ? row : []).map((cell) => String(cell ?? "").trim()));
}

export async function readMenuWorkbook(file: File) {
  const XLSX = await import("xlsx");
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  let dishRows: string[][] = [];
  let dishScore = 0;
  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    if (!sheet) continue;
    const table = sheetTable(XLSX, sheet);
    const header = table.slice(0, 8).flat().join(" ").toLowerCase();
    const dish = (header.includes("category") ? 1 : 0) + (header.includes("price") ? 1 : 0) + (header.includes("send") ? 1 : 0);
    if (dish > dishScore) { dishScore = dish; dishRows = table; }
  }
  if (!dishRows.length && book.SheetNames[0]) {
    const sheet = book.Sheets[book.SheetNames[0]];
    if (sheet) dishRows = sheetTable(XLSX, sheet);
  }
  return dishRows;
}
