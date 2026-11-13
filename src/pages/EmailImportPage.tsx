import { useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api";

type Stage = { stage: string; status: string; detail: string };
type MessageRow = {
  id: string;
  messageId: string;
  subject: string | null;
  fromAddress: string | null;
  status: string;
  outcome: string | null;
  error: string | null;
  confirmationNumber: string | null;
  cloudbedsReservationId: string | null;
  guestName: string | null;
  noticeKind: string | null;
  noticeAt: string | null;
  stayId: string | null;
  parentMessageId: string | null;
  createdAt: string;
};
type SyncRun = { id: string; trigger: string; status: string; startedAt: string; finishedAt: string | null; scanned: number; discovered: number; nested: number; attachments: number; duplicates: number; imported: number; updated: number; canceled: number; payments: number; skipped: number; unmatched: number; failed: number; error: string | null };
type Detail = MessageRow & { attemptLog: { stages?: Stage[]; result?: string } | null; rawMime?: string };

export function EmailImportPage() {
  const [rows, setRows] = useState<MessageRow[]>([]);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [summary, setSummary] = useState<{ connected: boolean; pending: number; failed: number } | null>(null);
  const [sync, setSync] = useState<{ intervalHours: number; enabled: boolean; nextAt: string | null } | null>(null);
  const [filters, setFilters] = useState({ messageId: "", confirmation: "", cloudbedsId: "", guest: "", kind: "", status: "" });
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"sync" | "backfill" | null>(null);

  const load = async (next = filters) => {
    setError("");
    const { data } = await api.get<{ messages?: MessageRow[]; imports?: MessageRow[]; sync?: { intervalHours: number; enabled: boolean; nextAt: string | null; runs?: SyncRun[] }; connected: boolean; pending: number; failed: number }>("/rooms/email-imports", { params: next });
    setRows(data.messages ?? data.imports ?? []);
    setRuns(data.sync?.runs ?? []);
    setSync(data.sync ?? null);
    setSummary(data);
  };

  useEffect(() => { void load().catch((reason) => setError(errorMessage(reason))); }, []);
  const importing = (runs ?? []).some((run) => run.status === "RUNNING");
  useEffect(() => {
    if (!importing) return;
    const timer = window.setInterval(() => { void load().catch(() => undefined); }, 2000);
    return () => window.clearInterval(timer);
  }, [importing]);

  const runImport = async (kind: "sync" | "backfill") => {
    setBusy(kind);
    setError("");
    try {
      await api.post(kind === "backfill" ? "/rooms/email-imports/backfill" : "/rooms/email-imports/poll");
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(null);
    }
  };

  const open = async (id: string) => {
    const { data } = await api.get<Detail>(`/rooms/email-imports/${id}`);
    setDetail(data);
  };

  const retry = async (id: string) => {
    await api.post(`/rooms/email-imports/${id}/retry`);
    await load();
    await open(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted">{sync?.enabled ? `Automatic sync every ${sync.intervalHours} hours.` : "Automatic sync is off."} {sync?.nextAt ? `Next run ${new Date(sync.nextAt).toLocaleString()}.` : ""} {summary ? `Mailbox ${summary.connected ? "connected" : "not connected"}. ${summary.pending} waiting, ${summary.failed} failed.` : ""}</p>
        <div className="flex gap-2">
          <button type="button" disabled={busy !== null || importing} onClick={() => void runImport("sync")} className="h-10 rounded-lg border border-line bg-white px-4 text-sm font-semibold disabled:opacity-50">{busy === "sync" ? "Syncing" : "Sync new emails"}</button>
          <button type="button" disabled={busy !== null || importing} onClick={() => void runImport("backfill")} className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50">{busy === "backfill" || (importing && runs[0]?.trigger === "BACKFILL") ? "Importing history" : "Import historical emails"}</button>
        </div>
      </div>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {runs[0] ? <p className="rounded-lg border border-line bg-white px-3 py-2 text-sm">Latest run {runs[0].trigger.toLowerCase()} is {runs[0].status.toLowerCase().replace(/_/g, " ")}. Scanned {runs[0].scanned}. Nested messages {runs[0].nested ?? 0}. Attachments {runs[0].attachments ?? 0}. Created {runs[0].imported}. Updated {runs[0].updated}. Canceled {runs[0].canceled}. Payments {runs[0].payments ?? 0}. Duplicates {runs[0].duplicates}. Unmatched {runs[0].unmatched}. Failed {runs[0].failed}.</p> : null}
      <div className="grid gap-2 rounded-xl border border-line bg-white p-3 md:grid-cols-6">
        {([
          ["messageId", "Message-ID"],
          ["confirmation", "Confirmation"],
          ["cloudbedsId", "Cloudbeds ID"],
          ["guest", "Guest"],
          ["kind", "Event"],
          ["status", "Status"],
        ] as const).map(([key, label]) => (
          <label key={key} className="text-[10px] font-semibold text-muted">{label}
            <input value={filters[key]} onChange={(event) => setFilters({ ...filters, [key]: event.target.value })} className="mt-1 block h-9 w-full rounded-lg border border-line px-2 text-xs text-ink" />
          </label>
        ))}
        <button type="button" onClick={() => void load().catch((reason) => setError(errorMessage(reason)))} className="h-9 self-end rounded-lg border border-line text-xs font-semibold">Filter</button>
      </div>
      <section className="rounded-xl border border-line bg-white">
        <h2 className="border-b border-line px-3 py-2 text-sm font-bold">Synchronization runs</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted"><tr><th className="px-3 py-2">Started</th><th>Trigger</th><th>Status</th><th>Scanned</th><th>Imported</th><th>Updated</th><th>Canceled</th><th>Duplicates</th><th>Unmatched</th><th>Failed</th></tr></thead>
            <tbody>
              {(runs ?? []).map((run) => <tr key={run.id} className="border-t border-line"><td className="px-3 py-2">{new Date(run.startedAt).toLocaleString()}</td><td>{run.trigger}</td><td>{run.status}</td><td>{run.scanned}</td><td>{run.imported}</td><td>{run.updated}</td><td>{run.canceled}</td><td>{run.duplicates}</td><td>{run.unmatched}</td><td>{run.failed}</td></tr>)}
              {!runs.length ? <tr><td className="px-3 py-3 text-muted" colSpan={10}>No synchronization has run yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-xl border border-line bg-white">
        <h2 className="border-b border-line px-3 py-2 text-sm font-bold">Email attempts</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted"><tr><th className="px-3 py-2">When</th><th>Guest</th><th>Event</th><th>Result</th><th>Confirmation</th><th>Cloudbeds ID</th><th></th></tr></thead>
            <tbody>
              {(rows ?? []).map((row) => <tr key={row.id} className="border-t border-line"><td className="px-3 py-2">{new Date(row.createdAt).toLocaleString()}</td><td>{row.guestName || row.subject || ""}</td><td>{row.noticeKind || ""}</td><td>{row.outcome || row.status}</td><td>{row.confirmationNumber || ""}</td><td>{row.cloudbedsReservationId || ""}</td><td><button type="button" className="font-semibold" onClick={() => void open(row.id)}>Log</button></td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
      {detail ? (
        <section className="rounded-xl border border-line bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold">{detail.subject || detail.messageId}</h2>
              <p className="mt-1 text-xs text-muted">{detail.fromAddress} · {detail.outcome || detail.status} · stay {detail.stayId || "none"}</p>
              {detail.error ? <p className="mt-2 text-xs text-rose-700">{detail.error}</p> : null}
            </div>
            <div className="flex gap-2">
              {detail.status === "FAILED" || detail.status === "SKIPPED" ? <button type="button" className="h-8 rounded-lg border border-line px-3 text-xs font-semibold" onClick={() => void retry(detail.id)}>Retry</button> : null}
              <button type="button" className="h-8 rounded-lg border border-line px-3 text-xs" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
          <ol className="mt-3 space-y-2">
            {(detail.attemptLog?.stages ?? []).map((stage, index) => (
              <li key={`${stage.stage}-${index}`} className="rounded-lg bg-[#f7f5f6] px-3 py-2 text-xs">
                <p className="font-semibold">{index + 1}. {stage.stage} · {stage.status}</p>
                <p className="mt-1 whitespace-pre-wrap text-muted">{stage.detail}</p>
              </li>
            ))}
            {!detail.attemptLog?.stages?.length ? <li className="text-xs text-muted">No stage log was stored for this attempt.</li> : null}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
