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

type DummyTelemetrySeed = {
  activePower: number;
  code: string;
  current: number;
  energy: number;
  id: number;
  location: string;
  name: string;
  status: PowerDevice["status"];
  voltage: number;
};

export const topicForDevice = (deviceCode: string) => `utility/power/${deviceCode.trim().toUpperCase()}/telemetry`;

const DUMMY_DEVICE_SEED = [
  { activePower: 72, code: "PM-01", current: 125, energy: 2850, id: 9001, location: "Production Area 1", name: "Production 1", status: "online" as const, voltage: 398 },
  { activePower: 48, code: "PM-02", current: 85, energy: 1920, id: 9002, location: "Production Area 2", name: "Production 2", status: "online" as const, voltage: 401 },
  { activePower: 91, code: "PM-03", current: 160, energy: 1680, id: 9003, location: "Compressor Room", name: "Compressor", status: "warning" as const, voltage: 402 },
  { activePower: 28, code: "PM-04", current: 60, energy: 1200, id: 9004, location: "Utility Roof Deck", name: "HVAC", status: "warning" as const, voltage: 395 },
  { activePower: 22, code: "PM-05", current: 45, energy: 800, id: 9005, location: "Main Utility Room", name: "Utility", status: "online" as const, voltage: 400 },
];

const LOCAL_DEMO_DEVICES_KEY = "energy-monitoring-system-demo-devices";

function dummyTimestamp(hoursAgo = 0) {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

function dummyTelemetry(seed: DummyTelemetrySeed, index = 0, hoursAgo = 0): PowerTelemetry {
  const drift = Math.sin(index / 2) * 0.035 + Math.cos(index / 5) * 0.02;
  const power = seed.activePower * (1 + drift);
  const voltage = seed.voltage + Math.sin(index / 3) * 2;
  const current = seed.current * (1 + drift);

  return {
    active_power_kw: Number(power.toFixed(3)),
    apparent_power_kva: Number((power / 0.92).toFixed(3)),
    current_l1: Number((current * 0.98).toFixed(3)),
    current_l2: Number((current * 1.01).toFixed(3)),
    current_l3: Number((current * 1.03).toFixed(3)),
    current_neutral: Number((Math.abs(Math.sin(index)) * 1.5).toFixed(3)),
    energy_export_kwh: Number((seed.energy * 0.002).toFixed(3)),
    energy_import_kwh: Number((seed.energy - hoursAgo * power * 0.65).toFixed(3)),
    frequency_hz: Number((50 + Math.sin(index / 4) * 0.05).toFixed(3)),
    power_factor: Number((0.9 + Math.abs(Math.sin(index / 6)) * 0.06).toFixed(3)),
    reactive_power_kvar: Number((power * 0.32).toFixed(3)),
    received_at: dummyTimestamp(hoursAgo),
    timestamp: dummyTimestamp(hoursAgo),
    updated_at: dummyTimestamp(hoursAgo),
    voltage_l1l2: Number((voltage * 1.73).toFixed(3)),
    voltage_l1n: Number(voltage.toFixed(3)),
    voltage_l2l3: Number((voltage * 1.73 + 1).toFixed(3)),
    voltage_l2n: Number((voltage + 1).toFixed(3)),
    voltage_l3l1: Number((voltage * 1.73 - 1).toFixed(3)),
    voltage_l3n: Number((voltage - 1).toFixed(3)),
  };
}

function dummyDevices(): PowerDevice[] {
  return DUMMY_DEVICE_SEED.map((seed, index) => ({
    device_code: seed.code,
    enabled: true,
    gateway_id: index < 3 ? "GW-01" : "GW-02",
    id: seed.id,
    last_seen: dummyTimestamp(),
    latest: dummyTelemetry(seed, 24),
    location: seed.location,
    model: "Schneider PM8000 / PM8240",
    mqtt_topic: topicForDevice(seed.code),
    name: seed.name,
    status: seed.status,
  }));
}

function readLocalDemoDevices(): PowerDevice[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(LOCAL_DEMO_DEVICES_KEY);
    return raw ? (JSON.parse(raw) as PowerDevice[]) : [];
  } catch {
    return [];
  }
}

