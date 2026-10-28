import { X } from "lucide-react";
import type {
  ElementType,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import type { OrderStatus, TableStatus } from "../lib/types";
import { createPortal } from "react-dom";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div>
        {eyebrow && (
          <p className="mb-3 inline-flex items-center rounded-full border border-olive/10 bg-olive-soft px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-olive">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-[30px] font-extrabold leading-tight tracking-[-.05em] text-ink sm:text-[36px]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-muted sm:text-sm">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[22px] border border-line bg-white shadow-card ${className}`}
    >
      {children}
    </section>
  );
}

const orderStyles: Record<OrderStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700 ring-amber-100",
  PREPARING: "bg-sky-50 text-sky-700 ring-sky-100",
  READY: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  SERVED: "bg-violet-50 text-violet-700 ring-violet-100",
  COMPLETED: "bg-stone-100 text-stone-600 ring-stone-200",
  CANCELLED: "bg-rose-50 text-rose-700 ring-rose-100",
};

export function OrderBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] ring-1 ring-inset ${orderStyles[status]}`}
    >
      {status.toLowerCase()}
    </span>
  );
}

export function TableBadge({ status }: { status: TableStatus }) {
  const style =
    status === "AVAILABLE"
      ? "bg-emerald-50 text-emerald-700"
      : status === "OCCUPIED"
        ? "bg-rose-50 text-rose-700"
        : "bg-amber-50 text-amber-700";
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] ${style}`}
    >
      {status.toLowerCase()}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: ElementType;
  title: string;
  body: string;
}) {
  return (
      <div className="flex min-h-52 flex-col items-center justify-center px-6 py-11 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-[18px] bg-olive-soft text-olive">
        <Icon size={21} />
      </div>
      <p className="font-display text-[15px] font-bold text-ink">{title}</p>
      <p className="mt-1.5 max-w-sm text-[13px] leading-5 text-muted">{body}</p>
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
  extraWide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  extraWide?: boolean;
}) {
  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink/35 p-4 backdrop-blur-[2px] sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`max-h-[min(94vh,1000px)] w-full overflow-y-auto rounded-[24px] border border-line bg-white p-5 shadow-float sm:p-7 ${extraWide ? "max-w-5xl" : wide ? "max-w-2xl" : "max-w-lg"
          }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold tracking-tight">
            {title}
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="focus-ring grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-canvas hover:text-ink"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {children}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-ink">
        {label}
      </span>
      <input
        {...props}
        className={`focus-ring w-full rounded-xl border border-line bg-[#fcfcfa] px-3.5 py-3 text-sm text-ink placeholder:text-[#a4a89f] outline-none transition duration-150 hover:border-[#cbd2c6] focus:border-olive focus:bg-white ${props.className ?? ""}`}
      />
    </label>
  );
}

export function SelectField({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-ink">
        {label}
      </span>
      <select
        {...props}
        className="focus-ring w-full rounded-xl border border-line bg-[#fcfcfa] px-3.5 py-3 text-sm text-ink outline-none transition duration-150 hover:border-[#cbd2c6] focus:border-olive focus:bg-white"
      >
        {children}
      </select>
    </label>
  );
}
