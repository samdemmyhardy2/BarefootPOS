import { useEffect, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { PageHeader, Panel } from "../components/ui";
import { api, errorMessage } from "../lib/api";

type Device = {
  ip: string;
  macAddress: string;
  hostname: string;
  vendor: string;
  manufacturer: string;
  model: string;
  deviceType: string;
  confidence: string;
  protocols: string[];
  openPorts: number[];
  evidence: string[];
};

type SavedPrinter = {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  ipAddress: string;
  macAddress: string;
  port: number;
  paperWidthMm: number;
  isDefault: boolean;
  enabled: boolean;
  purpose: string;
  lastCheckOk: boolean | null;
};

type ScanState = { scanning: boolean; subnet: string; scanned: number; total: number; devices: Device[]; error?: string };

export function PrintersPage() {
  const [scan, setScan] = useState<ScanState>({ scanning: false, subnet: "", scanned: 0, total: 0, devices: [] });
  const [printersOnly, setPrintersOnly] = useState(true);
  const [saved, setSaved] = useState<SavedPrinter[]>([]);
  const [subnet, setSubnet] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadPrinters = async () => {
    const { data } = await api.get<SavedPrinter[]>("/printing/printers");
    setSaved(data);
  };

  useEffect(() => { void loadPrinters().catch((cause) => setError(errorMessage(cause))); }, []);

  useEffect(() => {
    if (!scan.scanning) return undefined;
    const timer = window.setInterval(() => {
      void api.get<ScanState>("/network/discovery/results").then(({ data }) => setScan(data)).catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [scan.scanning]);

  const scanNetwork = async () => {
    setError("");
    setMessage("");
    setScan((current) => ({ ...current, scanning: true, error: undefined }));
    try {
      const { data } = await api.post<ScanState>("/network/discovery/scan", { subnet: subnet.trim() || undefined }, { timeout: 20000 });
      setScan(data);
    } catch (cause) {
      setScan((current) => ({ ...current, scanning: false }));
      setError(errorMessage(cause));
    }
  };

  const saveDevice = async (device: Device) => {
    setBusy(device.ip);
    setError("");
    try {
      await api.post("/printing/printers", {
        name: device.model || device.hostname || `Printer ${device.ip}`,
        manufacturer: device.manufacturer,
        model: device.model,
        ipAddress: device.ip,
        macAddress: device.macAddress,
        port: device.openPorts.includes(9100) ? 9100 : 9100,
        paperWidthMm: 80,
        purpose: "RECEIPT",
        isDefault: saved.length === 0,
      });
      await loadPrinters();
      setMessage(`${device.ip} is saved. Reserve this address on the router with MAC ${device.macAddress || "from the printer's network page"} so it stays after a restart.`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy("");
    }
  };

  const run = async (id: string, path: string, note: string) => {
    setBusy(id + path);
    setError("");
    setMessage("");
    try {
      const { data } = await api.post<{ reachable?: boolean; error?: string | null; note?: string }>(`/printing/printers/${id}/${path}`, {}, { timeout: 25000 });
      setMessage(data.note || note);
      await loadPrinters();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy("");
    }
  };

  const devices = scan.devices.filter((device) => !printersOnly || device.deviceType === "printer");

  return <div className="page-enter">
    <PageHeader title="Printers" description="Scan the local network, save the Epson receipt printer, and print from the orders already stored on the server." action={<button type="button" onClick={() => void scanNetwork()} disabled={scan.scanning} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#ed168c] px-4 text-xs font-bold text-white disabled:opacity-50"><RefreshCw size={14} /> {scan.scanning ? "Scanning…" : "Scan network"}</button>} />
    {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    {message && <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}
    <Panel className="mb-5 p-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-xs font-semibold text-muted">Subnet, if the server should not use its own interface<input value={subnet} onChange={(event) => setSubnet(event.target.value)} placeholder="192.168.1.0/24" className="mt-1 h-10 w-56 rounded-xl border border-line px-3 text-sm outline-none focus:border-[#ed168c]" /></label>
        <p className="text-xs text-muted">{scan.subnet ? `${scan.subnet} · ${scan.scanned}/${scan.total || "—"} checked` : "The scan stays on a private LAN."}</p>
      </div>
      {scan.scanning && <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#fff0f7]"><div className="h-full bg-[#ed168c]" style={{ width: `${scan.total ? Math.min(100, (scan.scanned / scan.total) * 100) : 8}%` }} /></div>}
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm font-bold">{devices.length} {printersOnly ? "printers" : "devices"}</p>
        <button type="button" onClick={() => setPrintersOnly((current) => !current)} className="rounded-full border border-[#f3d5e4] px-3 py-1 text-xs font-bold">{printersOnly ? "Show all devices" : "Printers only"}</button>
      </div>
      <div className="mt-3 divide-y divide-[#f6e8ef]">
        {devices.map((device) => <div key={device.ip} className="flex flex-wrap items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{device.model || device.hostname || device.vendor || "Unknown device"} <span className="font-medium text-muted">{device.ip}</span></p>
            <p className="mt-0.5 text-xs text-muted">{[device.macAddress, device.manufacturer, device.deviceType, device.confidence, device.protocols.join(", ")].filter(Boolean).join(" · ") || "No extra details"}</p>
          </div>
          {device.deviceType === "printer" && <button type="button" disabled={busy === device.ip} onClick={() => void saveDevice(device)} className="h-9 rounded-xl bg-[#ed168c] px-3 text-xs font-bold text-white disabled:opacity-50">Select printer</button>}
        </div>)}
        {!devices.length && <p className="py-6 text-sm text-muted">{scan.scanning ? "Looking for devices…" : "Scan the network to list devices. Printers that do not advertise a model stay listed as candidates."}</p>}
      </div>
    </Panel>
    <Panel className="p-5">
      <div className="mb-3 flex items-center gap-2"><Printer size={16} className="text-[#d90c7d]" /><h2 className="text-sm font-extrabold">Saved printers</h2></div>
      <p className="mb-3 text-xs text-muted">These stay in the database after a restart. A scan that does not find a printer leaves the saved address alone. Reserve the printer MAC in the router so the IP does not change.</p>
      <div className="divide-y divide-[#f6e8ef]">
        {saved.map((printer) => <div key={printer.id} className="flex flex-wrap items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{printer.name} {printer.isDefault && <span className="ml-1 rounded-full bg-[#fff0f7] px-2 py-0.5 text-[10px] font-bold text-[#d90c7d]">Default</span>}</p>
            <p className="mt-0.5 text-xs text-muted">{printer.ipAddress}:{printer.port} · {printer.paperWidthMm}mm · {printer.purpose} · {printer.lastCheckOk === null ? "Not checked" : printer.lastCheckOk ? "Port open" : "Unreachable"}</p>
          </div>
          <button type="button" disabled={Boolean(busy)} onClick={() => void run(printer.id, "test-connection", "Port check finished. No slip was printed.")} className="h-9 rounded-xl border border-[#f3d5e4] px-3 text-xs font-bold">Test connection</button>
          <button type="button" disabled={Boolean(busy)} onClick={() => void run(printer.id, "test-print", "Test slip sent. The printer does not confirm that paper was cut.")} className="h-9 rounded-xl border border-[#f3d5e4] px-3 text-xs font-bold">Test print</button>
          {!printer.isDefault && <button type="button" disabled={Boolean(busy)} onClick={() => void api.patch(`/printing/printers/${printer.id}/default`).then(loadPrinters).catch((cause) => setError(errorMessage(cause)))} className="h-9 rounded-xl border border-[#f3d5e4] px-3 text-xs font-bold">Make default</button>}
          <button type="button" disabled={Boolean(busy)} onClick={() => void api.delete(`/printing/printers/${printer.id}`).then(loadPrinters).catch((cause) => setError(errorMessage(cause)))} className="h-9 rounded-xl px-3 text-xs font-bold text-rose-600">Remove</button>
        </div>)}
        {!saved.length && <p className="py-6 text-sm text-muted">No printer is saved yet.</p>}
      </div>
    </Panel>
  </div>;
}