function writeLocalDemoDevices(devices: PowerDevice[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_DEMO_DEVICES_KEY, JSON.stringify(devices));
}

function demoDevices() {
  const devicesById = new Map<number, PowerDevice>();
  for (const device of dummyDevices()) devicesById.set(device.id, device);
  for (const device of readLocalDemoDevices()) devicesById.set(device.id, device);
  return Array.from(devicesById.values()).sort((a, b) => a.device_code.localeCompare(b.device_code));
}

function dummyDashboard(): PowerDashboard {
  const devices = demoDevices();
  return {
    devices,
    summary: {
      offline: devices.filter((device) => device.status === "offline").length,
      online: devices.filter((device) => device.status === "online").length,
      total_active_power_kw: devices.reduce((total, device) => total + (device.latest?.active_power_kw ?? 0), 0),
      total_devices: devices.length,
      total_energy_import_kwh: devices.reduce((total, device) => total + (device.latest?.energy_import_kwh ?? 0), 0),
      warning: devices.filter((device) => device.status === "warning").length,
    },
  };
}

function dummyHistory(id: number | string): PowerTelemetry[] {
  const localDevice = readLocalDemoDevices().find((device) => device.id === Number(id));
  const seed = DUMMY_DEVICE_SEED.find((item) => item.id === Number(id)) ?? {
    activePower: localDevice?.latest?.active_power_kw ?? 35,
    code: localDevice?.device_code ?? "PM-00",
    current: localDevice?.latest?.current_l1 ?? 70,
    energy: localDevice?.latest?.energy_import_kwh ?? 1200,
    id: Number(id),
    location: localDevice?.location ?? "Demo Area",
    name: localDevice?.name ?? "Demo Panel",
    status: localDevice?.status ?? "online",
    voltage: localDevice?.latest?.voltage_l1n ?? 400,
  };
  return Array.from({ length: 24 }, (_, index) => dummyTelemetry(seed, index, 23 - index));
}

function dummyUsageSummary(id: number | string): PowerUsageSummary {
  const localDevice = readLocalDemoDevices().find((device) => device.id === Number(id));
  const seed = DUMMY_DEVICE_SEED.find((item) => item.id === Number(id)) ?? {
    activePower: localDevice?.latest?.active_power_kw ?? 35,
    code: localDevice?.device_code ?? "PM-00",
    current: localDevice?.latest?.current_l1 ?? 70,
    energy: localDevice?.latest?.energy_import_kwh ?? 1200,
    id: Number(id),
    location: localDevice?.location ?? "Demo Area",
    name: localDevice?.name ?? "Demo Panel",
    status: localDevice?.status ?? "online",
    voltage: localDevice?.latest?.voltage_l1n ?? 400,
  };
  const daily = seed.energy * 0.11;
  return {
    calculated_at: dummyTimestamp(),
    daily: { average_kwh: Number(daily.toFixed(3)), samples: 24, total_kwh: Number(daily.toFixed(3)), from: dummyTimestamp(24), to: dummyTimestamp() },
    hourly: { average_kwh: Number((daily / 24).toFixed(3)), samples: 24, total_kwh: Number(daily.toFixed(3)), from: dummyTimestamp(24), to: dummyTimestamp() },
    monthly: { average_kwh: Number((daily * 30).toFixed(3)), samples: 720, total_kwh: Number((daily * 30).toFixed(3)), from: dummyTimestamp(24 * 30), to: dummyTimestamp() },
    unit: "kWh",
    weekly: { average_kwh: Number((daily * 7).toFixed(3)), samples: 168, total_kwh: Number((daily * 7).toFixed(3)), from: dummyTimestamp(24 * 7), to: dummyTimestamp() },
  };
}

function isDummyId(id: number | string) {
  return demoDevices().some((device) => device.id === Number(id));
}

function shouldUseLocalFallback(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("status 404") || message.includes("status 502") || message.includes("Failed to fetch") || message.includes("Backend request failed");
}

