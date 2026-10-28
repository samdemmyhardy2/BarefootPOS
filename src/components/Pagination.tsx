import { ChevronLeft, ChevronRight } from "lucide-react";

type PaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
};

export function Pagination({ page, totalPages, total, onPageChange, disabled = false }: PaginationProps) {
  if (totalPages <= 1) return null;
  const first = (page - 1) * 10 + 1;
  const last = Math.min(page * 10, total);
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => start + index);
  return <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
    <p className="text-xs text-muted">Showing <span className="font-semibold text-ink">{first}–{last}</span> of <span className="font-semibold text-ink">{total}</span></p>
    <div className="flex items-center gap-1">
      <button type="button" aria-label="Previous page" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:bg-[#fff4f9] disabled:opacity-40"><ChevronLeft size={15} /></button>
      {pages.map((value) => <button type="button" key={value} aria-current={value === page ? "page" : undefined} disabled={disabled} onClick={() => onPageChange(value)} className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold ${value === page ? "bg-[#ed168c] text-white" : "border border-line text-muted hover:bg-[#fff4f9]"}`}>{value}</button>)}
      <button type="button" aria-label="Next page" disabled={disabled || page >= totalPages} onClick={() => onPageChange(page + 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:bg-[#fff4f9] disabled:opacity-40"><ChevronRight size={15} /></button>
    </div>
  </nav>;
}
