import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, CircleDollarSign, LoaderCircle, PieChart, RefreshCw, TrendingUp, BedDouble } from "lucide-react";
import { PageHeader, Panel } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { money } from "../lib/types";

type ChartMode = "pie" | "line" | "bar";
type OverviewData = {
  totalRevenue: number;
  paidOrderCount: number;
  averageOrderValue: number;
  dailyRevenue: { date: string; revenue: number; orderCount: number; occupiedRoomNights: number }[];
  topCategories: { id: string; name: string; quantity: number; revenue: number }[];
  topDishes: { id: string; name: string; categoryName: string; quantity: number; revenue: number }[];
  occupancy: {
    occupiedRooms: number;
    availableRooms: number;
    maintenanceRooms: number;
    totalRooms: number;
    currentOccupancyRate: number;
    occupiedRoomNights: number;
    periodOccupancyRate: number;
  };
};

const todayString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const chartColors = ["#52684f", "#d49368", "#8195a1", "#c47479", "#c4aa61", "#8b78a9", "#65a39a", "#bc8062"];

function DonutChart({ values }: { values: OverviewData["topCategories"] }) {
  const total = values.reduce((sum, item) => sum + item.quantity, 0);
  const circumference = 2 * Math.PI * 72;
  let offset = 0;
  return <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center">
    <svg viewBox="0 0 180 180" className="h-48 w-48 shrink-0 -rotate-90" role="img" aria-label="Category sales distribution">
      <circle cx="90" cy="90" r="72" fill="none" stroke="#edf0e9" strokeWidth="24" />
      {values.map((item, index) => {
        const length = total ? circumference * item.quantity / total : 0;
        const segment = <circle key={item.id} cx="90" cy="90" r="72" fill="none" stroke={chartColors[index % chartColors.length]} strokeWidth="24" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} />;
        offset += length;
        return segment;
      })}
      <text x="90" y="86" textAnchor="middle" className="fill-[#252a24]" fontSize="20" fontWeight="700" transform="rotate(90 90 90)">{total}</text>
      <text x="90" y="106" textAnchor="middle" className="fill-[#858a80]" fontSize="9" transform="rotate(90 90 90)">items sold</text>
    </svg>
    <div className="grid w-full gap-2 sm:max-w-xs">
      {values.map((item, index) => <div key={item.id} className="flex items-center gap-2 text-xs"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} /><span className="min-w-0 flex-1 truncate font-semibold">{item.name}</span><span className="text-muted">{item.quantity}</span></div>)}
      {!values.length && <p className="text-sm text-muted">No paid orders in this date range.</p>}
    </div>
  </div>;
}

