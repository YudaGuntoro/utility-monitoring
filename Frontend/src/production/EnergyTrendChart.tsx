"use client";

import { useEffect, useId, useRef, useState } from "react";

type Metric = { device: { id: number; name: string }; color: string; energy: number; trend: number[] };
const format = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
const axisFormat = (value: number) => value >= 1000000 ? `${format(value / 1000000)}m` : value >= 1000 ? `${format(value / 1000)}k` : format(value);

export default function EnergyTrendChart({ metrics }: { metrics: Metric[] }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hidden, setHidden] = useState<number[]>([]);
  const id = useId().replace(/:/g, "");
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  const panels = [...metrics].sort((a, b) => b.energy - a.energy).slice(0, 6);
  const visible = panels.filter(m => !hidden.includes(m.device.id));
  const height = 300;
  const padding = { left: 44, top: 24, right: 16, bottom: 34 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const rawMax = Math.max(1, ...visible.flatMap(m => m.trend));
  const magnitude = 10 ** Math.floor(Math.log10(rawMax / 4));
  const normalizedStep = rawMax / 4 / magnitude;
  const step = ([1, 1.25, 1.5, 2, 2.5, 5, 10].find(value => value >= normalizedStep) ?? 10) * magnitude;
  const max = step * 4;
  const count = Math.max(0, ...visible.map(m => m.trend.length));
  const x = (index: number, length = count) => padding.left + index / Math.max(1, length - 1) * plotWidth;
  const y = (value: number) => padding.top + plotHeight * (1 - value / max);
  const active = activeIndex == null || count === 0 ? null : Math.min(activeIndex, count - 1);
  const activeX = active == null ? null : x(active);
  const tooltipWidth = Math.min(252, width - 16);
  const tooltipLeft = activeX == null ? 0 : Math.max(8, Math.min(width - tooltipWidth - 8, activeX > width / 2 ? activeX - tooltipWidth - 18 : activeX + 18));
  const values = active == null ? [] : visible.filter(m => m.trend.length).map(m => ({ ...m, value: m.trend[Math.round(active / Math.max(1, count - 1) * (m.trend.length - 1))] }));
  const latestTotal = visible.reduce((sum, m) => sum + (m.trend.at(-1) ?? 0), 0);
  const hourLabel = (index: number) => `${String(Math.round(index / Math.max(1, count - 1) * 23)).padStart(2, "0")}:00`;
  const pathFor = (points: number[]) => points.reduce((path, point, index) => {
    if (!index) return `M${x(index, points.length)},${y(point)}`;
    const mid = (x(index - 1, points.length) + x(index, points.length)) / 2;
    return `${path} C${mid},${y(points[index - 1])} ${mid},${y(point)} ${x(index, points.length)},${y(point)}`;
  }, "");
  const move = (clientX: number) => {
    const left = container.current?.getBoundingClientRect().left ?? 0;
    const ratio = Math.max(0, Math.min(1, (clientX - left - padding.left) / plotWidth));
    setActiveIndex(Math.round(ratio * Math.max(0, count - 1)));
  };

  return <section className="min-w-0 overflow-hidden rounded-lg border border-[#dfe5ee] bg-white shadow-sm" aria-labelledby={`${id}-title`}>
    <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
      <div><h2 id={`${id}-title`} className="text-sm font-semibold text-slate-700">Energy consumption trend</h2>
        <p className="mt-1 text-xs text-slate-500">Selected day · Top {panels.length} panels by consumption</p></div>
      <div className="text-right"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Latest total · visible panels</p>
        <p className="mt-1 text-xl font-medium tabular-nums tracking-tight text-slate-700">{format(latestTotal)} <span className="text-xs font-normal text-slate-400">kWh</span></p></div>
    </div>

    <div className="px-3 pt-5 sm:px-5">
      <div className="flex justify-between px-1 text-[10px] font-medium text-slate-400"><span>ENERGY · kWh</span><span className="hidden sm:block">Hover to inspect · Click legend to filter</span></div>
      <div ref={container} className="relative mt-1 w-full">
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}
          role="img" aria-label="Energy consumption by panel in kWh. Use left and right arrow keys to inspect readings." tabIndex={0}
          className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          onPointerMove={event => move(event.clientX)} onPointerLeave={() => setActiveIndex(null)}
          onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setActiveIndex(current => Math.max(0, Math.min(count - 1, (current ?? 0) + (event.key === "ArrowRight" ? 1 : -1)))); } if (event.key === "Escape") setActiveIndex(null); }}
          onBlur={() => setActiveIndex(null)}>
          <defs>
            <clipPath id={`${id}-clip`}><rect x={padding.left - 4} y={padding.top - 4} width={plotWidth + 8} height={plotHeight + 8} /></clipPath>
            {visible.map(m => <linearGradient key={m.device.id} id={`${id}-area-${m.device.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={m.color} stopOpacity="0.18" /><stop offset="100%" stopColor={m.color} stopOpacity="0.015" /></linearGradient>)}
          </defs>
          {[0, 1, 2, 3, 4].map(index => <g key={index}>
            <line x1={padding.left} x2={width - padding.right} y1={y(index * step)} y2={y(index * step)} stroke={index === 0 ? "#e2e8f0" : "#edf1f6"} strokeDasharray={index === 0 ? undefined : "3 5"} />
            <text x={padding.left - 10} y={y(index * step) + 4} textAnchor="end" fill="#94a3b8" fontSize="11" fontWeight="500">{axisFormat(index * step)}</text>
          </g>)}
          {(width < 460 ? [0, 12, 23] : [0, 4, 8, 12, 16, 20, 23]).map(hour => <text key={hour} x={padding.left + hour / 23 * plotWidth} y={height - 10} textAnchor={hour === 0 ? "start" : hour === 23 ? "end" : "middle"} fill="#94a3b8" fontSize="11" fontWeight="500">{String(hour).padStart(2, "0")}:00</text>)}
          <g clipPath={`url(#${id}-clip)`}>
            {visible.filter(m => m.trend.length > 1).map(m => <path key={`area-${m.device.id}`} d={`${pathFor(m.trend)} L${x(m.trend.length - 1, m.trend.length)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${id}-area-${m.device.id})`} />)}
            {visible.map(m => <g key={m.device.id}>
            <path d={pathFor(m.trend)} fill="none" stroke={m.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {m.trend.length > 0 && <circle cx={x(m.trend.length - 1, m.trend.length)} cy={y(m.trend.at(-1) ?? 0)} r="3.5" fill={m.color} stroke="white" strokeWidth="2" />}
          </g>)}</g>
          {activeX != null && <g><line x1={activeX} x2={activeX} y1={padding.top} y2={height - padding.bottom} stroke="#cbd5e1" strokeDasharray="3 4" />
            {values.map(m => <g key={m.device.id}><circle cx={activeX} cy={y(m.value)} r="7" fill={m.color} fillOpacity="0.12" /><circle cx={activeX} cy={y(m.value)} r="4" fill={m.color} stroke="white" strokeWidth="2" /></g>)}
          </g>}
        </svg>
        {active != null && values.length > 0 && <div role="status" className="pointer-events-none absolute top-3 z-10 rounded-xl border border-slate-200/80 bg-white/95 p-3 shadow-xl shadow-slate-900/10 backdrop-blur-sm" style={{ left: tooltipLeft, width: tooltipWidth }}>
          <p className="mb-2 border-b border-slate-100 pb-2 text-xs font-semibold text-slate-500">{hourLabel(active)} <span className="float-right font-normal text-slate-400">Energy · kWh</span></p>
          <div className="space-y-2">{values.map(m => <div key={m.device.id} className="flex items-center gap-2 text-xs"><span className="size-2 shrink-0 rounded-full" style={{ background: m.color }} /><span className="min-w-0 flex-1 truncate text-slate-600">{m.device.name}</span><span className="font-semibold tabular-nums text-slate-900">{format(m.value)}</span></div>)}</div>
        </div>}
        {count === 0 && <div className="absolute inset-0 flex items-center justify-center pb-5 pl-8 text-sm text-slate-400">{panels.length ? "Select a panel below to show its trend" : "No panel data available"}</div>}
      </div>
    </div>

    <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 bg-slate-50/40 px-5 py-4 sm:px-6">
      {panels.map(m => <button key={m.device.id} type="button" aria-pressed={!hidden.includes(m.device.id)}
        onClick={() => { setHidden(current => current.includes(m.device.id) ? current.filter(value => value !== m.device.id) : [...current, m.device.id]); setActiveIndex(null); }}
        className={`inline-flex items-center gap-2 rounded py-1 text-xs transition focus-visible:outline-2 focus-visible:outline-blue-400 ${hidden.includes(m.device.id) ? "text-slate-400 opacity-50" : "text-slate-600 hover:text-slate-950"}`}>
        <span className="h-0.5 w-4 rounded-full" style={{ background: m.color }} /><span className={hidden.includes(m.device.id) ? "line-through" : ""}>{m.device.name}</span>
      </button>)}
    </div>
  </section>;
}
