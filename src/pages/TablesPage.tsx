import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Armchair, Plus, RefreshCw, Users } from "lucide-react";
import { Field, Modal, PageHeader, Panel, TableBadge } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import type { DiningTable, TableStatus } from "../lib/types";
import { useAuthStore } from "../stores/authStore";
import { useUiStore } from "../stores/uiStore";

export function TablesPage() {
  const navigate = useNavigate();
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [number, setNumber] = useState("");
  const [capacity, setCapacity] = useState("2");
  const [error, setError] = useState("");
  const admin = useAuthStore((state) => state.user?.role === "ADMIN");
  const notify = useUiStore((state) => state.notify);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<DiningTable[]>("/tables");
      setTables(data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const changeStatus = async (table: DiningTable, status: TableStatus) => {
    try {
      const { data } = await api.patch<DiningTable>(
        `/tables/${table.id}/status`,
        { status },
      );
      setTables((current) =>
        current.map((item) => (item.id === table.id ? data : item)),
      );
      notify(`Table ${table.tableNumber} is ${status.toLowerCase()}.`);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await api.post("/tables", {
        tableNumber: Number(number),
        capacity: Number(capacity),
      });
      notify("Table added to the floor.");
      setModal(false);
      setNumber("");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const counts = {
    AVAILABLE: tables.filter((item) => item.status === "AVAILABLE").length,
    OCCUPIED: tables.filter((item) => item.status === "OCCUPIED").length,
    RESERVED: tables.filter((item) => item.status === "RESERVED").length,
  };
  return (
    <div className="page-enter min-h-full w-full">
      <PageHeader
        eyebrow="Front of house · Floor plan"
        title="Your tables"
        description="A clear view of every seat, reservation, and open spot."
        action={
          <div className="flex gap-2">
            {admin && (
              <button
                onClick={() => setModal(true)}
                className="focus-ring inline-flex h-10 items-center gap-2 rounded-xl bg-olive px-4 text-xs font-bold text-white hover:bg-[#334438]"
              >
                <Plus size={15} /> Add table
              </button>
            )}
            <button
              onClick={() => void load()}
              className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white text-muted hover:text-ink"
              aria-label="Refresh tables"
            >
              <RefreshCw size={15} />
            </button>
          </div>
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
      <div className="mb-5 grid grid-cols-3 gap-3">
        {(["AVAILABLE", "OCCUPIED", "RESERVED"] as const).map((status) => (
          <Panel key={status} className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[.12em] text-muted sm:text-xs">
                {status.toLowerCase()}
              </span>
              <span
                className={`h-2 w-2 rounded-full ${status === "AVAILABLE" ? "bg-emerald-500" : status === "OCCUPIED" ? "bg-rose-400" : "bg-amber-400"}`}
              />
            </div>
            <p className="mt-2 font-display text-2xl font-bold">
              {counts[status]}
            </p>
          </Panel>
        ))}
      </div>
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-[20px] bg-white"
            />
          ))}
        </div>
      ) : tables.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {tables.map((table) => (
            <Panel
              key={table.id}
              className={`relative overflow-hidden p-4 transition sm:p-5 ${table.status === "OCCUPIED" ? "border-rose-100" : ""}`}
            >
              <div
                className={`absolute right-0 top-0 h-20 w-20 rounded-bl-full ${table.status === "AVAILABLE" ? "bg-emerald-50" : table.status === "OCCUPIED" ? "bg-rose-50" : "bg-amber-50"}`}
              />
              <div className="relative flex items-start justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-olive shadow-sm">
                  <Armchair size={18} />
                </span>
                <TableBadge status={table.status} />
              </div>
              <p className="relative mt-6 font-display text-xl font-extrabold">
                Table {table.tableNumber}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                <Users size={13} />
                {table.capacity} guests
              </p>
              {table.status !== "OCCUPIED" && (
                <select
                  aria-label={`Set table ${table.tableNumber} status`}
                  value={table.status}
                  onChange={(event) =>
                    void changeStatus(table, event.target.value as TableStatus)
                  }
                  className="focus-ring mt-4 w-full rounded-lg border border-line bg-white px-2.5 py-2 text-[10px] font-semibold text-[#687066] outline-none"
                >
                  <option value="AVAILABLE">Available</option>
                  <option value="RESERVED">Reserved</option>
                  <option value="OCCUPIED">Occupied</option>
                </select>
              )}
              <button
                onClick={() => navigate(`/tables/${table.id}`)}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-olive py-2 text-[10px] font-bold text-white shadow-sm hover:bg-[#334438]"
              >
                {table.status === "OCCUPIED" ? "View table & add items" : "Open table"}
              </button>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          <div className="p-12 text-center">
            <Armchair className="mx-auto text-muted" />
            <p className="mt-3 font-semibold">
              Your floor is ready for a layout
            </p>
            <p className="mt-1 text-sm text-muted">
              Add the first table to start managing availability.
            </p>
          </div>
        </Panel>
      )}
      {modal && (
        <Modal title="Add a table" onClose={() => setModal(false)}>
          <form onSubmit={(event) => void create(event)} className="space-y-4">
            <Field
              label="Table number"
              type="number"
              min="1"
              required
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="e.g. 12"
            />
            <Field
              label="Seat capacity"
              type="number"
              min="1"
              required
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
            <button className="mt-2 h-11 w-full rounded-xl bg-olive text-sm font-bold text-white hover:bg-[#334438]">
              Add to floor
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
