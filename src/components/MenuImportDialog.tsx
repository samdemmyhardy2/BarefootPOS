import { useMemo, useState } from "react";
import { Modal } from "./ui";
import { api, errorMessage } from "../lib/api";
import { columnLabel, inspectSheet, mapRows, menuFields, sendLabel, type MenuField, type MenuMapping } from "../lib/menuWorkbook";

export function MenuImportDialog({
  fileName,
  rows,
  onClose,
  onImported,
}: {
  fileName: string;
  rows: string[][];
  onClose: () => void;
  onImported: (message: string) => void;
}) {
  const detected = useMemo(() => inspectSheet(rows), [rows]);
  const [mapping, setMapping] = useState<MenuMapping>(detected.mapping);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const header = detected.headerIndex == null ? [] : rows[detected.headerIndex] ?? [];
  const width = Math.max(header.length, ...rows.slice(0, 20).map((row) => row.length), 1);
  const columns = Array.from({ length: width }, (_, index) => index);
  const lines = useMemo(() => mapRows(rows, detected.headerIndex, mapping), [rows, detected.headerIndex, mapping]);
  const ready = lines.flatMap((line) => line.dish ? [line.dish] : []);
  const problems = lines.filter((line) => line.problem);
  const missing = menuFields.filter((field) => field.required && mapping[field.id] == null);
  const setColumn = (field: MenuField, value: string) => {
    setMapping((current) => {
      const next = { ...current };
      if (value === "") delete next[field];
      else next[field] = Number(value);
      return next;
    });
  };

  const importRows = async () => {
    if (!ready.length || missing.length) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post<{ createdCategories: number; createdItems: number; updatedItems: number }>("/menu-items/import", { rows: ready });
      const parts = [
        data.createdItems ? `${data.createdItems} new ${data.createdItems === 1 ? "dish" : "dishes"}` : "",
        data.updatedItems ? `${data.updatedItems} updated` : "",
        data.createdCategories ? `${data.createdCategories} new ${data.createdCategories === 1 ? "category" : "categories"}` : "",
      ].filter(Boolean);
      onImported(parts.length ? `Imported ${parts.join(", ")}.` : "Nothing new to import.");
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Import menu"
      wide
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={onClose} className="h-11 rounded-xl border border-line px-5 text-sm font-bold">Cancel</button>
          <button type="button" disabled={busy || !ready.length || missing.length > 0} onClick={() => void importRows()} className="h-11 rounded-xl bg-[#f01898] px-5 text-sm font-bold text-white disabled:opacity-50">{busy ? "Importing…" : `Import ${ready.length} ${ready.length === 1 ? "dish" : "dishes"}`}</button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-muted">{fileName}. Match each spreadsheet column to a menu field. Each dish is filed under its category. Options are not imported.</p>
        {detected.headerIndex == null && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">No header row was recognized. Choose the columns yourself.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {menuFields.map((field) => (
            <label key={field.id} className="block">
              <span className="mb-1.5 block text-xs font-semibold text-ink">{field.label}{field.required ? "" : " · optional"}</span>
              <select value={mapping[field.id] ?? ""} onChange={(event) => setColumn(field.id, event.target.value)} className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-[#f01898]">
                <option value="">{field.required ? "Choose a column" : "Not in this file"}</option>
                {columns.map((column) => <option key={column} value={column}>{columnLabel(column, header)}</option>)}
              </select>
            </label>
          ))}
        </div>
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        {missing.length > 0 && <p className="text-xs font-semibold text-rose-700">Map {missing.map((field) => field.label).join(", ")} before importing.</p>}
        <div>
          <p className="text-xs font-bold text-ink">{ready.length} ready{problems.length ? ` · ${problems.length} skipped` : ""}</p>
          <div className="mt-2 overflow-hidden rounded-xl border border-line">
            <div className="grid grid-cols-[3.5rem_1fr_1fr_4.5rem_5.5rem] gap-2 bg-[#fff7fb] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted"><span>Row</span><span>Dish</span><span>Category</span><span>Price</span><span>Send to</span></div>
            <div className="max-h-52 divide-y divide-[#f6e7ef] overflow-y-auto">
              {lines.slice(0, 12).map((line) => (
                <div key={line.row} className="grid grid-cols-[3.5rem_1fr_1fr_4.5rem_5.5rem] gap-2 px-3 py-2 text-xs">
                  <span className="text-muted">{line.row}</span>
                  {line.dish ? <><span className="truncate font-semibold">{line.dish.name}</span><span className="truncate text-muted">{line.dish.category}</span><span>{line.dish.price}</span><span className="truncate">{sendLabel(line.dish.sendTo)}</span></> : <span className="col-span-4 text-rose-700">{line.problem}</span>}
                </div>
              ))}
              {!lines.length && <p className="px-3 py-4 text-xs text-muted">No dishes in this sheet.</p>}
            </div>
          </div>
          {problems.length > 0 && <ul className="mt-2 space-y-1 text-[11px] text-rose-700">{problems.slice(0, 6).map((line) => <li key={line.row}>Row {line.row}: {line.problem}</li>)}</ul>}
        </div>
      </div>
    </Modal>
  );
}
