import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BellRing,
  ChevronRight,
  Clock3,
  Coffee,
  Flame,
  ShoppingBag,
  Sparkles,
  Utensils,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  PageHeader,
  Panel,
  OrderBadge,
  TableBadge,
  EmptyState,
} from "../components/ui";
import { useOrderStore } from "../stores/orderStore";
import { api } from "../lib/api";
import type { DiningTable } from "../lib/types";
import { money } from "../lib/types";
import { orderLocation } from "../lib/types";
import { useAuthStore } from "../stores/authStore";
import type { EmployeeShift } from "../lib/types";

const timeLabel = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));

export function OverviewPage() {
  const orders = useOrderStore((state) => state.orders);
  const fetchOrders = useOrderStore((state) => state.fetchOrders);
  const user = useAuthStore((state) => state.user)!;
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [shiftCount, setShiftCount] = useState("—");
  useEffect(() => {
    void fetchOrders().catch(() => undefined);
    void api
      .get<DiningTable[]>("/tables")
      .then(({ data }) => setTables(data))
      .catch(() => undefined);
    void api
      .get<EmployeeShift[]>(
        user.role === "ADMIN" ? "/employees/shifts" : "/employees/me/shifts",
      )
      .then(({ data }) => {
        const count =
          user.role === "ADMIN"
            ? data.filter((shift) => !shift.checkedOutAt).length
            : Number(data.some((shift) => !shift.checkedOutAt));
        setShiftCount(String(count));
      })
      .catch(() => undefined);
  }, [fetchOrders, user.role]);
  const todayOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          new Date(order.createdAt).toDateString() ===
          new Date().toDateString(),
      ),
    [orders],
  );
  const revenue = todayOrders
    .filter((order) => order.status !== "CANCELLED")
    .reduce((sum, order) => sum + Number(order.totalAmount), 0);
  const pending = todayOrders.filter((order) =>
    ["PENDING", "PREPARING"].includes(order.status),
  );
  const ready = todayOrders.filter((order) => order.status === "READY");
  const occupied = tables.filter((table) => table.status === "OCCUPIED").length;
  const topRecent = [...todayOrders]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 5);
  const metrics = [
    {
      label: "Today’s revenue",
      value: money(revenue),
      note: `${todayOrders.length} orders today`,
      icon: ShoppingBag,
      tint: "bg-[#eef4e8] text-olive",
      delta: "Service total",
    },
    {
      label: "Orders in progress",
      value: String(pending.length),
      note: `${ready.length} ready to serve`,
      icon: Flame,
      tint: "bg-[#fff2e9] text-[#c66d45]",
      delta: "Live kitchen",
    },
    {
      label: "Tables occupied",
      value: `${occupied} / ${tables.length || "—"}`,
      note: `${Math.max(tables.length - occupied, 0)} available`,
      icon: Utensils,
      tint: "bg-[#eef1fb] text-[#6774a1]",
      delta: "Floor status",
    },
    {
      label: user.role === "ADMIN" ? "Team on shift" : "Your shift",
      value: shiftCount,
      note:
        user.role === "ADMIN"
          ? "Active check-ins"
          : shiftCount === "1"
            ? "You’re checked in"
            : "Check in when you arrive",
      icon: Users,
      tint: "bg-[#f8edf2] text-[#a85e78]",
      delta: "Attendance",
    },
  ];
  return (
    <div className="page-enter">
      <PageHeader
        eyebrow={`${new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date())} service · live operations`}
        title={`Good afternoon, ${user.name.split(" ")[0]}.`}
        description="Here’s the pulse of your restaurant right now."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:gap-4">
        {metrics.map(({ label, value, note, icon: Icon, tint, delta }) => (
          <Panel key={label} className="p-4 sm:p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted">{label}</p>
                <p className="mt-3 font-display text-[27px] font-bold tracking-[-.045em]">
                  {value}
                </p>
              </div>
              <span
                className={`grid h-10 w-10 place-items-center rounded-[14px] ${tint}`}
              >
                <Icon size={18} />
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
              <span className="text-[11px] text-muted">{note}</span>
              <span className="text-[10px] font-semibold text-[#858a80]">
                {delta}
              </span>
            </div>
          </Panel>
        ))}
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_.85fr]">
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6">
            <div>
              <h2 className="font-display text-[15px] font-bold">
                Recent orders
              </h2>
              <p className="mt-1 text-xs text-muted">
                The latest activity from your floor
              </p>
            </div>
            <Link
              to="/orders"
              className="flex items-center gap-1 text-xs font-bold text-olive hover:underline"
            >
              See tracker <ArrowRight size={14} />
            </Link>
          </div>
          {topRecent.length ? (
            <div className="divide-y divide-line">
              {topRecent.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center gap-3 px-5 py-4 sm:px-6"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-canvas text-olive">
                    <Coffee size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold">
                        {orderLocation(order)}
                      </p>
                      <span className="text-[11px] text-muted">
                        · {order.items.length} items ·{" "}
                        {timeLabel(order.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted">
                      {order.items
                        .map(
                          (item) => `${item.quantity}× ${item.menuItem.name}`,
                        )
                        .join(", ")}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <OrderBadge status={order.status} />
                    <span className="text-xs font-bold">
                      {money(order.totalAmount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ShoppingBag}
              title="A fresh start"
              body="Your new orders will show up here as soon as service begins."
            />
          )}
        </Panel>
        <Panel className="p-5 sm:p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display text-[15px] font-bold">
                On the floor
              </h2>
              <p className="mt-1 text-xs text-muted">A quick table pulse</p>
            </div>
            <Link
              to="/tables"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas"
            >
              <ChevronRight size={17} />
            </Link>
          </div>
          {tables.length ? (
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              {tables.slice(0, 6).map((table) => (
                <div
                  key={table.id}
                  className="rounded-xl border border-line p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">
                      Table {table.tableNumber}
                    </span>
                    <span
                      className={`h-2 w-2 rounded-full ${table.status === "AVAILABLE" ? "bg-emerald-500" : table.status === "OCCUPIED" ? "bg-rose-400" : "bg-amber-400"}`}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-muted">
                    <span>{table.capacity} seats</span>
                    <TableBadge status={table.status} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Utensils}
              title="No tables yet"
              body="Add your restaurant tables to see availability here."
            />
          )}
          <div className="mt-5 rounded-2xl bg-[#f6f8f2] p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-olive">
              <Sparkles size={15} /> Shift note
            </div>
            <p className="mt-2 text-xs leading-5 text-[#70796d]">
              A calm kitchen makes a great service. Keep an eye on the ready
              queue during the lunch rush.
            </p>
            <Link
              to="/kitchen"
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-olive"
            >
              Open kitchen <ArrowRight size={13} />
            </Link>
          </div>
        </Panel>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel className="p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-[15px] font-bold">
                Kitchen attention
              </h2>
              <p className="mt-1 text-xs text-muted">
                Live prep and handoff status
              </p>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#fff2e9] text-[#c66d45]">
              <BellRing size={17} />
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {pending.slice(0, 3).map((order) => (
              <div
                key={order.id}
                className="flex items-center gap-3 rounded-xl bg-canvas px-3.5 py-3"
              >
                <span className="text-xs font-bold">
                  {order.table ? `T${order.table.tableNumber}` : order.roomStay?.room ? `R${order.roomStay.room.roomNumber}` : "Room"}
                </span>
                <span className="h-1 w-1 rounded-full bg-[#b4b8ae]" />
                <span className="min-w-0 flex-1 truncate text-xs text-[#73796f]">
                  {order.items
                    .map((line) => `${line.quantity} ${line.menuItem.name}`)
                    .join(" · ")}
                </span>
                <OrderBadge status={order.status} />
              </div>
            ))}
            {!pending.length && (
              <p className="rounded-xl bg-canvas px-4 py-5 text-center text-xs text-muted">
                Kitchen is all caught up.
              </p>
            )}
          </div>
          <Link
            to="/kitchen"
            className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-olive"
          >
            Kitchen display <ArrowRight size={14} />
          </Link>
        </Panel>
        <Panel className="p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-[15px] font-bold">
                Ready for pickup
              </h2>
              <p className="mt-1 text-xs text-muted">
                Orders waiting on the floor team
              </p>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <Clock3 size={17} />
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {ready.slice(0, 3).map((order) => (
              <div
                key={order.id}
                className="flex items-center gap-3 rounded-xl bg-canvas px-3.5 py-3"
              >
                <span className="text-xs font-bold">
                  {orderLocation(order)}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-[#73796f]">
                  {order.items.map((line) => line.menuItem.name).join(", ")}
                </span>
                <span className="text-[10px] font-semibold text-muted">
                  {timeLabel(order.updatedAt)}
                </span>
              </div>
            ))}
            {!ready.length && (
              <p className="rounded-xl bg-canvas px-4 py-5 text-center text-xs text-muted">
                Nothing waiting right now.
              </p>
            )}
          </div>
          <Link
            to="/ready"
            className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-olive"
          >
            Open ready queue <ArrowRight size={14} />
          </Link>
        </Panel>
      </div>
    </div>
  );
}