function RevenueChart({ values, mode }: { values: OverviewData["dailyRevenue"]; mode: "line" | "bar" }) {
  const width = 760;
  const height = 270;
  const left = 52;
  const right = 14;
  const top = 18;
  const bottom = 42;
  const max = Math.max(...values.map((point) => point.revenue), 1);
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const x = (index: number) => left + (values.length <= 1 ? chartWidth / 2 : chartWidth * index / (values.length - 1));
  const y = (revenue: number) => top + chartHeight * (1 - revenue / max);
  const line = values.map((point, index) => `${index ? "L" : "M"}${x(index)},${y(point.revenue)}`).join(" ");
  const labelIndexes = [...new Set([0, Math.floor((values.length - 1) / 2), values.length - 1])];
  return <div className="w-full overflow-hidden">
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[260px] w-full" role="img" aria-label={mode === "line" ? "Revenue by day line chart" : "Revenue by day vertical bar chart"}>
      {[0, 0.25, 0.5, 0.75, 1].map((fraction) => <g key={fraction}><line x1={left} x2={width - right} y1={top + chartHeight * fraction} y2={top + chartHeight * fraction} stroke="#e9ece5" strokeDasharray="4 5" /><text x={left - 8} y={top + chartHeight * fraction + 4} textAnchor="end" fill="#858a80" fontSize="9">{money(max * (1 - fraction))}</text></g>)}
      {mode === "line" ? <><path d={`${line} L${x(values.length - 1)},${top + chartHeight} L${x(0)},${top + chartHeight} Z`} fill="#52684f" opacity=".10" /><path d={line} fill="none" stroke="#52684f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />{values.map((point, index) => <circle key={point.date} cx={x(index)} cy={y(point.revenue)} r="3.5" fill="#fff" stroke="#52684f" strokeWidth="2" />)}</> : values.map((point, index) => {
        const gap = values.length > 30 ? 2 : 6;
        const barWidth = Math.max(2, Math.min(24, chartWidth / Math.max(values.length, 1) - gap));
        return <rect key={point.date} x={x(index) - barWidth / 2} y={y(point.revenue)} width={barWidth} height={Math.max(0, top + chartHeight - y(point.revenue))} rx="3" fill="#71866b" />;
      })}
      {labelIndexes.map((index) => values[index] && <text key={values[index].date} x={x(index)} y={height - 12} textAnchor={index === 0 ? "start" : index === values.length - 1 ? "end" : "middle"} fill="#858a80" fontSize="10">{new Date(`${values[index].date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</text>)}
    </svg>
  </div>;
}

export function BusinessOverviewPage() {
  const today = todayString();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [report, setReport] = useState<OverviewData | null>(null);
  const [mode, setMode] = useState<ChartMode>("line");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (startDate > endDate) { setError("Start date must be on or before the end date."); return; }
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<OverviewData>("/analytics/overview", {
        params: { startDate, endDate, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" },
      });
      setReport(data);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setLoading(false); }
  }, [startDate, endDate]);

  useEffect(() => { void load(); }, [load]);
  const chartModes = useMemo(() => [
    { id: "pie" as const, label: "Pie chart", icon: PieChart },
    { id: "line" as const, label: "Line chart", icon: TrendingUp },
    { id: "bar" as const, label: "Vertical bars", icon: BarChart3 },
  ], []);
  const metricCards = report ? [
    { label: "Paid revenue", value: money(report.totalRevenue), note: `${report.paidOrderCount} settled orders`, icon: CircleDollarSign },
    { label: "Average order", value: money(report.averageOrderValue), note: "Average settled ticket", icon: TrendingUp },
    { label: "Rooms occupied", value: `${report.occupancy.occupiedRooms} / ${report.occupancy.totalRooms}`, note: `${Math.round(report.occupancy.currentOccupancyRate * 100)}% current occupancy`, icon: BedDouble },
    { label: "Room nights", value: report.occupancy.occupiedRoomNights.toFixed(1), note: `${Math.round(report.occupancy.periodOccupancyRate * 100)}% occupancy in range`, icon: CalendarDays },
  ] : [];

  return <div className="page-enter min-h-full w-full">
    <PageHeader eyebrow="Business performance · Reports" title="Business overview" description="Review settled sales, guest room occupancy, and the most ordered menu items." action={<button onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3.5 text-xs font-bold text-ink disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh</button>} />
    <Panel className="mb-5 p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-xs font-bold">Report date range</p><p className="mt-1 text-[11px] text-muted">Sales are counted when paid in cash or posted to a guest folio.</p></div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-[10px] font-semibold text-muted">Start date<input type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-line bg-white px-3 text-xs text-ink" /></label>
          <label className="text-[10px] font-semibold text-muted">End date<input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-line bg-white px-3 text-xs text-ink" /></label>
          <button onClick={() => void load()} disabled={loading} className="h-10 rounded-lg bg-olive px-4 text-xs font-bold text-white disabled:opacity-50">Apply dates</button>
        </div>
      </div>
    </Panel>
    {error && <div role="alert" className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    {loading && !report ? <Panel className="grid min-h-48 place-items-center"><LoaderCircle className="animate-spin text-olive" /></Panel> : report && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metricCards.map(({ label, value, note, icon: Icon }) => <Panel key={label} className="p-4 sm:p-5"><div className="flex items-start justify-between"><div><p className="text-xs text-muted">{label}</p><p className="mt-3 font-display text-2xl font-extrabold tracking-tight">{value}</p></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf2e9] text-olive"><Icon size={18} /></span></div><p className="mt-4 border-t border-line pt-3 text-[11px] text-muted">{note}</p></Panel>)}</div>
      <Panel className="mt-5 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><h2 className="font-display text-[15px] font-bold">Sales & consumption</h2><p className="mt-1 text-xs text-muted">Switch the chart view for this report period.</p></div><div className="flex gap-1 rounded-xl bg-canvas p-1">{chartModes.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setMode(id)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-bold transition ${mode === id ? "bg-white text-olive shadow-sm" : "text-muted hover:text-ink"}`}><Icon size={13} />{label}</button>)}</div></div>
        <div className="p-4 sm:p-6">{mode === "pie" ? <DonutChart values={report.topCategories} /> : <RevenueChart values={report.dailyRevenue} mode={mode} />}</div>
      </Panel>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel className="overflow-hidden"><div className="border-b border-line px-5 py-4"><h2 className="font-display text-[15px] font-bold">Most consumed categories</h2><p className="mt-1 text-xs text-muted">Ranked by quantity sold</p></div><div className="divide-y divide-line">{report.topCategories.length ? report.topCategories.map((item, index) => <div key={item.id} className="flex items-center gap-3 px-5 py-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold" style={{ color: chartColors[index % chartColors.length], backgroundColor: `${chartColors[index % chartColors.length]}18` }}>{index + 1}</span><span className="min-w-0 flex-1 truncate text-xs font-bold">{item.name}</span><span className="text-[10px] text-muted">{item.quantity} sold</span><span className="w-20 text-right text-xs font-bold">{money(item.revenue)}</span></div>) : <p className="p-6 text-center text-xs text-muted">No settled sales in this date range.</p>}</div></Panel>
        <Panel className="overflow-hidden"><div className="border-b border-line px-5 py-4"><h2 className="font-display text-[15px] font-bold">Most consumed dishes</h2><p className="mt-1 text-xs text-muted">Best sellers across all categories</p></div><div className="divide-y divide-line">{report.topDishes.length ? report.topDishes.map((item, index) => <div key={item.id} className="flex items-center gap-3 px-5 py-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-canvas text-xs font-bold text-muted">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{item.name}</p><p className="mt-0.5 text-[10px] text-muted">{item.categoryName}</p></div><span className="text-[10px] text-muted">{item.quantity} sold</span><span className="w-20 text-right text-xs font-bold">{money(item.revenue)}</span></div>) : <p className="p-6 text-center text-xs text-muted">No settled sales in this date range.</p>}</div></Panel>
      </div>
      <Panel className="mt-5 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-[15px] font-bold">Room occupancy summary</h2><p className="mt-1 text-xs text-muted">Current room status and occupancy across the selected dates</p></div><span className="rounded-full bg-[#edf2e9] px-3 py-1.5 text-xs font-bold text-olive">{Math.round(report.occupancy.periodOccupancyRate * 100)}% period occupancy</span></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-xl bg-canvas p-3"><p className="text-[10px] text-muted">Occupied</p><p className="mt-1 text-lg font-extrabold">{report.occupancy.occupiedRooms}</p></div><div className="rounded-xl bg-canvas p-3"><p className="text-[10px] text-muted">Available</p><p className="mt-1 text-lg font-extrabold">{report.occupancy.availableRooms}</p></div><div className="rounded-xl bg-canvas p-3"><p className="text-[10px] text-muted">Maintenance</p><p className="mt-1 text-lg font-extrabold">{report.occupancy.maintenanceRooms}</p></div><div className="rounded-xl bg-canvas p-3"><p className="text-[10px] text-muted">Occupied room nights</p><p className="mt-1 text-lg font-extrabold">{report.occupancy.occupiedRoomNights.toFixed(1)}</p></div></div></Panel>
    </>}
  </div>;
}
