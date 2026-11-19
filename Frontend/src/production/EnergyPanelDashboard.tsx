"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import DatePicker from "@/components/form/date-picker";
import TrendChart from "./EnergyTrendChart";
import { useToast } from "@/context/ToastContext";
import { average, formatNumber, powerApi, type PowerDashboard, type PowerDevice, type PowerTelemetry } from "./powerMonitoring";

const REFRESH_MS = 30_000;
const PANEL_COLORS = ["#465fff", "#82a9ff", "#0d9488", "#f59e0b", "#1d4f8f", "#06a6c5", "#64748b", "#e76c57"];

type PanelMetric = {
  device: PowerDevice;
  color: string;
  current: number | null;
  energy: number;
  percent: number;
  power: number | null;
  voltage: number | null;
  trend: number[];
};

function numberValue(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sumNumbers(values: Array<number | null | undefined>) {
  return values.reduce<number>((total, value) => total + (numberValue(value) ?? 0), 0);
}

function latestEnergy(device: PowerDevice) {
  return numberValue(device.latest?.energy_import_kwh) ?? 0;
}

function compactNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function statusLabel(status: PowerDevice["status"]) {
  if (status === "online") return "Normal";
  if (status === "warning") return "Warning";
  return "Offline";
}

function statusClasses(status: PowerDevice["status"]) {
  if (status === "online") return "bg-[#12b76a] text-slate-600";
  if (status === "warning") return "bg-[#f59e0b] text-slate-600";
  return "bg-[#f04438] text-slate-600";
}

function buildTrendFromHistory(history: PowerTelemetry[], fallback: number) {
  const points = history
    .map((item) => numberValue(item.energy_import_kwh) ?? numberValue(item.active_power_kw))
    .filter((value): value is number => value !== null);

  if (points.length >= 2) {
    const stride = Math.max(1, Math.floor(points.length / 12));
    return points.filter((_, index) => index % stride === 0).slice(-12);
  }

  return Array.from({ length: 12 }, (_, index) => Math.max(0, fallback * (0.72 + index * 0.025 + (index % 3) * 0.025)));
}

function DashboardCard({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section style={style} className={`rounded-lg border border-[#dfe5ee] bg-white shadow-sm ${className}`}>
      {children}
    </section>
  );
}

function OverviewStat({
  accent,
  label,
  value,
  unit,
  note,
}: {
  accent: string;
  label: string;
  note: string;
  unit?: string;
  value: string | number;
}) {
  return (
    <DashboardCard className="p-5" style={{ borderTop: `4px solid ${accent}` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-3 truncate text-[28px] font-semibold leading-none tracking-tight text-slate-800">
            {value}
            {unit ? <span className="ml-1 text-sm font-medium text-slate-500">{unit}</span> : null}
          </p>
          <p className="mt-3 truncate text-[11px] text-slate-400">{note}</p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-50" style={{ color: accent }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {label === "Total Energy" ? <path d="m13 2-8 12h6l-1 8 9-13h-6l1-7Z" /> : label === "Online Devices" ? <><rect x="3" y="4" width="18" height="13" rx="3" /><path d="M8 21h8m-4-4v4m-5-9 3-3 3 3 4-5" /></> : label === "Warning" ? <><path d="m10.3 4-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></> : <><path d="M3 12h4l3-8 4 16 3-8h4" /></>}
          </svg>
        </span>
      </div>
    </DashboardCard>
  );
}

function DonutChart({ metrics, totalEnergy }: { metrics: PanelMetric[]; totalEnergy: number }) {
  const sortedMetrics = [...metrics].sort((a, b) => b.energy - a.energy);
  const totalPercent = totalEnergy > 0 ? 100 : 0;
  const segments = sortedMetrics.reduce<Array<{ length: number; metric: PanelMetric; offset: number }>>((items, metric) => {
    const length = totalEnergy > 0 ? metric.percent : 0;
    const previousOffset = items.at(-1);
    const offset = previousOffset ? previousOffset.offset - previousOffset.length : 0;
    return [...items, { length, metric, offset }];
  }, []);

  const segmentCircles = segments.map(({ length, metric, offset }) => (
      <circle
        cx="50"
        cy="50"
        fill="transparent"
        key={metric.device.id}
        r="34"
        stroke={metric.color}
        strokeDasharray={`${length} ${100 - length}`}
        strokeDashoffset={offset}
        strokeWidth="11"
        pathLength="100"
      />
  ));

  return (
    <DashboardCard className="p-5">
      <h2 className="text-base font-semibold text-slate-800">Energy Distribution</h2>
      <p className="mt-1 text-xs text-slate-400">Contribution of each panel</p>
      <div className="mt-5 grid gap-5">
        <div className="relative mx-auto size-52">
          <svg className="size-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" fill="transparent" r="34" stroke="currentColor" strokeWidth="11" className="text-slate-100" />
            {segmentCircles}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-semibold text-slate-800">{compactNumber(totalEnergy, 0)}</span>
            <span className="text-sm font-medium text-slate-600">kWh</span>
            <span className="text-xs font-semibold text-slate-500">Total</span>
          </div>
        </div>
        <div className="space-y-3">
          {sortedMetrics.map((metric, index) => (
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-sm" key={metric.device.id}>
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-medium text-slate-600" style={{ backgroundColor: `${metric.color}28` }}>
                  {index + 1}
                </span>
                <span className="truncate font-semibold text-slate-700">{metric.device.name}</span>
              </div>
              <span className="font-medium text-slate-900">{compactNumber(metric.energy, 0)} kWh</span>
              <span className="w-14 text-right font-medium text-slate-500">{metric.percent.toFixed(1)}%</span>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Total kWh</p>
              <p className="mt-1 text-lg font-semibold text-slate-800">{compactNumber(totalEnergy, 0)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Total %</p>
              <p className="mt-1 text-lg font-semibold text-slate-800">{totalPercent.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardCard>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PanelBreakdown({ metrics, totalEnergy }: { metrics: PanelMetric[]; totalEnergy: number }) {
  return (
    <DashboardCard className="p-5">
      <h2 className="text-base font-semibold text-slate-800 dark:text-white">Panel Ranking</h2>
      <div className="mt-4 space-y-3">
        {metrics.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm font-semibold text-slate-500 dark:border-sky-300/30 dark:text-slate-300">
            No panel data available.
          </div>
        ) : null}
        {metrics.map((metric, index) => {
          const width = totalEnergy > 0 ? Math.max(3, metric.percent) : 0;
          return (
            <Link className="block rounded-lg border border-slate-100 p-3 transition hover:border-sky-300 hover:bg-sky-50/60 dark:border-sky-300/10 dark:hover:border-sky-300/30 dark:hover:bg-white/[0.03]" href={`/power-monitoring/devices/${metric.device.id}`} key={metric.device.id}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white" style={{ backgroundColor: metric.color }}>
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{metric.device.name}</p>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-300">
                      {statusLabel(metric.device.status)} · {metric.percent.toFixed(1)}%
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">{compactNumber(metric.energy, 0)} kWh</p>
                </div>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-slate-100 dark:bg-sky-950">
                <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: metric.color }} />
              </div>
            </Link>
          );
        })}
      </div>
    </DashboardCard>
  );
}

function BarChart({ metrics, maxEnergy }: { metrics: PanelMetric[]; maxEnergy: number }) {
  return (
    <DashboardCard className="p-5">
      <h2 className="text-base font-semibold text-slate-800">Energy Consumption per Panel</h2>
      <div className="mt-5 flex min-h-[220px] items-end gap-4 overflow-x-auto border-b border-l border-slate-200 px-4 pt-6">
        {metrics.map((metric) => {
          const height = maxEnergy > 0 ? Math.max(6, (metric.energy / maxEnergy) * 150) : 6;
          return (
            <div className="flex min-w-24 flex-1 flex-col items-center justify-end" key={metric.device.id}>
              <span className="mb-2 text-sm font-semibold text-slate-900">{compactNumber(metric.energy, 0)}</span>
              <div className="w-full max-w-24 rounded-t-md" style={{ height, backgroundColor: metric.color }} />
              <span className="mt-3 max-w-24 truncate text-xs font-semibold text-slate-500">{metric.device.name}</span>
            </div>
          );
        })}
      </div>
    </DashboardCard>
  );
}

function DetailTable({ metrics, totalEnergy }: { metrics: PanelMetric[]; totalEnergy: number }) {
  return (
    <DashboardCard className="p-5">
      <h2 className="text-base font-semibold text-slate-800">Panel Detail</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[760px] w-full overflow-hidden rounded-lg border border-slate-200 text-sm">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left">No</th>
              <th className="px-4 py-3 text-left">Panel</th>
              <th className="px-4 py-3 text-right">Energy (kWh)</th>
              <th className="px-4 py-3 text-right">% Total</th>
              <th className="px-4 py-3 text-right">Power (kW)</th>
              <th className="px-4 py-3 text-right">Current (A)</th>
              <th className="px-4 py-3 text-right">Voltage (V)</th>
              <th className="px-4 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric, index) => (
              <tr className="border-t border-slate-200 text-slate-700" key={metric.device.id}>
                <td className="px-4 py-3">{index + 1}</td>
                <td className="px-4 py-3">
                  <Link className="font-medium text-slate-800 hover:text-[#7891ac]" href={`/power-monitoring/devices/${metric.device.id}`}>
                    {metric.device.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right font-medium">{compactNumber(metric.energy, 0)}</td>
                <td className="px-4 py-3 text-right">{metric.percent.toFixed(1)}%</td>
                <td className="px-4 py-3 text-right">{formatNumber(metric.power)}</td>
                <td className="px-4 py-3 text-right">{formatNumber(metric.current)}</td>
                <td className="px-4 py-3 text-right">{formatNumber(metric.voltage)}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <span className={`size-2.5 rounded-full ${statusClasses(metric.device.status)}`} />
                    {statusLabel(metric.device.status)}
                  </span>
                </td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 text-slate-900">
              <td className="px-4 py-3" />
              <td className="px-4 py-3 font-semibold">Total</td>
              <td className="px-4 py-3 text-right font-semibold">{compactNumber(totalEnergy, 0)}</td>
              <td className="px-4 py-3 text-right font-semibold">{totalEnergy > 0 ? "100%" : "0%"}</td>
              <td className="px-4 py-3 text-right">-</td>
              <td className="px-4 py-3 text-right">-</td>
              <td className="px-4 py-3 text-right">-</td>
              <td className="px-4 py-3">-</td>
            </tr>
          </tbody>
        </table>
      </div>
    </DashboardCard>
  );
}

export default function EnergyPanelDashboard() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<PowerDashboard | null>(null);
  const [historyByDevice, setHistoryByDevice] = useState<Record<number, PowerTelemetry[]>>({});
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const load = useCallback(async () => {
    try {
      const nextDashboard = await powerApi.dashboard();
      setDashboard(nextDashboard);

      const start = new Date(selectedDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(selectedDate);
      end.setHours(23, 59, 59, 999);
      const histories = await Promise.all(
        nextDashboard.devices.map(async (device) => {
          try {
            return [device.id, await powerApi.history(device.id, start.toISOString(), end.toISOString())] as const;
          } catch {
            return [device.id, []] as const;
          }
        }),
      );
      setHistoryByDevice(Object.fromEntries(histories));
    } catch (err) {
      toast.error({ message: err instanceof Error ? err.message : "Failed to load energy dashboard." });
    } finally {
      setLoading(false);
    }
  }, [selectedDate, toast]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const devices = useMemo(() => dashboard?.devices ?? [], [dashboard]);
  const totalEnergy = useMemo(() => sumNumbers(devices.map((device) => latestEnergy(device))), [devices]);
  const metrics = useMemo<PanelMetric[]>(
    () =>
      devices.map((device, index) => {
        const latest = device.latest;
        const energy = latestEnergy(device);
        return {
          color: PANEL_COLORS[index % PANEL_COLORS.length],
          current: average([latest?.current_l1, latest?.current_l2, latest?.current_l3]),
          device,
          energy,
          percent: totalEnergy > 0 ? (energy / totalEnergy) * 100 : 0,
          power: numberValue(latest?.active_power_kw),
          trend: buildTrendFromHistory(historyByDevice[device.id] ?? [], energy),
          voltage: average([latest?.voltage_l1n, latest?.voltage_l2n, latest?.voltage_l3n]),
        };
      }),
    [devices, historyByDevice, totalEnergy],
  );
  const maxEnergy = Math.max(1, ...metrics.map((metric) => metric.energy));
  const summary = dashboard?.summary;
  const handleDateChange = useCallback((dates: Date[]) => {
    if (dates[0]) {
      setSelectedDate(dates[0]);
    }
  }, []);

  return (
    <div className="energy-light-surface energy-soft-dashboard -m-4 min-h-[calc(100vh-96px)] bg-[#f6f7f9] p-4 text-slate-700 md:-m-6 md:p-7">
      <div className="mx-auto max-w-[1520px] space-y-6">
        <section>
          <div className="mb-6 grid gap-5 rounded-lg border border-[#b6e4fc] bg-[#eaf8ff] px-6 py-5 shadow-sm xl:grid-cols-[1fr_auto] xl:items-center">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1d4f8f]">Utility Monitoring System</p>
                <h1 className="mt-2 text-[26px] font-semibold tracking-tight text-slate-800">Energy overview</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-500">Power consumption and distribution across registered panels.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 xl:justify-end">
              <div className="w-[230px]">
                <DatePicker
                  className="h-10 border-slate-200 bg-white pr-11 text-sm font-medium text-slate-700 shadow-sm shadow-slate-200/60 focus:border-slate-300 focus:ring-slate-300/15 dark:border-slate-200 dark:bg-white dark:text-slate-700 dark:focus:border-slate-300"
                  dateFormat="d M Y"
                  defaultDate={selectedDate}
                  id="energy-dashboard-date"
                  onChange={handleDateChange}
                  placeholder="Select date"
                />
              </div>
              <button className="flex h-10 items-center gap-2 rounded-lg border border-[#2879e7] bg-[#2879e7] px-4 text-sm font-medium text-white transition hover:bg-[#1d64c4] disabled:opacity-60" disabled={loading} onClick={() => void load()} type="button">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 11-1l3 6M4 12l3 6a7 7 0 0 0 11-1" /></svg>
                {loading ? "Refreshing" : "Refresh"}
              </button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <OverviewStat accent="#00aeef" label="Total Energy" note={`${summary?.total_devices ?? 0} registered devices`} unit="kWh" value={compactNumber(totalEnergy, 0)} />
            <OverviewStat accent="#2f80ed" label="Online Devices" note="Recent valid telemetry" value={summary?.online ?? 0} />
            <OverviewStat accent="#ffb000" label="Warning" note={`${summary?.offline ?? 0} offline`} value={summary?.warning ?? 0} />
            <OverviewStat accent="#00b882" label="Active Power" note="Combined live load" unit="kW" value={formatNumber(summary?.total_active_power_kw)} />
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <TrendChart metrics={metrics} />
          <DonutChart metrics={metrics} totalEnergy={totalEnergy} />
        </div>

        <BarChart maxEnergy={maxEnergy} metrics={metrics} />

        <DetailTable metrics={metrics} totalEnergy={totalEnergy} />

        {!loading && metrics.length === 0 ? (
          <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-semibold text-slate-500">
            No power meters registered yet.
          </section>
        ) : null}
      </div>
    </div>
  );
}
