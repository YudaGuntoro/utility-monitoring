"use client";

import dynamic from "next/dynamic";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApexOptions } from "apexcharts";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { formatNumber, powerApi, type PowerDevice, type PowerTelemetry, type PowerUsageSummary } from "./powerMonitoring";
import { fetchSystemSettings, readSystemSettings } from "./settings";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

const DEVICE_DETAIL_REFRESH_MS = 60_000;

const ranges = [
  { label: "1 Hour", hours: 1 },
  { label: "6 Hours", hours: 6 },
  { label: "24 Hours", hours: 24 },
  { label: "7 Days", hours: 24 * 7 },
];

export default function PowerDeviceDetailPage({ id }: { id: string }) {
  const { theme } = useTheme();
  const toast = useToast();
  const [device, setDevice] = useState<PowerDevice | null>(null);
  const [history, setHistory] = useState<PowerTelemetry[]>([]);
  const [usage, setUsage] = useState<PowerUsageSummary | null>(null);
  const [electricityRate, setElectricityRate] = useState(() => readSystemSettings().electricityRatePerKwh);
  const [hours, setHours] = useState(6);

  const load = useCallback(async () => {
    try {
      const end = new Date();
      const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
      const [deviceResult, historyResult, usageResult] = await Promise.all([
        powerApi.device(id),
        powerApi.history(id, start.toISOString(), end.toISOString()),
        powerApi.usageSummary(id),
      ]);
      setDevice(deviceResult);
      setHistory(historyResult);
      setUsage(usageResult);
    } catch (err) {
      toast.error({ message: err instanceof Error ? err.message : "Failed to load device detail." });
    }
  }, [hours, id, toast]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        void load();
      }
    }, DEVICE_DETAIL_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    let ignore = false;
    void fetchSystemSettings().then((settings) => {
      if (!ignore) {
        setElectricityRate(settings.electricityRatePerKwh);
      }
    });
    return () => {
      ignore = true;
    };
  }, []);

  const latest = device?.latest;
  const chart = useMemo(() => {
    const categories = history.map((row) => new Date(row.timestamp).toLocaleTimeString());
    const options: ApexOptions = {
      chart: { fontFamily: "Outfit, sans-serif", toolbar: { show: false }, type: "line" },
      colors: ["#2563eb", "#0f766e", "#f59e0b", "#ef4444"],
      dataLabels: { enabled: false },
      grid: { borderColor: theme === "dark" ? "#1e293b" : "#e2e8f0", strokeDashArray: 3 },
      stroke: { curve: "smooth", width: 2 },
      xaxis: { categories, labels: { rotate: -30 } },
      yaxis: { decimalsInFloat: 2 },
    };
    return {
      options,
      series: [
        { name: "R Volt", data: history.map((row) => row.voltage_l1n ?? null) },
        { name: "S Volt", data: history.map((row) => row.voltage_l2n ?? null) },
        { name: "T Volt", data: history.map((row) => row.voltage_l3n ?? null) },
        { name: "R Ampere", data: history.map((row) => row.current_l1 ?? null) },
        { name: "S Ampere", data: history.map((row) => row.current_l2 ?? null) },
        { name: "T Ampere", data: history.map((row) => row.current_l3 ?? null) },
        { name: "Active Power", data: history.map((row) => row.active_power_kw ?? null) },
        { name: "Power Factor", data: history.map((row) => row.power_factor ?? null) },
      ],
    };
  }, [history, theme]);

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle={device?.name ?? "Power Meter"} parentTitle="Power Monitoring" />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600">Power Monitoring</p>
          <h1 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{device?.name ?? "Power Meter"}</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {device?.device_code ?? "-"} · {device?.model ?? "-"} · {device?.location ?? "-"} · {device?.gateway_id ?? "-"}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {device?.status ?? "loading"} · Last seen {device?.last_seen ? new Date(device.last_seen).toLocaleString() : "-"}
        </span>
      </header>

      <section className="grid gap-4 lg:grid-cols-4">
        <Panel title="Voltage">
          <Value label="R Volt" value={formatNumber(latest?.voltage_l1n)} unit="V" />
          <Value label="S Volt" value={formatNumber(latest?.voltage_l2n)} unit="V" />
          <Value label="T Volt" value={formatNumber(latest?.voltage_l3n)} unit="V" />
          <Value label="R-S Volt" value={formatNumber(latest?.voltage_l1l2)} unit="V" />
          <Value label="S-T Volt" value={formatNumber(latest?.voltage_l2l3)} unit="V" />
          <Value label="T-R Volt" value={formatNumber(latest?.voltage_l3l1)} unit="V" />
        </Panel>
        <Panel title="Current">
          <Value label="R Ampere" value={formatNumber(latest?.current_l1)} unit="A" />
          <Value label="S Ampere" value={formatNumber(latest?.current_l2)} unit="A" />
          <Value label="T Ampere" value={formatNumber(latest?.current_l3)} unit="A" />
          <Value label="Neutral Ampere" value={formatNumber(latest?.current_neutral)} unit="A" />
        </Panel>
        <Panel title="Power">
          <Value label="Active" value={formatNumber(latest?.active_power_kw)} unit="kW" />
          <Value label="Reactive" value={formatNumber(latest?.reactive_power_kvar)} unit="kVAR" />
          <Value label="Apparent" value={formatNumber(latest?.apparent_power_kva)} unit="kVA" />
          <Value label="Power Factor" value={formatNumber(latest?.power_factor, 3)} />
          <Value label="Frequency" value={formatNumber(latest?.frequency_hz, 2)} unit="Hz" />
        </Panel>
        <Panel title="Energy">
          <Value label="Import" value={formatNumber(latest?.energy_import_kwh)} unit="kWh" />
          <Value label="Export" value={formatNumber(latest?.energy_export_kwh)} unit="kWh" />
        </Panel>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Energy Import</p>
            <h2 className="mt-1 text-lg font-black text-slate-900 dark:text-white">Average Usage</h2>
          </div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Based on last 30 days telemetry
          </p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <UsageCard accent="blue" electricityRate={electricityRate} label="Per Hour" rate={usage?.hourly} />
          <UsageCard accent="emerald" electricityRate={electricityRate} label="Per Day" rate={usage?.daily} />
          <UsageCard accent="amber" electricityRate={electricityRate} label="Per Week" rate={usage?.weekly} />
          <UsageCard accent="violet" electricityRate={electricityRate} label="Per Month" rate={usage?.monthly} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Historical Trends</h2>
          <div className="flex flex-wrap gap-2">
            {ranges.map((range) => (
              <button
                className={`rounded-lg px-3 py-2 text-sm font-bold ${hours === range.hours ? "bg-brand-500 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}
                key={range.label}
                onClick={() => setHours(range.hours)}
                type="button"
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5 min-h-[320px]">
          <ReactApexChart height={320} options={chart.options} series={chart.series} type="line" />
        </div>
      </section>
    </div>
  );
}

function UsageCard({
  accent,
  electricityRate,
  label,
  rate,
}: {
  accent: "blue" | "emerald" | "amber" | "violet";
  electricityRate: number;
  label: string;
  rate?: PowerUsageSummary["hourly"];
}) {
  const accentClass = {
    amber: "bg-amber-400",
    blue: "bg-blue-500",
    emerald: "bg-emerald-400",
    violet: "bg-violet-400",
  }[accent];
  const value = typeof rate?.average_kwh === "number" ? formatNumber(rate.average_kwh, 2) : "-";
  const cost = typeof rate?.average_kwh === "number" ? rate.average_kwh * electricityRate : null;

  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <span className={`absolute left-0 right-0 top-0 h-1 ${accentClass}`} />
      <p className="text-xs font-black uppercase text-slate-500 dark:text-slate-300">{label}</p>
      <p className="mt-3 text-2xl font-black text-slate-950 dark:text-white">
        {value}
        <span className="ml-2 text-sm font-bold text-slate-500 dark:text-slate-300">kWh</span>
      </p>
      <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
        {rate?.samples ? `${rate.samples} samples` : "No data"}
      </p>
      <p className="mt-3 text-sm font-black text-slate-900 dark:text-white">
        {cost === null ? "Cost -" : formatCurrency(cost)}
      </p>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    currency: "IDR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function Panel({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-black uppercase text-slate-500">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Value({ label, unit, value }: { label: string; unit?: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-950">
      <span className="text-xs font-bold text-slate-500">{label}</span>
      <span className="font-black text-slate-900 dark:text-white">
        {value}
        {unit ? <span className="ml-1 text-xs text-slate-400">{unit}</span> : null}
      </span>
    </div>
  );
}
