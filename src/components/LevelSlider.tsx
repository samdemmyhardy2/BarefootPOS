import { useRef } from "react";

type LevelSliderProps = {
  labels: string[];
  value: number;
  onChange: (index: number) => void;
  ariaLabel: string;
  className?: string;
};

export function LevelSlider({ labels, value, onChange, ariaLabel, className = "" }: LevelSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const latest = useRef(value);
  if (!labels.length) return null;
  const max = labels.length - 1;
  const current = Math.max(0, Math.min(value, max));
  latest.current = current;

  const indexFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track || max === 0) return 0;
    const rect = track.getBoundingClientRect();
    const styles = getComputedStyle(track);
    const start = rect.left + parseFloat(styles.paddingLeft) + 11.5;
    const end = rect.right - parseFloat(styles.paddingRight) - 11.5;
    const ratio = (clientX - start) / Math.max(end - start, 1);
    return Math.max(0, Math.min(max, Math.round(ratio * max)));
  };

  const moveTo = (clientX: number) => {
    const next = indexFromClientX(clientX);
    if (next === latest.current) return;
    latest.current = next;
    onChange(next);
  };

  return <div className={`${className} pb-10`}>
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={current}
      aria-valuetext={labels[current]}
      className="relative cursor-pointer touch-none select-none px-0.5 py-2"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        moveTo(event.clientX);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        moveTo(event.clientX);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          event.preventDefault();
          onChange(Math.min(max, current + 1));
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          event.preventDefault();
          onChange(Math.max(0, current - 1));
        }
      }}
    >
      <div className="absolute left-[11px] right-[11px] top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#f4e5ec]" />
      <div className="relative flex items-start justify-between">
        {labels.map((label, index) => <div key={`${label}-${index}`} className="relative flex w-[23px] shrink-0 flex-col items-center">
          <span className={`grid h-[23px] w-[23px] place-items-center rounded-full transition ${current === index ? "border-2 border-[#ed168c] bg-white" : ""}`}><span className={`rounded-full ${current === index ? "h-2 w-2 bg-white" : "h-2.5 w-2.5 bg-[#ddcbd4]"}`} /></span>
          <span className={`absolute top-full left-1/2 mt-1 w-max max-w-[4.5rem] -translate-x-1/2 text-center text-[11px] leading-4 ${current === index ? "font-semibold text-[#34242d]" : "text-[#8d7b84]"}`}>{label}</span>
        </div>)}
      </div>
    </div>
  </div>;
}
