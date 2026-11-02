import { useState } from "react";
import { LevelSlider } from "./LevelSlider";
import { money } from "../lib/types";

type PreviewOption = { name: string; nameMy: string; nameTh: string; priceAdjustment: string; defaultSelected: boolean; active: boolean };
type Props = {
  name: string;
  nameMy: string;
  required: boolean;
  appearance: "RADIO" | "CHECKBOX" | "SLIDER" | "QUANTITY" | "TEXT" | "TOGGLE";
  selectionType: "SINGLE" | "MULTIPLE";
  minPicks: number;
  includedPicks: number;
  extraPickPrice: number;
  maxPicks: number;
  options: PreviewOption[];
};

export function ModifierGroupLivePreview({ name, nameMy, required, appearance, selectionType, minPicks, includedPicks, extraPickPrice, maxPicks, options }: Props) {
  const activeOptions = options.filter((option) => option.active && option.name.trim());
  const defaults = activeOptions.flatMap((option, index) => option.defaultSelected ? [index] : []);
  const [selected, setSelected] = useState<number[]>(defaults);
  const [counts, setCounts] = useState<number[]>(activeOptions.map((option) => option.defaultSelected ? 1 : 0));
  const [sliderValue, setSliderValue] = useState(defaults[0] ?? 0);
  const [textValue, setTextValue] = useState("");
  const totalCount = counts.reduce((sum, count) => sum + count, 0);
  const toggle = (index: number) => setSelected((current) => selectionType === "SINGLE" ? [index] : current.includes(index) ? current.filter((value) => value !== index) : current.length >= maxPicks ? current : [...current, index]);
  const changeCount = (index: number, delta: number) => setCounts((current) => {
    const next = [...current];
    const total = next.reduce((sum, count) => sum + count, 0);
    if (delta > 0 && total >= maxPicks) return current;
    next[index] = Math.max(0, Math.min(maxPicks, (next[index] ?? 0) + delta));
    return next;
  });
  const optionPrice = (index: number) => {
    const countBefore = counts.slice(0, index).reduce((sum, count) => sum + count, 0);
    return countBefore < includedPicks ? 0 : Number(activeOptions[index]?.priceAdjustment || 0) + extraPickPrice;
  };
  return <div className="rounded-xl border border-[#f1dfe9] p-3">
    <div className="mb-3 flex items-center justify-between"><div><span className="text-[13px] font-bold">{name || "Group name"}</span>{nameMy && <span className="ml-2 text-[13px] text-muted">{nameMy}</span>}</div><span className="rounded-full bg-[#f5f5f4] px-2 py-1 text-[11px] font-semibold">{required ? "Required" : "Optional"}</span></div>
    {appearance === "SLIDER" ? <div className="py-2"><h4 className="text-[13px] font-bold">How {name.trim().toLowerCase() || "much"} is it?</h4><p className="mb-4 mt-1 text-[11px] text-muted">Tap a level. The kitchen makes it this way unless the guest asks for different.</p><LevelSlider labels={activeOptions.map((option, index) => option.name || `Level ${index + 1}`)} value={Math.min(sliderValue, Math.max(activeOptions.length - 1, 0))} onChange={setSliderValue} ariaLabel={`Choose ${name || "a level"}`} /></div>
      : appearance === "TEXT" ? <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-muted">Your response</span><input value={textValue} onChange={(event) => setTextValue(event.target.value)} placeholder="Type a response" className="h-10 w-full rounded-lg border border-[#f1dfe9] px-3 text-[13px] outline-none focus:border-[#ed168c]" /></label>
      : appearance === "QUANTITY" ? <div className="grid gap-2 sm:grid-cols-2">{activeOptions.map((option, index) => { const price = optionPrice(index); return <div key={`${option.name}-${index}`} className={`flex min-h-16 items-center gap-2 rounded-lg border p-2.5 ${counts[index] ? "border-[#ed168c] bg-[#fff8fb]" : "border-[#f1dfe9]"}`}><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-semibold">{option.name}</p><p className="text-[10px] text-muted">{price > 0 ? `+${money(price)}` : "Included"}</p></div><div className="flex h-8 shrink-0 items-center rounded-lg bg-[#fff4f9] p-0.5"><button type="button" aria-label={`Decrease ${option.name}`} disabled={!counts[index]} onClick={() => changeCount(index, -1)} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white disabled:opacity-30">−</button><span className="w-6 text-center text-[11px] font-bold">{counts[index] ?? 0}</span><button type="button" aria-label={`Increase ${option.name}`} disabled={totalCount >= maxPicks} onClick={() => changeCount(index, 1)} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white disabled:opacity-30">＋</button></div></div>; })}</div>
      : appearance === "TOGGLE" ? <div className="space-y-2">{activeOptions.map((option, index) => { const on = selected.includes(index); const price = Number(option.priceAdjustment); return <div key={`${option.name}-${index}`} className={`flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2.5 ${on ? "border-[#ed168c] bg-[#fff8fb]" : "border-[#f1dfe9]"}`}><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold">{option.name || "Choice"}</p><p className="text-[11px] text-muted">{on ? "Included" : "Not included"}{on && price > 0 ? ` · +${money(price)}` : ""}</p></div><button type="button" role="switch" aria-checked={on} aria-label={`${on ? "Leave out" : "Include"} ${option.name || "choice"}`} onClick={() => setSelected((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index])} className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-[#ed168c]" : "bg-[#efe4ea]"}`}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition ${on ? "left-[22px]" : "left-0.5"}`} /></button></div>; })}</div>
      : <><p className="mb-2 text-right text-[11px] text-muted">Pick at least {minPicks} · first {includedPicks} included</p><div className="grid gap-2 sm:grid-cols-2">{activeOptions.map((option, index) => <button key={`${option.name}-${index}`} type="button" aria-pressed={selected.includes(index)} onClick={() => toggle(index)} className={`flex min-h-14 items-center gap-2 rounded-lg border p-2.5 text-left transition ${selected.includes(index) ? "border-[#ed168c] bg-[#fff8fb]" : "border-[#f1dfe9] hover:border-[#ed168c]/50"}`}><span className={`grid h-4 w-4 shrink-0 place-items-center border text-[10px] text-white ${selectionType === "SINGLE" ? "rounded-full" : "rounded"} ${selected.includes(index) ? "border-[#ed168c] bg-[#ed168c]" : "border-[#ad97a1]"}`}>{selected.includes(index) ? "✓" : ""}</span><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold">{option.name}</span>{option.nameMy && <span className="block text-[10px] text-muted">{option.nameMy}</span>}</span><span className="text-[11px] text-muted">{Number(option.priceAdjustment) ? `+${money(option.priceAdjustment)}` : "Included"}</span></button>)}</div></>}
  </div>;
}
