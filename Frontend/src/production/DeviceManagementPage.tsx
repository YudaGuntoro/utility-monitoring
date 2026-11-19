"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { ConfirmModal, Modal } from "@/components/ui/modal";
import { useToast } from "@/context/ToastContext";
import { PencilIcon, PlusIcon, TrashBinIcon } from "@/icons";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { topicForDevice, type PowerDevice } from "./powerMonitoring";

type Category = "power" | "water" | "compressed-air";
type UtilityMeter = {
  id: number; deviceCode: string; name: string; location: string; enabled: boolean;
  lowPressureBar: number | null; highFlowRate: number | null; mqttTopic: string;
  status: string; latest: { timestamp: string } | null;
};
type Device = {
  id: number; category: Category; code: string; name: string; location: string;
  model: string; gateway: string; topic: string; status: string; enabled: boolean;
  lastSeen: string | null; lowPressure: number | null; highFlow: number | null;
};
type DeviceForm = {
  category: Category; code: string; name: string; location: string; model: string;
  gateway: string; topic: string; enabled: boolean; lowPressure: string; highFlow: string;
};
const categoryNames: Record<Category, string> = { power: "Power", water: "Water", "compressed-air": "Compressor" };
const emptyForm: DeviceForm = { category: "power", code: "", name: "", location: "", model: "Schneider PM8000 / PM8240", gateway: "GW-01", topic: "", enabled: true, lowPressure: "", highFlow: "" };
const inputClass = "mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/10";

function utilityDevice(meter: UtilityMeter, category: "water" | "compressed-air"): Device {
  return { id: meter.id, category, code: meter.deviceCode, name: meter.name, location: meter.location ?? "", model: "", gateway: "", topic: meter.mqttTopic, status: meter.status, enabled: meter.enabled, lastSeen: meter.latest?.timestamp ?? null, lowPressure: meter.lowPressureBar, highFlow: meter.highFlowRate };
}
function powerDevice(device: PowerDevice): Device {
  return { id: device.id, category: "power", code: device.device_code, name: device.name, location: device.location ?? "", model: device.model, gateway: device.gateway_id ?? "", topic: device.mqtt_topic, status: device.status, enabled: device.enabled, lastSeen: device.last_seen ?? null, lowPressure: null, highFlow: null };
}

