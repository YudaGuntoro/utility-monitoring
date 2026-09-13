"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { useToast } from "@/context/ToastContext";
import { formatNumber, powerApi, type PowerDashboard, type PowerDevice } from "./powerMonitoring";

function formatTime(value?: string | null) {
  if (!value) return "No data";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No data" : date.toLocaleString();
}

function statusClasses(status: PowerDevice["status"]) {
  if (status === "online") return "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-400/20";
  if (status === "warning") return "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20";
  return "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-200 dark:ring-red-400/20";
}

function statusDotClasses(status: PowerDevice["status"]) {
  if (status === "online") return "bg-emerald-400";
  if (status === "warning") return "bg-amber-400";
  return "bg-red-500";
}

function SummaryCard({
  accent,
  label,
  note,
  status,
  value,
  unit,
}: {
  accent: "blue" | "cyan" | "emerald" | "amber" | "red" | "violet";
  label: string;
  note?: string;
  status?: "online" | "offline" | "warning" | "waiting";
  value: string | number;
  unit?: string;
}) {
  const accentClass = {
    amber: "bg-amber-400",
    blue: "bg-blue-500",
    cyan: "bg-cyan-400",
    emerald: "bg-emerald-400",
    red: "bg-red-500",
    violet: "bg-violet-400",
  }[accent];
  const statusClass = {
    offline: "border-red-500/25 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200",
    online: "border-emerald-500/25 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100",
    waiting: "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-500/30 dark:bg-slate-500/15 dark:text-slate-200",
    warning: "border-amber-500/25 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100",
  }[status ?? "waiting"];
  const dotClass = {
    offline: "bg-red-500",
    online: "bg-emerald-400",
    waiting: "bg-slate-400",
    warning: "bg-amber-400",
  }[status ?? "waiting"];

  return (
    <section className={`rounded-lg ${accentClass} p-px shadow-sm shadow-slate-200/70 dark:shadow-black/20`}>
      <div className="h-full rounded-[7px] bg-white p-5 dark:bg-[#111a2e]">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-extrabold text-slate-800 dark:text-white">{label}</p>
          {status ? (
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-extrabold capitalize ${statusClass}`}>
              <span className={`size-2 rounded-full ${dotClass}`} />
              {status}
            </span>
          ) : null}
        </div>
        <p className="mt-5 text-2xl font-black text-slate-950 dark:text-white">
          {value}
          {unit ? <span className="ml-2 text-sm font-extrabold text-slate-500 dark:text-slate-300">{unit}</span> : null}
        </p>
        {note ? <p className="mt-3 text-xs font-bold text-slate-500 dark:text-slate-200">{note}</p> : null}
      </div>
    </section>
  );
}

function PowerMeterCard({ device }: { device: PowerDevice }) {
  const latest = device.latest;
  const accentClass = {
    offline: "bg-red-500",
    online: "bg-emerald-400",
    warning: "bg-amber-400",
  }[device.status];

  return (
    <Link
      className="relative block overflow-hidden rounded-lg border border-slate-200 bg-white p-5 pt-6 shadow-sm shadow-slate-200/70 transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md dark:border-[#1d2f52] dark:bg-[#111a2e] dark:shadow-black/20"
      href={`/power-monitoring/devices/${device.id}`}
    >
      <span className={`absolute left-0 right-0 top-0 h-1 ${accentClass}`} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-950 dark:text-white">{device.name}</h2>
          <p className="mt-1 text-xs font-bold uppercase text-slate-500 dark:text-slate-200">{device.device_code} · {device.location || "No location"}</p>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black capitalize ring-1 ${statusClasses(device.status)}`}>
          <span className={`size-2 rounded-full ${statusDotClasses(device.status)}`} />
          {device.enabled ? device.status : "disabled"}
        </span>
      </div>

      <p className="mt-4 truncate text-xs font-semibold text-slate-500 dark:text-slate-200">{device.model}</p>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <Metric label="R Volt" value={formatNumber(latest?.voltage_l1n)} unit="V" />
        <Metric label="R Ampere" value={formatNumber(latest?.current_l1)} unit="A" />
        <Metric label="S Volt" value={formatNumber(latest?.voltage_l2n)} unit="V" />
        <Metric label="S Ampere" value={formatNumber(latest?.current_l2)} unit="A" />
        <Metric label="T Volt" value={formatNumber(latest?.voltage_l3n)} unit="V" />
        <Metric label="T Ampere" value={formatNumber(latest?.current_l3)} unit="A" />
        <Metric label="Frequency" value={formatNumber(latest?.frequency_hz, 2)} unit="Hz" />
        <Metric label="Power Factor" value={formatNumber(latest?.power_factor, 3)} />
        <Metric label="Active Power" value={formatNumber(latest?.active_power_kw)} unit="kW" />
        <Metric label="Energy Import" value={formatNumber(latest?.energy_import_kwh)} unit="kWh" />
      </div>

      <p className="mt-5 text-xs font-semibold text-slate-500 dark:text-slate-200">Last update: {formatTime(device.last_seen)}</p>
    </Link>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-3 ring-1 ring-slate-100 dark:bg-slate-950 dark:ring-slate-800">
      <p className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-300">{label}</p>
      <p className="mt-1 font-black text-slate-900 dark:text-slate-100">
        {value}
        {unit ? <span className="ml-1 text-xs font-bold text-slate-500 dark:text-slate-300">{unit}</span> : null}
      </p>
    </div>
  );
}

export default function ProductionDashboard() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<PowerDashboard | null>(null);

  const load = useCallback(async () => {
    try {
      setDashboard(await powerApi.dashboard());
    } catch (err) {
      toast.error({ message: err instanceof Error ? err.message : "Failed to load power dashboard." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const summary = dashboard?.summary;
  const devices = useMemo(() => dashboard?.devices ?? [], [dashboard]);

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Power Monitoring" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600">Utility Monitoring</p>
          <h1 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">Power Monitoring System</h1>
        </div>
        <div className="flex gap-3">
          <Link className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900" href="/devices">
            Devices
          </Link>
          <button className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-60" disabled={loading} onClick={() => void load()} type="button">
            {loading ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <SummaryCard accent="blue" label="Total Devices" note="Registered power meters" status="waiting" value={summary?.total_devices ?? 0} />
        <SummaryCard accent="emerald" label="Online" note="Recent valid telemetry" status="online" value={summary?.online ?? 0} />
        <SummaryCard accent="red" label="Offline" note="No recent telemetry" status="offline" value={summary?.offline ?? 0} />
        <SummaryCard accent="amber" label="Warning" note="Abnormal or gateway warning" status="warning" value={summary?.warning ?? 0} />
        <SummaryCard accent="cyan" label="Active Power" note="Combined live load" status="waiting" value={formatNumber(summary?.total_active_power_kw)} unit="kW" />
        <SummaryCard accent="violet" label="Total Energy" note="Import energy total" status="waiting" value={formatNumber(summary?.total_energy_import_kwh)} unit="kWh" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {devices.map((device) => <PowerMeterCard device={device} key={device.id} />)}
      </div>

      {!loading && devices.length === 0 ? (
        <section className="rounded-lg border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
          <p className="text-sm font-semibold text-slate-500">No power meters registered yet.</p>
        </section>
      ) : null}
    </div>
  );
}


