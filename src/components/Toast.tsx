import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { useEffect } from "react";
import { useUiStore } from "../stores/uiStore";

export function Toast() {
  const toast = useUiStore((state) => state.toast);
  const clearToast = useUiStore((state) => state.clearToast);
  useEffect(() => {
    if (toast) {
      const timer = window.setTimeout(clearToast, 3800);
      return () => window.clearTimeout(timer);
    }
  }, [toast, clearToast]);
  if (!toast) return null;
  const Icon = toast.tone === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div
      role="status"
      className="fixed bottom-5 right-5 z-[70] flex max-w-[calc(100vw-40px)] items-center gap-3 rounded-2xl bg-ink px-4 py-3.5 text-sm text-white shadow-float"
    >
      <Icon
        size={18}
        className={toast.tone === "success" ? "text-citrus" : "text-rose-300"}
      />
      <span>{toast.message}</span>
      <button
        onClick={clearToast}
        className="ml-2 text-white/60 hover:text-white"
        aria-label="Dismiss notification"
      >
        <X size={16} />
      </button>
    </div>
  );
}
