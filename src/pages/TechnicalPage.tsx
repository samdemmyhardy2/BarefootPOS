import { useCallback, useEffect, useState } from "react";
import { Activity, CheckCircle2, Cpu, Database, HardDrive, Network, RefreshCw, Server, ServerCog, XCircle } from "lucide-react";
import { PageHeader, Panel } from "../components/ui";
import { api } from "../lib/api";

type Service = { status: "online" | "offline" | "not_configured"; latencyMs?: number | null; responseMs?: number | null; uptimeSeconds?: number; processUptimeSeconds?: number; message?: string };
type TechnicalStatus = {
  checkedAt: string;
  services: { backend: Service; postgresql: Service; nginx: Service };
  resources: {
    cpu: { usagePercent: number; cores: number };
    memory: { usedBytes: number; totalBytes: number; usagePercent: number };
    disk: { status: string; path: string; totalBytes: number; usedBytes: number; availableBytes: number; usagePercent: number };
    network: { status: string; receivedBytes: number; sentBytes: number; receivedBytesPerSecond: number; sentBytesPerSecond: number };
  };
};

const bytes = (amount: number) => {
  if (amount < 1024) return `${amount} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = amount / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value.toFixed(1)} ${units[unit]}`;
};
const duration = (seconds = 0) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return `${days ? `${days}d ` : ""}${hours}h ${minutes}m`;
};

function StatusPill({ status }: { status: Service["status"] }) {
  const online = status === "online";
  const configured = status !== "not_configured";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${online ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : configured ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"}`}>{online ? <CheckCircle2 size={12} /> : <XCircle size={12} />}{status.replace("_", " ")}</span>;
}

function UsageCard({ title, icon: Icon, value, detail, percent }: { title: string; icon: typeof Cpu; value: string; detail: string; percent?: number }) {
  return <Panel className="p-5"><div className="flex items-center justify-between"><div className="grid h-10 w-10 place-items-center rounded-xl bg-olive-soft text-olive"><Icon size={18} /></div>{percent !== undefined && <span className="text-xs font-bold text-muted">{percent}%</span>}</div><p className="mt-4 text-xs font-semibold text-muted">{title}</p><p className="mt-1 font-display text-2xl font-extrabold tracking-tight">{value}</p><p className="mt-1 text-[11px] text-muted">{detail}</p>{percent !== undefined && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-olive transition-all" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} /></div>}</Panel>;
}

export function TechnicalPage() {
  const [data, setData] = useState<TechnicalStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try { const result = await api.get<TechnicalStatus>("/technical/status"); setData(result.data); setError(""); }
    catch { setError("Could not load technical status. Check the backend connection."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 15000); return () => window.clearInterval(timer); }, [refresh]);

  return <>
    <PageHeader eyebrow="Administration" title="Technical status" description="Live health and resource usage for the restaurant server." action={<button onClick={() => void refresh()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3 text-xs font-bold text-ink hover:bg-canvas dark:bg-surface"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh</button>} />
    {error && <Panel className="mb-5 border border-rose-200 p-4 text-sm font-semibold text-rose-700 dark:border-rose-900 dark:text-rose-300">{error}</Panel>}
    {!data && loading ? <Panel className="p-8 text-sm text-muted">Loading server status…</Panel> : data && <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {([ ["Backend API", data.services.backend, Server], ["PostgreSQL", data.services.postgresql, Database], ["Nginx", data.services.nginx, ServerCog] ] as const).map(([name, service, Icon]) => <Panel key={name} className="p-5"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-olive-soft text-olive"><Icon size={18} /></div><div><h2 className="text-sm font-bold">{name}</h2><p className="mt-1 text-[11px] text-muted">{name === "Backend API" ? `Up ${duration(service.uptimeSeconds)}` : name === "PostgreSQL" && service.latencyMs != null ? `${service.latencyMs} ms response` : name === "Nginx" && service.responseMs != null ? `${service.responseMs} ms response` : service.message ?? "Service connection check"}</p></div></div><StatusPill status={service.status} /></div></Panel>)}
      </section>
      <div className="mb-3 mt-8 flex items-center gap-2"><Activity size={16} className="text-olive" /><h2 className="font-display text-lg font-bold">Resource usage</h2></div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UsageCard title="CPU usage" icon={Cpu} value={`${data.resources.cpu.usagePercent}%`} detail={`${data.resources.cpu.cores} logical cores`} percent={data.resources.cpu.usagePercent} />
        <UsageCard title="Memory usage" icon={Activity} value={bytes(data.resources.memory.usedBytes)} detail={`of ${bytes(data.resources.memory.totalBytes)} total`} percent={data.resources.memory.usagePercent} />
        <UsageCard title="Disk usage" icon={HardDrive} value={bytes(data.resources.disk.usedBytes)} detail={`${bytes(data.resources.disk.availableBytes)} free · ${data.resources.disk.path}`} percent={data.resources.disk.usagePercent} />
        <UsageCard title="Network traffic" icon={Network} value={`${bytes(data.resources.network.receivedBytesPerSecond)}/s`} detail={`↓ inbound · ↑ ${bytes(data.resources.network.sentBytesPerSecond)}/s · since server start`} />
      </section>
      <p className="mt-5 text-right text-[10px] text-muted">Auto refreshes every 15 seconds · Last checked {new Date(data.checkedAt).toLocaleTimeString()}</p>
    </>}
  </>;
}