export default function DeviceManagementPage() {
  const toast = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [editing, setEditing] = useState<Device | null>(null);
  const [deviceToDelete, setDeviceToDelete] = useState<Device | null>(null);
  const [form, setForm] = useState<DeviceForm>(emptyForm);
  const [filter, setFilter] = useState<Category | "all">("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [power, water, air] = await Promise.all([
        apiGet<PowerDevice[]>("/api/power/devices"),
        apiGet<UtilityMeter[]>("/api/utilities/water/devices"),
        apiGet<UtilityMeter[]>("/api/utilities/compressed-air/devices"),
      ]);
      setDevices([...power.map(powerDevice), ...water.map((meter) => utilityDevice(meter, "water")), ...air.map((meter) => utilityDevice(meter, "compressed-air"))]);
      setLoadError("");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load devices.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function updateCode(value: string) {
    const code = value.toUpperCase();
    setForm((current) => ({ ...current, code, topic: current.category === "power" && (!current.topic || current.topic === topicForDevice(current.code)) ? (code ? topicForDevice(code) : "") : current.topic }));
  }
  function create() { setEditing(null); setForm(emptyForm); setIsFormOpen(true); }
  function edit(device: Device) {
    setEditing(device);
    setForm({ category: device.category, code: device.code, name: device.name, location: device.location, model: device.model, gateway: device.gateway, topic: device.topic, enabled: device.enabled, lowPressure: device.lowPressure?.toString() ?? "", highFlow: device.highFlow?.toString() ?? "" });
    setIsFormOpen(true);
  }
  function reset() { if (!saving) { setEditing(null); setForm(emptyForm); setIsFormOpen(false); } }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const code = form.code.trim().toUpperCase();
    if (!code || !form.name.trim()) { toast.error({ message: "Device code and name are required." }); return; }
    setSaving(true);
    try {
      if (form.category === "power") {
        const payload = { device_code: code, name: form.name.trim(), model: form.model.trim() || "Schneider PM8000 / PM8240", location: form.location.trim(), gateway_id: form.gateway.trim(), mqtt_topic: form.topic.trim() || topicForDevice(code), enabled: form.enabled };
        if (editing) await apiPut(`/api/power/devices/${editing.id}`, payload); else await apiPost("/api/power/devices", payload);
      } else {
        const payload = { deviceCode: code, name: form.name.trim(), location: form.location.trim(), enabled: form.enabled, lowPressureBar: form.lowPressure === "" ? null : Number(form.lowPressure), highFlowRate: form.highFlow === "" ? null : Number(form.highFlow) };
        const base = `/api/utilities/${form.category}/devices`;
        if (editing) await apiPut(`${base}/${editing.id}`, payload); else await apiPost(base, payload);
      }
      toast.success({ message: editing ? "Device updated." : "Device created." });
      setIsFormOpen(false); setEditing(null); setForm(emptyForm);
      await load();
    } catch (err) { toast.error({ message: err instanceof Error ? err.message : "Failed to save device." }); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!deviceToDelete) return;
    setDeleting(true);
    try {
      const base = deviceToDelete.category === "power" ? "/api/power/devices" : `/api/utilities/${deviceToDelete.category}/devices`;
      await apiDelete(`${base}/${deviceToDelete.id}`);
      toast.success({ message: "Device deleted." }); setDeviceToDelete(null); await load();
    } catch (err) { toast.error({ message: err instanceof Error ? err.message : "Failed to delete device." }); }
    finally { setDeleting(false); }
  }
  const visible = filter === "all" ? devices : devices.filter((device) => device.category === filter);

  return <div className="content-light-surface space-y-6 text-slate-900">
    <PageBreadcrumb pageTitle="Devices" />
    <div className="flex flex-wrap items-end justify-between gap-4">
      <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Category
        <select aria-label="Filter by category" className={`${inputClass} block min-w-44`} value={filter} onChange={(event) => setFilter(event.target.value as Category | "all")}>
          <option value="all">All categories</option><option value="power">Power</option><option value="water">Water</option><option value="compressed-air">Compressor</option>
        </select>
      </label>
      <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 text-sm font-bold text-white transition hover:bg-brand-600" onClick={create} type="button"><PlusIcon className="size-4 fill-current" />Add Device</button>
    </div>
    {loadError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">Unable to load all device categories: {loadError} <button type="button" onClick={() => void load()} className="ml-2 font-bold underline">Retry</button></div>}
    <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-200/60">
      <table className="w-full min-w-[1200px] text-left text-sm">
        <thead className="bg-brand-500 text-xs uppercase text-white"><tr>{["Device Code", "Category", "Name", "Model", "Location", "Gateway", "MQTT Topic", "Status", "Last Seen", "Actions"].map((header) => <th className="px-4 py-3" key={header}>{header}</th>)}</tr></thead>
        <tbody>{visible.map((device) => <tr className="border-t border-slate-100 text-slate-700 transition-colors hover:bg-slate-50" key={`${device.category}-${device.id}`}>
          <td className="px-4 py-3 font-black text-slate-950">{device.code}</td>
          <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{categoryNames[device.category]}</span></td>
          <td className="px-4 py-3">{device.name}</td><td className="px-4 py-3">{device.model || "–"}</td><td className="px-4 py-3">{device.location || "–"}</td><td className="px-4 py-3">{device.gateway || "–"}</td>
          <td className="px-4 py-3 font-mono text-xs text-slate-600">{device.topic}</td><td className="px-4 py-3 capitalize">{device.enabled ? device.status : "Disabled"}</td><td className="px-4 py-3">{device.lastSeen ? new Date(device.lastSeen).toLocaleString() : "–"}</td>
          <td className="px-4 py-3"><div className="flex gap-2"><ActionIconButton label={`Edit ${device.code}`} onClick={() => edit(device)}><PencilIcon className="h-5 w-5 shrink-0 fill-current" /></ActionIconButton><ActionIconButton label={`Delete ${device.code}`} onClick={() => setDeviceToDelete(device)} tone="danger"><TrashBinIcon className="h-5 w-5 shrink-0 fill-current" /></ActionIconButton></div></td>
        </tr>)}</tbody>
      </table>
      {loading ? <p className="p-8 text-center text-sm text-slate-500">Loading devices…</p> : !loadError && visible.length === 0 ? <p className="p-8 text-center text-sm font-semibold text-slate-500">No devices found.</p> : null}
    </section>
    <ConfirmModal cancelText="Cancel" confirmText="Delete" isDestructive isLoading={deleting} isOpen={Boolean(deviceToDelete)} message={deviceToDelete ? `Delete ${deviceToDelete.code} (${categoryNames[deviceToDelete.category]})? This removes the device and its telemetry records.` : ""} onClose={() => { if (!deleting) setDeviceToDelete(null); }} onConfirm={() => void remove()} title="Delete Device" />
    <Modal isOpen={isFormOpen} onClose={reset} className="mx-4 max-w-[760px] overflow-hidden p-0">
      <form onSubmit={(event) => void submit(event)}>
        <div className="border-b border-slate-200 px-6 py-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Device Management</p><h2 className="mt-2 text-lg font-black text-slate-900">{editing ? "Edit Device" : "Add Device"}</h2></div>
        <div className="grid max-h-[70vh] gap-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
          <label className="block text-sm font-bold text-slate-700">Category<select className={inputClass} disabled={Boolean(editing)} value={form.category} onChange={(event) => setForm({ ...emptyForm, category: event.target.value as Category })}><option value="power">Power</option><option value="water">Water</option><option value="compressed-air">Compressor</option></select>{editing && <span className="mt-1 block text-xs font-normal text-slate-500">Category cannot be changed after creation.</span>}</label>
          <Field label="Device Code" value={form.code} onChange={updateCode} placeholder={form.category === "power" ? "PM-06" : form.category === "water" ? "WM-01" : "AIR-01"} required pattern="[A-Za-z0-9_-]+" maxLength={50} />
          <Field label="Device Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required maxLength={150} />
          <Field label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} maxLength={150} />
          {form.category === "power" ? <><Field label="Model" value={form.model} onChange={(value) => setForm({ ...form, model: value })} /><Field label="Gateway ID" value={form.gateway} onChange={(value) => setForm({ ...form, gateway: value })} /><Field label="MQTT Topic" value={form.topic} onChange={(value) => setForm({ ...form, topic: value })} /></> : <>
            <Field label="Low pressure alarm (bar)" type="number" min="0" max="1000000" value={form.lowPressure} onChange={(value) => setForm({ ...form, lowPressure: value })} placeholder="Optional" />
            <Field label={`High flow alarm (${form.category === "water" ? "m³/h" : "Nm³/h"})`} type="number" min="0" max="1000000000" value={form.highFlow} onChange={(value) => setForm({ ...form, highFlow: value })} placeholder="Optional" />
            <p className="text-xs leading-5 text-slate-500 sm:col-span-2">MQTT topic: <code>utility/{form.category}/{form.code.trim().toUpperCase() || "DEVICE-CODE"}/telemetry</code></p>
          </>}
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /> Enabled</label>
        </div>
        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end"><button className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60" disabled={saving} onClick={reset} type="button">Cancel</button><button className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60" disabled={saving} type="submit">{saving ? "Saving…" : editing ? "Update Device" : "Add Device"}</button></div>
      </form>
    </Modal>
  </div>;
}

function ActionIconButton({ children, label, onClick, tone = "default" }: { children: ReactNode; label: string; onClick: () => void; tone?: "default" | "danger" }) {
  const toneClass = tone === "danger" ? "border-red-200 bg-white text-red-600 hover:bg-red-50" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50";
  return <button aria-label={label} className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${toneClass}`} onClick={onClick} title={label} type="button">{children}</button>;
}
function Field({ label, onChange, placeholder, required = false, value, type = "text", min, max, maxLength, pattern }: { label: string; onChange: (value: string) => void; placeholder?: string; required?: boolean; value: string; type?: string; min?: string; max?: string; maxLength?: number; pattern?: string }) {
  return <label className="block text-sm font-bold text-slate-700">{label}<input className={inputClass} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} value={value} type={type} min={min} max={max} maxLength={maxLength} pattern={pattern} step={type === "number" ? "any" : undefined} /></label>;
}
