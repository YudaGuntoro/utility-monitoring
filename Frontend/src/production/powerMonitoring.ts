import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";

export type PowerTelemetry = {
  timestamp: string;
  voltage_l1n?: number | null;
  voltage_l2n?: number | null;
  voltage_l3n?: number | null;
  voltage_l1l2?: number | null;
  voltage_l2l3?: number | null;
  voltage_l3l1?: number | null;
  current_l1?: number | null;
  current_l2?: number | null;
  current_l3?: number | null;
  current_neutral?: number | null;
  active_power_kw?: number | null;
  reactive_power_kvar?: number | null;
  apparent_power_kva?: number | null;
  power_factor?: number | null;
  frequency_hz?: number | null;
  energy_import_kwh?: number | null;
  energy_export_kwh?: number | null;
  received_at?: string | null;
  updated_at?: string | null;
};

export type PowerDevice = {
  id: number;
  device_code: string;
  name: string;
  model: string;
  location?: string | null;
  gateway_id?: string | null;
  mqtt_topic: string;
  status: "online" | "offline" | "warning";
  enabled: boolean;
  last_seen?: string | null;
  created_at?: string;
  updated_at?: string;
  latest?: PowerTelemetry | null;
};

export type PowerDashboard = {
  summary: {
    total_devices: number;
    online: number;
    offline: number;
    warning: number;
    total_active_power_kw: number;
    total_energy_import_kwh: number;
  };
  devices: PowerDevice[];
};

export type PowerUsageRate = {
  average_kwh?: number | null;
  total_kwh?: number | null;
  samples: number;
  from?: string | null;
  to?: string | null;
};

export type PowerUsageSummary = {
  calculated_at: string;
  unit: "kWh";
  hourly: PowerUsageRate;
  daily: PowerUsageRate;
  weekly: PowerUsageRate;
  monthly: PowerUsageRate;
};

export type PowerDeviceInput = {
  device_code: string;
  name: string;
  model: string;
  location: string;
  gateway_id: string;
  mqtt_topic: string;
  enabled: boolean;
};

export const topicForDevice = (deviceCode: string) => `utility/power/${deviceCode.trim().toUpperCase()}/telemetry`;

export const powerApi = {
  dashboard: () => apiGet<PowerDashboard>("/api/power/dashboard"),
  devices: () => apiGet<PowerDevice[]>("/api/power/devices"),
  device: (id: number | string) => apiGet<PowerDevice>(`/api/power/devices/${id}`),
  history: (id: number | string, start: string, end: string) =>
    apiGet<PowerTelemetry[]>(`/api/power/devices/${id}/history?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
  usageSummary: (id: number | string) => apiGet<PowerUsageSummary>(`/api/power/devices/${id}/usage-summary`),
  createDevice: (input: PowerDeviceInput) => apiPost<PowerDevice>("/api/power/devices", input),
  updateDevice: (id: number, input: PowerDeviceInput) => apiPut<PowerDevice>(`/api/power/devices/${id}`, input),
  deleteDevice: (id: number) => apiDelete<{ id: number }>(`/api/power/devices/${id}`),
};

export function formatNumber(value?: number | null, digits = 1) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "-";
}

export function average(values: Array<number | null | undefined>) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return numbers.length ? numbers.reduce((total, value) => total + value, 0) / numbers.length : null;
}
