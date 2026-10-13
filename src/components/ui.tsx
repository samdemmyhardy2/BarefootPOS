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
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[.18em] text-olive">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-[28px] font-bold tracking-[-.045em] text-ink sm:text-[34px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">
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
      className={`rounded-[20px] border border-line bg-white shadow-card ${className}`}
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
    <div className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-olive-soft text-olive">
        <Icon size={21} />
      </div>
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-sm leading-5 text-muted">{body}</p>
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink/35 p-4 backdrop-blur-[2px] sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full rounded-[24px] bg-white p-5 shadow-float sm:p-7 ${wide ? "max-w-2xl" : "max-w-lg"
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
        className={`focus-ring w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-ink placeholder:text-[#a4a89f] outline-none transition focus:border-olive ${props.className ?? ""}`}
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
        className="focus-ring w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-ink outline-none focus:border-olive"
      >
        {children}
      </select>
    </label>
  );
}
