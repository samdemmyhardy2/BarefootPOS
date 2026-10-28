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
  return <div className={`${className} pb-8`}>
    <div className="relative px-0.5">
      <div className="absolute left-[11px] right-[11px] top-[11px] h-1 rounded-full bg-[#f4e5ec]" />
      <div className="relative flex items-start justify-between">
        {labels.map((label, index) => <button key={`${label}-${index}`} type="button" aria-label={label} aria-pressed={value === index} onClick={() => onChange(index)} className="relative z-[2] flex w-[23px] shrink-0 flex-col items-center">
          <span className={`grid h-[23px] w-[23px] place-items-center rounded-full transition ${value === index ? "border-2 border-[#ed168c] bg-white" : ""}`}><span className={`rounded-full ${value === index ? "h-2 w-2 bg-white" : "h-2.5 w-2.5 bg-[#ddcbd4]"}`} /></span>
          <span className={`absolute top-full left-1/2 mt-1 w-max max-w-[4.5rem] -translate-x-1/2 text-center text-[11px] leading-4 ${value === index ? "font-semibold text-[#34242d]" : "text-[#8d7b84]"}`}>{label}</span>
        </button>)}
        <input aria-label={ariaLabel} type="range" min={0} max={max} step={1} value={Math.max(0, Math.min(value, max))} onChange={(event) => onChange(Number(event.target.value))} className="absolute left-[11px] right-[11px] top-0 z-[1] h-[23px] cursor-pointer opacity-0" />
      </div>
    </div>
  </div>;
}
