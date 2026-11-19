"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";

type Kind = "water" | "compressed-air";
type Reading = { id: number; timestamp: string; flowRate: number; totalVolume: number; pressureBar: number | null; temperatureC: number | null; powerKw: number | null };
type Meter = { id: number; deviceCode: string; name: string; location: string; enabled: boolean; lowPressureBar: number | null; highFlowRate: number | null; status: string; warnings: string[]; mqttTopic: string; latest: Reading | null };
type History = { truncated: boolean; readings: Reading[] };
const emptyForm = { deviceCode: "", name: "", location: "", enabled: true, lowPressureBar: "", highFlowRate: "" };
const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white";
const panel = "rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900";
const button = "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50";
const number = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);
const time = (value: string) => new Date(value).toLocaleString("id-ID");

export default function UtilityMonitoringPage({ kind }: { kind: Kind }) {
  const air = kind === "compressed-air";
  const title = air ? "Compressed Air" : "Water Monitoring";
  const volumeUnit = air ? "Nm³" : "m³";
  const flowUnit = `${volumeUnit}/h`;
  const base = `/api/utilities/${kind}`;
  const [meters, setMeters] = useState<Meter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [hours, setHours] = useState("24");
  const [history, setHistory] = useState<History | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [updated, setUpdated] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await apiGet<Meter[]>(`${base}/devices`);
      setMeters(rows); setUpdated(new Date().toISOString()); setError("");
      setSelected(current => rows.some(m => m.id === current) ? current : rows[0]?.id ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load meters."); }
    finally { setLoading(false); }
  }, [base]);
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 30000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => {
    if (selected == null) return;
    let active = true;
    async function load() {
      try {
        const end = new Date(); const start = new Date(end.getTime() - Number(hours) * 3600000);
        const data = await apiGet<History>(`${base}/devices/${selected}/history?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`);
        if (active) { setHistory(data); setHistoryError(""); }
      } catch (e) { if (active) setHistoryError(e instanceof Error ? e.message : "Unable to load history."); }
    }
    setHistory(null); void load(); const timer = setInterval(() => void load(), 30000);
    return () => { active = false; clearInterval(timer); };
  }, [base, selected, hours]);

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const body = { ...form, lowPressureBar: form.lowPressureBar === "" ? null : Number(form.lowPressureBar), highFlowRate: form.highFlowRate === "" ? null : Number(form.highFlowRate) };
    try {
      if (editing != null) await apiPut(`${base}/devices/${editing}`, body); else await apiPost(`${base}/devices`, body);
      setShowForm(false); setForm(emptyForm); setEditing(null); setNotice("Meter saved."); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save meter."); } finally { setBusy(false); }
  }
  async function remove() {
    if (deleteId == null) return; setBusy(true); setError("");
    try { await apiDelete(`${base}/devices/${deleteId}`); setDeleteId(null); setNotice("Meter deleted."); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to delete meter."); } finally { setBusy(false); }
  }
  const live = meters.filter(m => m.status !== "offline");
  const withReading = meters.filter(m => m.latest != null);
  const totalFlow = live.reduce((sum, m) => sum + (m.latest?.flowRate ?? 0), 0);
  const powerMeters = live.filter(m => m.latest?.powerKw != null);
  const selectedMeter = meters.find(m => m.id === selected);
  const readings = history?.readings ?? [];

  return <div className="space-y-5 text-slate-900 dark:text-white">
    <header data-utility-header>
      <div><p data-utility-eyebrow>Utility Monitoring System</p>
        <h1 className="mt-1 text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{air ? "Pantau aliran udara, tekanan, dan daya kompresor." : "Pantau debit air, total pemakaian, dan tekanan jaringan."}</p>
      </div>
      <div className="flex gap-2"><button type="button" onClick={() => void refresh()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Refresh</button>
        <button type="button" className={button} onClick={() => { setEditing(null); setForm(emptyForm); setShowForm(true); }}>+ Add meter</button></div>
    </header>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["Meters online", loading ? "…" : `${live.length} / ${meters.length}`, "Offline setelah 120 detik tanpa data"],
        ["Live flow", loading || live.length === 0 ? "—" : `${number(totalFlow)} ${flowUnit}`, "Hanya meter online; jangan jumlahkan meter seri"],
        ["Totalizer meters", loading ? "…" : `${withReading.length} / ${meters.length}`, "Total kumulatif tersedia di tiap meter"],
        [air ? "Compressor power" : "Active warnings", air ? (powerMeters.length ? `${number(powerMeters.reduce((s, m) => s + (m.latest?.powerKw ?? 0), 0))} kW` : "—") : String(meters.filter(m => m.status === "warning").length), air ? `${powerMeters.length} meter online dengan data daya` : "Berdasarkan batas flow dan tekanan"],
      ].map(([label, value, note]) => <section key={label} data-utility-summary className={panel}><p className="text-sm text-slate-500">{label}</p><p className="my-3 text-2xl font-semibold">{value}</p><p className="text-xs text-slate-500">{note}</p></section>)}
    </div>

    {showForm && <form onSubmit={save} className={panel}>
      <h2 className="mb-4 text-lg font-bold">{editing == null ? "Add meter" : "Edit meter"}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1 text-sm">Device code<input required maxLength={50} pattern="[A-Za-z0-9_-]+" placeholder={air ? "AIR-01" : "WM-01"} className={input} value={form.deviceCode} onChange={e => setForm({ ...form, deviceCode: e.target.value })} /></label>
        <label className="space-y-1 text-sm">Name<input required maxLength={150} className={input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label className="space-y-1 text-sm">Location<input maxLength={150} className={input} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></label>
        <label className="space-y-1 text-sm">Low pressure alarm (bar)<input type="number" min="0" max="1000000" step="any" placeholder="Optional" className={input} value={form.lowPressureBar} onChange={e => setForm({ ...form, lowPressureBar: e.target.value })} /></label>
        <label className="space-y-1 text-sm">High flow alarm ({flowUnit})<input type="number" min="0" max="1000000000" step="any" placeholder="Optional" className={input} value={form.highFlowRate} onChange={e => setForm({ ...form, highFlowRate: e.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />Enabled</label>
      </div>
      <div className="mt-4 flex gap-3"><button disabled={busy} className={button}>{busy ? "Saving…" : "Save meter"}</button><button type="button" disabled={busy} onClick={() => setShowForm(false)} className="px-3 text-sm">Cancel</button></div>
    </form>}

    {deleteId != null && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900"><p>Hapus {meters.find(m => m.id === deleteId)?.deviceCode} beserta seluruh riwayatnya?</p><div className="mt-3 flex gap-3"><button type="button" disabled={busy} onClick={() => void remove()} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white">Delete permanently</button><button type="button" disabled={busy} onClick={() => setDeleteId(null)}>Cancel</button></div></div>}

    {loading ? <p role="status">Loading meters…</p> : meters.length === 0 ? <section className={`${panel} py-12 text-center`}><h2 className="text-lg font-bold">Belum ada {air ? "air meter" : "water meter"}</h2><p className="mt-2 text-sm text-slate-500">Tambahkan meter pertama untuk mulai memantau. Pembacaan muncul setelah telemetry diterima.</p></section> :
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{meters.map(m => <section key={m.id} className={`${panel} ${selected === m.id ? "ring-2 ring-blue-400" : ""}`}>
        <div className="flex justify-between gap-2"><div><p className="text-xs font-bold text-blue-600">{m.deviceCode}</p><h2 className="mt-1 font-bold">{m.name}</h2><p className="text-xs text-slate-500">{m.location || "No location"}</p></div>
          <span className={`h-fit rounded-full px-2 py-1 text-xs font-semibold ${m.status === "online" ? "bg-emerald-100 text-emerald-800" : m.status === "warning" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{!m.enabled ? "disabled" : m.status}</span></div>
        <p className="mt-5 text-3xl font-bold">{number(m.latest?.flowRate)} <span className="text-sm font-normal text-slate-500">{flowUnit}</span></p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">{[["Totalizer", `${number(m.latest?.totalVolume)} ${volumeUnit}`], ["Pressure", `${number(m.latest?.pressureBar)} bar`], ["Temperature", `${number(m.latest?.temperatureC)} °C`], ...(air ? [["Power", `${number(m.latest?.powerKw)} kW`]] : [])].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl>
        {m.warnings.length > 0 && <p className="mt-3 rounded bg-amber-50 p-2 text-sm text-amber-800">{m.warnings.join(" · ")}</p>}
        <p className="mt-4 text-xs text-slate-500">{m.latest ? `Last reading: ${time(m.latest.timestamp)}${m.status === "offline" ? " · stale" : ""}` : "Waiting for telemetry"}</p>
        <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-sm"><button type="button" className="font-semibold text-blue-600" onClick={() => setSelected(m.id)}>View history</button><button type="button" onClick={() => { setEditing(m.id); setForm({ deviceCode: m.deviceCode, name: m.name, location: m.location, enabled: m.enabled, lowPressureBar: m.lowPressureBar == null ? "" : String(m.lowPressureBar), highFlowRate: m.highFlowRate == null ? "" : String(m.highFlowRate) }); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button><button type="button" className="text-red-600" onClick={() => setDeleteId(m.id)}>Delete</button></div>
      </section>)}</div>}

    {selectedMeter && <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">History · {selectedMeter.deviceCode}</h2><label className="flex items-center gap-2 text-sm">Period<select className={input} value={hours} onChange={e => setHours(e.target.value)}><option value="6">6 hours</option><option value="24">24 hours</option><option value="168">7 days</option></select></label></div>
      {historyError ? <p role="alert" className="mt-4 text-red-600">{historyError}</p> : history == null ? <p className="mt-4" role="status">Loading history…</p> : readings.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">Tidak ada pembacaan pada periode ini.</p> : <>
        <FlowChart readings={readings} unit={flowUnit} />
        {history.truncated && <p className="mb-3 text-sm text-amber-700">Menampilkan 2.000 pembacaan terbaru. Pilih periode lebih pendek untuk detail lengkap.</p>}
        <div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><caption className="mb-2 text-left text-xs text-slate-500">Pembacaan terbaru · waktu lokal browser</caption><thead className="sticky top-0 bg-slate-50 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"><tr>{["Timestamp", `Flow (${flowUnit})`, `Total (${volumeUnit})`, "Pressure (bar)", "Temp (°C)", ...(air ? ["Power (kW)"] : [])].map(x => <th key={x} className="whitespace-nowrap p-3">{x}</th>)}</tr></thead><tbody>{[...readings].reverse().slice(0, 100).map(r => <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800"><td className="whitespace-nowrap p-3">{time(r.timestamp)}</td>{[r.flowRate, r.totalVolume, r.pressureBar, r.temperatureC, ...(air ? [r.powerKw] : [])].map((v, i) => <td key={i} className="p-3">{number(v)}</td>)}</tr>)}</tbody></table></div>
      </>}
      <p className="mt-4 break-all rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800">MQTT topic: <code>{selectedMeter.mqttTopic}</code></p>
      {air && <p className="mt-2 text-xs text-slate-500">Nm³ adalah volume pada kondisi referensi normal. Pastikan gateway dan flow meter menggunakan kondisi referensi yang sama.</p>}
    </section>}
    <p className="text-xs text-slate-500">Auto-refresh 30 detik{updated ? ` · Updated ${time(updated)}` : ""}. Batas alarm dikonfigurasi per meter; alarm flow tinggi merupakan indikasi yang perlu diperiksa.</p>
  </div>;
}

function FlowChart({ readings, unit }: { readings: Reading[]; unit: string }) {
  const gradientId = useId().replace(/:/g, "");
  const max = Math.max(1, ...readings.map(r => r.flowRate));
  const from = new Date(readings[0].timestamp).getTime();
  const span = Math.max(1, new Date(readings[readings.length - 1].timestamp).getTime() - from);
  const points = readings.map(r => `${50 + (new Date(r.timestamp).getTime() - from) / span * 900},${170 - r.flowRate / max * 140}`).join(" ");
  return <figure className="my-5">
    <figcaption className="text-xs text-slate-500">Flow trend ({unit}) · {time(readings[0].timestamp)} — {time(readings[readings.length - 1].timestamp)}</figcaption>
    <div className="mt-3 overflow-x-auto"><svg role="img" aria-label={`Flow trend, ${readings.length} readings, maximum ${number(max)} ${unit}`} viewBox="0 0 980 220" className="min-w-[480px] w-full">
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#465fff" stopOpacity="0.18" /><stop offset="100%" stopColor="#465fff" stopOpacity="0.015" /></linearGradient></defs>
      {[0, 1, 2, 3, 4].map(i => <g key={i}><line x1="50" x2="950" y1={170 - i * 35} y2={170 - i * 35} stroke="#edf0f5" strokeDasharray="3 5" /><text x="40" y={174 - i * 35} textAnchor="end" fontSize="11" fill="#687b95">{number(max * i / 4)}</text></g>)}
      {readings.length > 1 && <polygon points={`50,170 ${points} 950,170`} fill={`url(#${gradientId})`} />}
      <polyline points={points} fill="none" stroke="#465fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {readings.length === 1 && <circle cx="50" cy={170 - readings[0].flowRate / max * 140} r="4" fill="#465fff" />}
      <text x="50" y="200" fontSize="11" fill="#687b95">{new Date(readings[0].timestamp).toLocaleTimeString()}</text>
      <text x="950" y="200" textAnchor="end" fontSize="11" fill="#687b95">{new Date(readings[readings.length - 1].timestamp).toLocaleTimeString()}</text>
    </svg></div>
  </figure>;
}
