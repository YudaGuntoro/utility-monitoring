import { apiGet, apiRequest } from "@/lib/api";

export type BackupSchedule = "daily" | "weekly" | "monthly";

export type UnitSettings = {
  pressureUnit: string;
  cycleTimeUnit: string;
};

export type TimezoneOption = "Asia/Jakarta" | "Asia/Bangkok" | "UTC";

export type SystemSettings = UnitSettings & {
  accUnit: string;
  atrhUnit: string;
  autoCleanupEnabled: boolean;
  backupDbLocation: string;
  bufferWarningLimit: number;
  endpointDownWarningSeconds: number;
  electricityRatePerKwh: number;
  logRetentionDays: number;
  mainApiEndpoint: string;
  mainApiToken: string;
  maxBufferRecords: number;
  maxRetry: number;
  plcIpAddress: string;
  retryDelaySeconds: number;
  schedule: BackupSchedule;
  sensorOfflineSeconds: number;
  tiltUnit: string;
  timezone: TimezoneOption;
  uploadBatchSize: number;
  uploadEnabled: boolean;
  uploadFailedWarningLimit: number;
  uploadIntervalSeconds: number;
  uploadTimeoutSeconds: number;
  vwUnit: string;
};

export const SYSTEM_SETTINGS_STORAGE_KEY = "shms-system-backup-settings";

export const defaultSystemSettings: SystemSettings = {
  accUnit: "g",
  atrhUnit: "C / %RH",
  autoCleanupEnabled: true,
  backupDbLocation: "",
  bufferWarningLimit: 1000,
  cycleTimeUnit: "s",
  endpointDownWarningSeconds: 300,
  electricityRatePerKwh: 0,
  logRetentionDays: 30,
  mainApiEndpoint: "",
  mainApiToken: "",
  maxBufferRecords: 50000,
  maxRetry: 5,
  plcIpAddress: "",
  pressureUnit: "MPa",
  retryDelaySeconds: 30,
  schedule: "daily",
  sensorOfflineSeconds: 60,
  tiltUnit: "deg",
  timezone: "Asia/Jakarta",
  uploadBatchSize: 100,
  uploadEnabled: true,
  uploadFailedWarningLimit: 10,
  uploadIntervalSeconds: 10,
  uploadTimeoutSeconds: 15,
  vwUnit: "Hz",
};

type ApiSystemSettings = {
  pressure_unit: string;
  cycle_time_unit: string;
  backup_db_location: string;
  backup_schedule: BackupSchedule;
  electricity_rate_per_kwh?: number | null;
  plc_ip_address?: string | null;
};

function fromApiSettings(settings: ApiSystemSettings, fallback: SystemSettings = defaultSystemSettings): SystemSettings {
  return {
    ...fallback,
    backupDbLocation: settings.backup_db_location ?? "",
    cycleTimeUnit: settings.cycle_time_unit ?? fallback.cycleTimeUnit,
    electricityRatePerKwh: Number(settings.electricity_rate_per_kwh ?? fallback.electricityRatePerKwh),
    plcIpAddress: settings.plc_ip_address ?? "",
    pressureUnit: settings.pressure_unit ?? fallback.pressureUnit,
    schedule: settings.backup_schedule ?? fallback.schedule,
  };
}

function toApiSettings(settings: SystemSettings) {
  return {
    backup_db_location: settings.backupDbLocation,
    backup_schedule: settings.schedule,
    cycle_time_unit: settings.cycleTimeUnit,
    electricity_rate_per_kwh: settings.electricityRatePerKwh,
    plc_ip_address: settings.plcIpAddress,
    pressure_unit: settings.pressureUnit,
  };
}

export function readSystemSettings(): SystemSettings {
  if (typeof window === "undefined") {
    return defaultSystemSettings;
  }

  try {
    const stored = window.localStorage.getItem(SYSTEM_SETTINGS_STORAGE_KEY);
    return stored ? { ...defaultSystemSettings, ...JSON.parse(stored) } : defaultSystemSettings;
  } catch {
    return defaultSystemSettings;
  }
}

export function saveSystemSettings(settings: SystemSettings) {
  window.localStorage.setItem(SYSTEM_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export async function fetchSystemSettings() {
  const localSettings = readSystemSettings();

  try {
    const settings = fromApiSettings(await apiGet<ApiSystemSettings>("/api/shms-system/settings"), localSettings);
    saveSystemSettings(settings);
    return settings;
  } catch {
    return localSettings;
  }
}

export async function updateSystemSettings(settings: SystemSettings) {
  saveSystemSettings(settings);

  try {
    const updated = fromApiSettings(await apiRequest<ApiSystemSettings>("/api/shms-system/settings", {
      body: JSON.stringify(toApiSettings(settings)),
      method: "PUT",
    }), settings);
    saveSystemSettings(updated);
    return updated;
  } catch {
    return settings;
  }
}

export function getUnitSettings(): UnitSettings {
  const settings = readSystemSettings();
  return {
    cycleTimeUnit: settings.cycleTimeUnit,
    pressureUnit: settings.pressureUnit,
  };
}

export function displayNumber(value: number, fractionDigits = 2) {
  return Number(value).toFixed(fractionDigits);
}

export function displayUnitlessText(value?: string | null) {
  if (!value || !value.trim()) {
    return "-";
  }

  return value
    .replace(/\s*\b(MPa|kPa|Pa|bar|psi)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
