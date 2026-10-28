type LevelSliderProps = {
  labels: string[];
  value: number;
  onChange: (index: number) => void;
  ariaLabel: string;
  className?: string;
};

export function LevelSlider({ labels, value, onChange, ariaLabel, className = "" }: LevelSliderProps) {
  if (!labels.length) return null;
  const max = labels.length - 1;
  return <div className={className}>
    <div className="relative px-0.5">
      <div className="absolute left-[11px] right-[11px] top-[11px] h-1 rounded-full bg-[#f4e5ec]" />
      <div className="relative flex items-center justify-between">
        {labels.map((label, index) => <button key={`${label}-${index}`} type="button" aria-label={label} aria-pressed={value === index} onClick={() => onChange(index)} className={`relative z-[1] grid h-[23px] w-[23px] shrink-0 place-items-center rounded-full transition ${value === index ? "border-2 border-[#ed168c] bg-white" : "border-0 bg-transparent"}`}><span className={`rounded-full ${value === index ? "h-2 w-2 bg-white" : "h-2.5 w-2.5 bg-[#ddcbd4]"}`} /></button>)}
        <input aria-label={ariaLabel} type="range" min={0} max={max} step={1} value={Math.max(0, Math.min(value, max))} onChange={(event) => onChange(Number(event.target.value))} className="absolute left-[11px] right-[11px] top-0 z-[2] h-[23px] cursor-pointer opacity-0" />
      </div>
    </div>
    <div className="mt-1 flex justify-between gap-1">
      {labels.map((label, index) => <button key={`${label}-label-${index}`} type="button" onClick={() => onChange(index)} className={`min-w-0 flex-1 text-left text-[11px] leading-4 transition ${value === index ? "font-semibold text-[#34242d]" : "text-[#8d7b84]"}`}>{label}</button>)}
    </div>
  </div>;
}
