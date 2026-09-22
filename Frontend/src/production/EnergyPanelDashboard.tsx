"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import DatePicker from "@/components/form/date-picker";
import { useToast } from "@/context/ToastContext";
import { average, formatNumber, powerApi, type PowerDashboard, type PowerDevice, type PowerTelemetry } from "./powerMonitoring";

const REFRESH_MS = 30_000;
const PANEL_COLORS = ["#2f8cff", "#ff7a24", "#2fca6d", "#9b55f6", "#16c7c8", "#f4bd24", "#ef476f", "#06b6d4"];

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
  if (status === "online") return "bg-emerald-400 text-emerald-100";
  if (status === "warning") return "bg-amber-400 text-amber-100";
  return "bg-red-500 text-red-100";
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

function DashboardCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-200/70 ${className}`}>
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
    <DashboardCard className="p-4">
      <div className="flex items-center gap-3">
        <span className="h-10 w-1 rounded-full" style={{ backgroundColor: accent }} />
        <div className="min-w-0">
          <p className="truncate text-xs font-black uppercase text-slate-500">{label}</p>
          <p className="mt-1 truncate text-2xl font-black text-slate-950">
            {value}
            {unit ? <span className="ml-1 text-sm font-bold text-slate-500">{unit}</span> : null}
          </p>
          <p className="mt-1 truncate text-xs font-semibold text-slate-500">{note}</p>
        </div>
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
    const offset = previousOffset ? previousOffset.offset - previousOffset.length : 25;
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
        strokeWidth="16"
      />
  ));

  return (
    <DashboardCard className="p-5">
      <h2 className="text-base font-black text-slate-950">Energy Distribution</h2>
      <div className="mt-5 grid gap-5">
        <div className="relative mx-auto size-52">
          <svg className="size-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" fill="transparent" r="34" stroke="currentColor" strokeWidth="16" className="text-slate-100" />
            {segmentCircles}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-black text-slate-950">{compactNumber(totalEnergy, 0)}</span>
            <span className="text-sm font-bold text-slate-600">kWh</span>
            <span className="text-xs font-semibold text-slate-500">Total</span>
          </div>
        </div>
        <div className="space-y-3">
          {sortedMetrics.map((metric, index) => (
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-sm" key={metric.device.id}>
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-black text-white" style={{ backgroundColor: metric.color }}>
                  {index + 1}
                </span>
                <span className="truncate font-semibold text-slate-700">{metric.device.name}</span>
              </div>
              <span className="font-bold text-slate-900">{compactNumber(metric.energy, 0)} kWh</span>
              <span className="w-14 text-right font-bold text-slate-500">{metric.percent.toFixed(1)}%</span>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-black uppercase text-slate-500">Total kWh</p>
              <p className="mt-1 text-lg font-black text-slate-950">{compactNumber(totalEnergy, 0)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-black uppercase text-slate-500">Total %</p>
              <p className="mt-1 text-lg font-black text-slate-950">{totalPercent.toFixed(1)}%</p>
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
      <h2 className="text-base font-black text-slate-950 dark:text-white">Panel Ranking</h2>
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
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-black text-white" style={{ backgroundColor: metric.color }}>
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900 dark:text-white">{metric.device.name}</p>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-300">
                      {statusLabel(metric.device.status)} · {metric.percent.toFixed(1)}%
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-950 dark:text-white">{compactNumber(metric.energy, 0)} kWh</p>
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
      <h2 className="text-base font-black text-slate-950">Energy Consumption per Panel</h2>
      <div className="mt-5 flex min-h-[220px] items-end gap-4 overflow-x-auto border-b border-l border-slate-200 px-4 pt-6">
        {metrics.map((metric) => {
          const height = maxEnergy > 0 ? Math.max(6, (metric.energy / maxEnergy) * 150) : 6;
          return (
            <div className="flex min-w-24 flex-1 flex-col items-center justify-end" key={metric.device.id}>
              <span className="mb-2 text-sm font-black text-slate-900">{compactNumber(metric.energy, 0)}</span>
              <div className="w-full max-w-24 rounded-t-md shadow-lg" style={{ height, background: `linear-gradient(180deg, ${metric.color}, ${metric.color}bb)` }} />
              <span className="mt-3 max-w-24 truncate text-xs font-semibold text-slate-500">{metric.device.name}</span>
            </div>
          );
        })}
      </div>
    </DashboardCard>
  );
}

function TrendChart({ metrics }: { metrics: PanelMetric[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const width = 860;
  const height = 310;
  const padding = { bottom: 42, left: 58, right: 28, top: 18 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const displayedMetrics = [...metrics].sort((a, b) => b.energy - a.energy).slice(0, 6);
  const allPoints = displayedMetrics.flatMap((metric) => metric.trend);
  const max = Math.max(1, ...allPoints);
  const min = Math.min(0, ...allPoints);
  const range = Math.max(1, max - min);
  const yTicks = Array.from({ length: 5 }, (_, index) => min + (range / 4) * index).reverse();
  const xTicks = ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"];
  const maxPointCount = Math.max(0, ...displayedMetrics.map((metric) => metric.trend.length));

  const xFor = (index: number, total: number) => padding.left + (index / Math.max(1, total - 1)) * plotWidth;
  const yFor = (point: number) => padding.top + plotHeight - ((point - min) / range) * plotHeight;
  const timeLabelForIndex = (index: number) => {
    const hour = Math.round((index / Math.max(1, maxPointCount - 1)) * 23);
    return `${String(hour).padStart(2, "0")}:00`;
  };
  const resolveIndexFromClientX = (clientX: number, target: SVGSVGElement) => {
    const rect = target.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * width;
    const ratio = Math.min(1, Math.max(0, (svgX - padding.left) / plotWidth));
    return Math.round(ratio * Math.max(0, maxPointCount - 1));
  };
  const activePointIndex = activeIndex !== null && maxPointCount > 0 ? activeIndex : null;
  const activeX = activePointIndex !== null ? xFor(activePointIndex, maxPointCount) : null;
  const activeValues = activePointIndex !== null
    ? displayedMetrics.map((metric) => ({
        color: metric.color,
        name: metric.device.name,
        value: metric.trend[Math.min(activePointIndex, metric.trend.length - 1)] ?? 0,
      }))
    : [];
  const tooltipWidth = 190;
  const tooltipHeight = 42 + activeValues.length * 20;
  const tooltipX = activeX === null ? 0 : Math.min(width - padding.right - tooltipWidth, Math.max(padding.left + 8, activeX + 14));
  const tooltipY = padding.top + 12;

  const toPath = (points: number[]) =>
    points.reduce((path, point, index) => {
      const x = xFor(index, points.length);
      const y = yFor(point);

      if (index === 0) return `M ${x.toFixed(1)} ${y.toFixed(1)}`;

      const previousX = xFor(index - 1, points.length);
      const previousY = yFor(points[index - 1]);
      const controlX = (previousX + x) / 2;
      return `${path} C ${controlX.toFixed(1)} ${previousY.toFixed(1)}, ${controlX.toFixed(1)} ${y.toFixed(1)}, ${x.toFixed(1)} ${y.toFixed(1)}`;
    }, "");

  const latestTotal = displayedMetrics.reduce((total, metric) => total + (metric.trend.at(-1) ?? 0), 0);
  const leader = displayedMetrics[0];

  return (
    <DashboardCard className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-black text-slate-950">Energy Consumption Trend per Panel</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">Sorted by highest consumption, last 24 hours.</p>
        </div>
        <div className="flex gap-2">
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-right">
          <p className="text-[11px] font-black uppercase text-slate-500">Latest Total</p>
          <p className="text-sm font-black text-slate-950">{compactNumber(latestTotal, 0)} kWh</p>
          </div>
          <span className="h-fit rounded-md bg-[#2f8cff] px-3 py-2 text-xs font-black text-white">kWh</span>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-slate-100 bg-slate-50/70 p-3">
        <div className="overflow-x-auto">
          <svg
            className="min-h-[320px] min-w-[720px] touch-none"
            onMouseLeave={() => setActiveIndex(null)}
            onMouseMove={(event) => setActiveIndex(resolveIndexFromClientX(event.clientX, event.currentTarget))}
            onTouchEnd={() => setActiveIndex(null)}
            onTouchMove={(event) => {
              const touch = event.touches[0];
              if (touch) setActiveIndex(resolveIndexFromClientX(touch.clientX, event.currentTarget));
            }}
            role="img"
            viewBox={`0 0 ${width} ${height}`}
            aria-label="Energy consumption trend chart"
          >
            <rect className="fill-white" height={plotHeight} rx="8" width={plotWidth} x={padding.left} y={padding.top} />

            {yTicks.map((tick) => {
              const y = yFor(tick);
              return (
                <g key={tick.toFixed(2)}>
                  <line className="stroke-slate-200" strokeDasharray="4 6" strokeWidth="1" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
                  <text className="fill-slate-500 text-[11px] font-bold" textAnchor="end" x={padding.left - 10} y={y + 4}>
                    {compactNumber(tick, 0)}
                  </text>
                </g>
              );
            })}

            {xTicks.map((label, index) => {
              const x = padding.left + (index / Math.max(1, xTicks.length - 1)) * plotWidth;
              return (
                <g key={label}>
                  <line className="stroke-slate-100" strokeWidth="1" x1={x} x2={x} y1={padding.top} y2={padding.top + plotHeight} />
                  <text className="fill-slate-500 text-[11px] font-bold" textAnchor="middle" x={x} y={height - 12}>
                    {label}
                  </text>
                </g>
              );
            })}

            <line className="stroke-slate-300" strokeWidth="1.5" x1={padding.left} x2={padding.left} y1={padding.top} y2={padding.top + plotHeight} />
            <line className="stroke-slate-300" strokeWidth="1.5" x1={padding.left} x2={width - padding.right} y1={padding.top + plotHeight} y2={padding.top + plotHeight} />

            {displayedMetrics.map((metric) => (
              <g key={metric.device.id}>
                <path d={toPath(metric.trend)} fill="none" stroke={metric.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" />
                {metric.trend.length > 0 ? (
                  <circle
                    cx={xFor(metric.trend.length - 1, metric.trend.length)}
                    cy={yFor(metric.trend.at(-1) ?? 0)}
                    fill={metric.color}
                    r={4.5}
                    stroke="white"
                    strokeWidth="2"
                  />
                ) : null}
              </g>
            ))}

            {leader?.trend.length ? (
              <text className="fill-slate-700 text-[11px] font-black" textAnchor="end" x={width - padding.right - 6} y={Math.max(padding.top + 12, yFor(leader.trend.at(-1) ?? 0) - 10)}>
                {leader.device.name}
              </text>
            ) : null}

            {activePointIndex !== null && activeX !== null ? (
              <g>
                <line className="stroke-slate-400" strokeDasharray="5 5" strokeWidth="1.5" x1={activeX} x2={activeX} y1={padding.top} y2={padding.top + plotHeight} />
                {activeValues.map((item) => (
                  <circle cx={activeX} cy={yFor(item.value)} fill={item.color} key={item.name} r="4" stroke="white" strokeWidth="2" />
                ))}
                <g transform={`translate(${tooltipX} ${tooltipY})`}>
                  <rect className="fill-white stroke-slate-200 drop-shadow-md" height={tooltipHeight} rx="8" width={tooltipWidth} />
                  <text className="fill-slate-500 text-[11px] font-black uppercase" x="12" y="18">
                    X: {timeLabelForIndex(activePointIndex)}
                  </text>
                  {activeValues.map((item, index) => (
                    <g key={item.name} transform={`translate(12 ${38 + index * 20})`}>
                      <circle cx="0" cy="-4" fill={item.color} r="4" />
                      <text className="fill-slate-700 text-[11px] font-bold" x="10" y="0">
                        {item.name}
                      </text>
                      <text className="fill-slate-950 text-[11px] font-black" textAnchor="end" x={tooltipWidth - 24} y="0">
                        Y: {compactNumber(item.value, 0)}
                      </text>
                    </g>
                  ))}
                </g>
              </g>
            ) : null}
          </svg>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {displayedMetrics.map((metric) => (
          <span className="inline-flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm" key={metric.device.id}>
            <span className="h-2 w-5 rounded-full" style={{ backgroundColor: metric.color }} />
            {metric.device.name}
            <span className="text-slate-400">{compactNumber(metric.trend.at(-1) ?? 0, 0)}</span>
          </span>
          ))}
      </div>
    </DashboardCard>
  );
}

function DetailTable({ metrics, totalEnergy }: { metrics: PanelMetric[]; totalEnergy: number }) {
  return (
    <DashboardCard className="p-5">
      <h2 className="text-base font-black text-slate-950">Panel Detail</h2>
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
                  <Link className="font-bold text-slate-950 hover:text-sky-600" href={`/power-monitoring/devices/${metric.device.id}`}>
                    {metric.device.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right font-bold">{compactNumber(metric.energy, 0)}</td>
                <td className="px-4 py-3 text-right">{metric.percent.toFixed(1)}%</td>
                <td className="px-4 py-3 text-right">{formatNumber(metric.power)}</td>
                <td className="px-4 py-3 text-right">{formatNumber(metric.current)}</td>
                <td className="px-4 py-3 text-right">{formatNumber(metric.voltage)}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2 font-bold">
                    <span className={`size-2.5 rounded-full ${statusClasses(metric.device.status)}`} />
                    {statusLabel(metric.device.status)}
                  </span>
                </td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 text-slate-900">
              <td className="px-4 py-3" />
              <td className="px-4 py-3 font-black">Total</td>
              <td className="px-4 py-3 text-right font-black">{compactNumber(totalEnergy, 0)}</td>
              <td className="px-4 py-3 text-right font-black">{totalEnergy > 0 ? "100%" : "0%"}</td>
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
    <div className="energy-light-surface -m-4 min-h-[calc(100vh-96px)] bg-[#eef4fb] p-4 text-slate-900 md:-m-6 md:p-6">
      <div className="mx-auto max-w-[1520px] space-y-4">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
          <div className="grid gap-5 p-5 xl:grid-cols-[1fr_auto] xl:items-center">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">Energy Monitoring System</p>
                <h1 className="mt-1 text-2xl font-black text-slate-950">Energy Consumption per Panel</h1>
                <p className="mt-1 max-w-2xl text-sm font-semibold text-slate-500">Compare each panel, track consumption trend, and keep device totals dynamic.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 xl:justify-end">
              <div className="w-[230px]">
                <DatePicker
                  className="h-10 border-slate-200 bg-white pr-11 text-sm font-bold text-slate-700 shadow-sm shadow-slate-200/60 focus:border-orange-400 focus:ring-orange-400/15 dark:border-slate-200 dark:bg-white dark:text-slate-700 dark:focus:border-orange-400"
                  dateFormat="d M Y"
                  defaultDate={selectedDate}
                  id="energy-dashboard-date"
                  onChange={handleDateChange}
                  placeholder="Select date"
                />
              </div>
              <button className="h-10 rounded-lg bg-[#2f8cff] px-4 text-sm font-black text-white shadow-lg shadow-sky-500/20 disabled:opacity-60" disabled={loading} onClick={() => void load()} type="button">
                {loading ? "Refreshing" : "Refresh"}
              </button>
            </div>
          </div>
          <div className="grid border-t border-slate-100 bg-slate-50/80 p-4 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <OverviewStat accent="#2f8cff" label="Total Energy" note={`${summary?.total_devices ?? 0} registered devices`} unit="kWh" value={compactNumber(totalEnergy, 0)} />
            <OverviewStat accent="#2fca6d" label="Online Devices" note="Recent valid telemetry" value={summary?.online ?? 0} />
            <OverviewStat accent="#ffb020" label="Warning" note={`${summary?.offline ?? 0} offline`} value={summary?.warning ?? 0} />
            <OverviewStat accent="#16c7c8" label="Active Power" note="Combined live load" unit="kW" value={formatNumber(summary?.total_active_power_kw)} />
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_380px]">
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