function localDeviceFromInput(input: PowerDeviceInput, id = Date.now()): PowerDevice {
  const seed = {
    activePower: 35 + (id % 20),
    code: input.device_code,
    current: 70 + (id % 30),
    energy: 1000 + (id % 900),
    id,
    location: input.location || "Demo Area",
    name: input.name || `Energy Meter ${input.device_code}`,
    status: "online" as const,
    voltage: 398 + (id % 5),
  };

  return {
    device_code: input.device_code,
    enabled: input.enabled,
    gateway_id: input.gateway_id,
    id,
    last_seen: dummyTimestamp(),
    latest: dummyTelemetry(seed, 18),
    location: input.location,
    model: input.model || "Schneider PM8000 / PM8240",
    mqtt_topic: input.mqtt_topic || topicForDevice(input.device_code),
    name: input.name || `Energy Meter ${input.device_code}`,
    status: input.enabled ? "online" : "offline",
  };
}

function upsertLocalDemoDevice(input: PowerDeviceInput, id?: number) {
  const devices = readLocalDemoDevices();
  const nextDevice = localDeviceFromInput(input, id ?? Date.now());
  const withoutCurrent = devices.filter((device) => device.id !== nextDevice.id && device.device_code !== nextDevice.device_code);
  const nextDevices = [...withoutCurrent, nextDevice];
  writeLocalDemoDevices(nextDevices);
  return nextDevice;
}

function deleteLocalDemoDevice(id: number) {
  const devices = readLocalDemoDevices();
  writeLocalDemoDevices(devices.filter((device) => device.id !== id));
  return { id };
}

export const powerApi = {
  dashboard: async () => {
    try {
      const dashboard = await apiGet<PowerDashboard>("/api/power/dashboard");
      return dashboard.devices.length > 0 ? dashboard : dummyDashboard();
    } catch {
      return dummyDashboard();
    }
  },
  devices: async () => {
    try {
      const devices = await apiGet<PowerDevice[]>("/api/power/devices");
      return devices.length > 0 ? devices : demoDevices();
    } catch {
      return demoDevices();
    }
  },
  device: async (id: number | string) => {
    if (isDummyId(id)) {
      return demoDevices().find((device) => device.id === Number(id))!;
    }
    return apiGet<PowerDevice>(`/api/power/devices/${id}`);
  },
  history: (id: number | string, start: string, end: string) =>
    isDummyId(id)
      ? Promise.resolve(dummyHistory(id))
      : apiGet<PowerTelemetry[]>(`/api/power/devices/${id}/history?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
  usageSummary: (id: number | string) =>
    isDummyId(id) ? Promise.resolve(dummyUsageSummary(id)) : apiGet<PowerUsageSummary>(`/api/power/devices/${id}/usage-summary`),
  createDevice: async (input: PowerDeviceInput) => {
    try {
      return await apiPost<PowerDevice>("/api/power/devices", input);
    } catch (error) {
      if (!shouldUseLocalFallback(error)) throw error;
      return upsertLocalDemoDevice(input);
    }
  },
  updateDevice: async (id: number, input: PowerDeviceInput) => {
    if (isDummyId(id)) return upsertLocalDemoDevice(input, id);
    try {
      return await apiPut<PowerDevice>(`/api/power/devices/${id}`, input);
    } catch (error) {
      if (!shouldUseLocalFallback(error)) throw error;
      return upsertLocalDemoDevice(input, id);
    }
  },
  deleteDevice: async (id: number) => {
    if (isDummyId(id)) return deleteLocalDemoDevice(id);
    try {
      return await apiDelete<{ id: number }>(`/api/power/devices/${id}`);
    } catch (error) {
      if (!shouldUseLocalFallback(error)) throw error;
      return deleteLocalDemoDevice(id);
    }
  },
};

export function formatNumber(value?: number | null, digits = 1) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "-";
}

export function average(values: Array<number | null | undefined>) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return numbers.length ? numbers.reduce((total, value) => total + value, 0) / numbers.length : null;
}
