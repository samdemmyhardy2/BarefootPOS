import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { savedViewSince, watchSavedView } from "../lib/offlineCache";

function current() {
  return { offline: navigator.onLine === false, since: savedViewSince() };
}

export function OfflineBanner() {
  const [view, setView] = useState(current);
  useEffect(() => watchSavedView(() => setView(current())), []);
  if (!view.offline && !view.since) return null;
  const saved = view.since ? new Date(view.since).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  return <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
    <WifiOff size={16} className="mt-0.5 shrink-0" />
    <div>
      <p className="font-bold">{view.offline ? "You are offline" : "The restaurant server cannot be reached"}</p>
      <p className="mt-1 text-xs">{saved ? `Showing the copy saved on this device on ${saved}. ` : "Pages you opened before will show their saved copy. "}It is view-only until the connection returns.</p>
    </div>
  </div>;
}
