import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  Clock3,
  RefreshCw,
  Timer,
  Users,
} from "lucide-react";
import { PageHeader, Panel } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import type { Employee, EmployeeShift } from "../lib/types";
import { useAuthStore } from "../stores/authStore";
import { useUiStore } from "../stores/uiStore";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
const formatTime = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
function duration(start: string, end?: string | null, breaks: EmployeeShift["breaks"] = []) {
  const finish = end ? +new Date(end) : Date.now();
  const total = Math.max(0, finish - +new Date(start));
  const breakMs = (breaks ?? []).reduce((sum, item) => {
    const breakEnd = item.endedAt ? +new Date(item.endedAt) : finish;
    return sum + Math.max(0, Math.min(finish, breakEnd) - Math.max(+new Date(start), +new Date(item.startedAt)));
  }, 0);
  const minutes = Math.max(0, Math.floor((total - breakMs) / 60000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
function breakDuration(breaks: EmployeeShift["breaks"] = []) {
  const minutes = (breaks ?? []).reduce((sum, item) => sum + Math.max(0, Math.floor(((item.endedAt ? +new Date(item.endedAt) : Date.now()) - +new Date(item.startedAt)) / 60000)), 0);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function AttendancePage() {
  const user = useAuthStore((state) => state.user)!;
  const admin = user.role === "ADMIN";
  const [shifts, setShifts] = useState<EmployeeShift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const notify = useUiStore((state) => state.notify);
  const load = useCallback(async () => {
    try {
      const endpoint = admin ? "/employees/shifts" : "/employees/me/shifts";
      const [{ data }, staff] = await Promise.all([
        api.get<EmployeeShift[]>(endpoint),
        admin
          ? api.get<Employee[]>("/employees")
          : Promise.resolve({ data: [] as Employee[] }),
      ]);
      setShifts(data);
      setEmployees(staff.data);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [admin]);
  useEffect(() => {
    void load();
  }, [load]);
  const myOpenShift = shifts.find(
    (shift) => shift.employeeId === user.id && !shift.checkedOutAt,
  );
  const activeBreak = myOpenShift?.breaks?.find((item) => !item.endedAt);
  const check = async (action: "check-in" | "check-out") => {
    setBusy(true);
    setError("");
    try {
      await api.post(`/employees/me/${action}`);
      notify(
        action === "check-in"
          ? "You are checked in. Have a great shift."
          : "You are checked out. Thanks for today.",
      );
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const toggleBreak = async () => {
    setBusy(true); setError("");
    try {
      await api.post(`/employees/me/break/${activeBreak ? "end" : "start"}`);
      notify(activeBreak ? "Short break ended." : "Short break started.");
      await load();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const filtered = useMemo(
    () =>
      shifts.filter(
        (shift) =>
          filter === "all" ||
          (filter === "active"
            ? !shift.checkedOutAt
            : Boolean(shift.checkedOutAt)),
      ),
    [shifts, filter],
  );
  const currentDuration = myOpenShift ? duration(myOpenShift.checkedInAt, null, myOpenShift.breaks) : "—";
  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Your shift · Time & attendance"
        title={admin ? "Attendance" : "Your shift"}
        description={
          admin
            ? "A clear record of arrivals, departures, and hours on the floor."
            : "Keep your shift record up to date with a quick check-in or check-out."
        }
        action={
          <button
            onClick={() => void load()}
            className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white text-muted hover:text-ink"
            aria-label="Refresh attendance"
          >
            <RefreshCw size={15} />
          </button>
        }
      />
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      <div className="mb-5 grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
        <Panel className="overflow-hidden bg-canvas p-5 text-ink sm:p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-muted">
                {myOpenShift ? "Your shift is in progress" : "Your time today"}
              </p>
              <p className="mt-3 font-display text-3xl font-bold tracking-tight">
                {myOpenShift ? currentDuration : "Ready when you are"}
              </p>
              <p className="mt-2 text-xs text-muted">
                {myOpenShift
                  ? `Checked in at ${formatTime(myOpenShift.checkedInAt)}`
                  : "Start recording your hours when you arrive."}
              </p>
            </div>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-olive-soft text-olive">
              <Timer size={19} />
            </span>
          </div>
          <button
            disabled={busy}
            onClick={() => void check(myOpenShift ? "check-out" : "check-in")}
            className={`mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-bold transition disabled:opacity-50 sm:w-auto sm:px-5 ${myOpenShift ? "bg-white text-olive hover:bg-[#eef3e9]" : "bg-citrus text-olive hover:bg-[#cce790]"}`}
          >
            {myOpenShift ? (
              <>
                <ArrowUpFromLine size={15} />
                {busy ? "Checking out…" : "Check out"}
              </>
            ) : (
              <>
                <ArrowDownToLine size={15} />
                {busy ? "Checking in…" : "Check in"}
              </>
            )}
          </button>
          {myOpenShift && <button disabled={busy} onClick={() => void toggleBreak()} className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-line bg-white text-xs font-bold text-olive disabled:opacity-50 sm:ml-2 sm:mt-6 sm:w-auto sm:px-4">
            <Timer size={14} /> {busy ? "Please wait…" : activeBreak ? "End short break" : "Start short break"}
          </button>}
          {activeBreak && <p className="mt-2 text-xs font-semibold text-amber-700">Short break in progress · started {formatTime(activeBreak.startedAt)}</p>}
        </Panel>
        <Panel className="grid grid-cols-2 divide-x divide-line p-5 sm:p-6">
          <div className="pr-4">
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <CalendarDays size={14} />
              This week
            </div>
            <p className="mt-3 font-display text-2xl font-bold">
              {
                shifts.filter((shift) => {
                  const d = new Date(shift.checkedInAt);
                  const now = new Date();
                  return (
                    d >=
                    new Date(
                      now.getFullYear(),
                      now.getMonth(),
                      now.getDate() - 7,
                    )
                  );
                }).length
              }
            </p>
            <p className="mt-1 text-[10px] text-muted">recorded shifts</p>
          </div>
          <div className="pl-4">
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <Clock3 size={14} />
              {admin ? "Team members" : "Shift history"}
            </div>
            <p className="mt-3 font-display text-2xl font-bold">
              {admin ? employees.length : shifts.length}
            </p>
            <p className="mt-1 text-[10px] text-muted">
              {admin ? "on your roster" : "total entries"}
            </p>
          </div>
        </Panel>
      </div>
      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4 sm:px-5">
          <div>
            <h2 className="font-display text-sm font-bold">
              {admin ? "Team time log" : "Your recent shifts"}
            </h2>
            <p className="mt-1 text-[11px] text-muted">
              Every check-in and check-out, in one place.
            </p>
          </div>
          <div className="flex gap-1 rounded-lg bg-canvas p-1">
            {[
              ["all", "All"],
              ["active", "On shift"],
              ["complete", "Completed"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold ${filter === value ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {filtered.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead>
                <tr className="border-b border-line text-[10px] font-bold uppercase tracking-[.1em] text-muted">
                  <th className="px-5 py-3">
                    {admin ? "Team member" : "Shift"}
                  </th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Check in</th>
                  <th className="px-5 py-3">Check out</th>
                  <th className="px-5 py-3">Hours</th>
                  <th className="px-5 py-3">Breaks</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((shift) => (
                  <tr
                    key={shift.id}
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-5 py-3.5">
                      {admin ? (
                        <>
                          <p className="text-xs font-bold">
                            {shift.employee?.name ??
                              employees.find(
                                (person) => person.id === shift.employeeId,
                              )?.name ??
                              "Employee"}
                          </p>
                          <p className="mt-1 text-[10px] text-muted">
                            {shift.employee?.email ?? ""}
                          </p>
                        </>
                      ) : (
                        <span className="text-xs font-semibold">Shift</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-[#697066]">
                      {formatDate(shift.checkedInAt)}
                    </td>
                    <td className="px-5 py-3.5 text-xs font-semibold">
                      {formatTime(shift.checkedInAt)}
                    </td>
                    <td className="px-5 py-3.5 text-xs font-semibold">
                      {shift.checkedOutAt
                        ? formatTime(shift.checkedOutAt)
                        : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-xs font-semibold">
                      {duration(shift.checkedInAt, shift.checkedOutAt, shift.breaks)}
                    </td>
                    <td className="px-5 py-3.5 text-xs font-semibold">
                      {shift.breaks?.length ? <span title={shift.breaks.map((item) => `${formatTime(item.startedAt)}–${item.endedAt ? formatTime(item.endedAt) : "In progress"}`).join(", ")}>{breakDuration(shift.breaks)}</span> : "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${shift.checkedOutAt ? "bg-stone-100 text-stone-600" : "bg-emerald-50 text-emerald-700"}`}
                      >
                        {shift.checkedOutAt ? "Complete" : "On shift"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <Users className="mx-auto text-muted" />
            <p className="mt-3 text-sm font-semibold">No shifts recorded yet</p>
            <p className="mt-1 text-xs text-muted">
              Your attendance will appear here after check-in.
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}
