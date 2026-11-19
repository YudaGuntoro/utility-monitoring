"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { ConfirmModal } from "@/components/ui/modal/ConfirmModal";
import { useToast } from "@/context/ToastContext";
import { CheckLineIcon, PaperPlaneIcon, TrashBinIcon } from "@/icons";
import { apiGet } from "@/lib/api";
import LicenseSettings from "./LicenseSettings";
import {
  fetchMqttConfiguration,
  readMqttConfiguration,
  updateMqttConfiguration,
  type MqttConfiguration,
  type MqttSensorCode,
  type MqttSensorTopic,
} from "./mqttConfiguration";
import {
  DEFAULT_BRAND_LOGO_SRC,
  fetchSystemSettings,
  normalizeBrandLogoUrl,
  readSystemSettings,
  updateSystemSettings,
  type SystemSettings,
  type TimezoneOption,
} from "./settings";

const inputClass = "mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-3 focus:ring-brand-500/20";
const tableInputClass = "h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-3 focus:ring-brand-500/20";
const labelClass = "text-xs font-bold uppercase text-slate-600";
const cardClass = "overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm";

type HealthState = "online" | "offline" | "unknown";

type UtilityStatus = {
  last_mqtt_at?: string | null;
};

type MqttBrokerStatus = {
  configured: boolean;
  host?: string;
  online: boolean;
  port?: number;
};

const sensorDescriptions: Record<MqttSensorCode, string> = {
  POWER: "Power meter telemetry: voltage, current, power, and energy.",
  WATER: "Water meter flow, cumulative volume, and pressure.",
  AIR: "Compressed air flow, pressure, temperature, and compressor power.",
  ACC: "Acceleration raw data.",
  ATRH: "Air temperature and relative humidity raw data.",
  TILT: "Tilt raw data.",
  VW: "Vibrating wire raw data.",
};

function numericValue(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatStatus(status: HealthState) {
  if (status === "online") return "Online";
  if (status === "offline") return "Offline";
  return "Waiting";
}

function statusClass(status: HealthState) {
  if (status === "online") {
    return "bg-teal-50 text-teal-700 ring-teal-600/15";
  }

  if (status === "offline") {
    return "bg-red-50 text-red-700 ring-red-600/15";
  }

  return "bg-slate-100 text-slate-600 ring-slate-500/15";
}

function SettingSection({ children, eyebrow, title }: { children: ReactNode; eyebrow?: string; title: string }) {
  return (
    <section className={cardClass}>
      <div className="border-b border-slate-200 px-5 py-5">
        {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">{eyebrow}</p> : null}
        <h2 className={eyebrow ? "mt-2 text-base font-bold text-slate-900" : "text-base font-bold text-slate-900"}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function ToggleField({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-sm font-bold text-slate-800">{label}</span>
      <input
        checked={checked}
        className="size-5 accent-brand-500"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}

function StatusCard({ label, note, status }: { label: string; note: string; status: HealthState }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ring-1 ${statusClass(status)}`}>
        <span className={`size-2 rounded-full ${status === "online" ? "bg-teal-600" : status === "offline" ? "bg-red-600" : "bg-slate-400"}`} />
        {formatStatus(status)}
      </span>
      <p className="mt-4 text-sm font-bold text-slate-900">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-slate-500">{note}</p>
    </div>
  );
}

export default function SettingPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<SystemSettings>(() => readSystemSettings());
  const [mqttConfiguration, setMqttConfiguration] = useState<MqttConfiguration>(() => readMqttConfiguration());
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingEndpoint, setTestingEndpoint] = useState(false);
  const [brokerStatus, setBrokerStatus] = useState<HealthState>("unknown");
  const [backendStatus, setBackendStatus] = useState<HealthState>("unknown");
  const [lastMqttAt, setLastMqttAt] = useState<string | null>(null);
  const [logoFileName, setLogoFileName] = useState("");
  const logoPreviewSrc = useMemo(
    () => normalizeBrandLogoUrl(settings.brandLogoUrl) || settings.brandLogoDataUrl || DEFAULT_BRAND_LOGO_SRC,
    [settings.brandLogoDataUrl, settings.brandLogoUrl],
  );

  useEffect(() => {
    let ignore = false;
    void fetchSystemSettings().then((result) => {
      if (!ignore) {
        setSettings(result);
      }
    });

    void fetchMqttConfiguration().then((result) => {
      if (!ignore) {
        setMqttConfiguration(result);
      }
    });

    async function loadSystemInfo() {
      const [statusResult, brokerResult] = await Promise.allSettled([
        apiGet<UtilityStatus>("/api/utility-system/status"),
        apiGet<MqttBrokerStatus>("/api/utility-system/mqtt-broker/status"),
      ]);

      if (ignore) {
        return;
      }

      setBackendStatus(statusResult.status === "fulfilled" ? "online" : "offline");
      setLastMqttAt(statusResult.status === "fulfilled" ? statusResult.value.last_mqtt_at ?? null : null);
      setBrokerStatus(brokerResult.status === "fulfilled" && brokerResult.value.online ? "online" : "offline");
    }

    void loadSystemInfo();

    return () => {
      ignore = true;
    };
  }, []);

  function patchSettings(patch: Partial<SystemSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
  }

  function handleLogoFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error({ message: "Please select an image file." });
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error({ message: "Logo image must be 1 MB or smaller." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      patchSettings({ brandLogoDataUrl: String(reader.result ?? ""), brandLogoUrl: "" });
      setLogoFileName(file.name);
    };
    reader.onerror = () => toast.error({ message: "Failed to read the image. Please try again." });
    reader.readAsDataURL(file);
  }

  function updateMqttTopic(code: MqttSensorCode, patch: Partial<MqttSensorTopic>) {
    setMqttConfiguration((current) => ({
      ...current,
      topics: current.topics.map((topic) => (topic.code === code ? { ...topic, ...patch } : topic)),
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const emptyTopic = mqttConfiguration.topics.find((topic) => topic.enabled && !topic.topic.trim());
    if (emptyTopic) {
      toast.error({ message: `MQTT topic for ${emptyTopic.code} is required.` });
      return;
    }

    setIsConfirmOpen(true);
  }

  async function confirmSave() {
    setSaving(true);
    try {
      setSettings(await updateSystemSettings({
        ...settings,
        brandLogoUrl: "",
      }));
      setMqttConfiguration(await updateMqttConfiguration({
        ...mqttConfiguration,
        topics: mqttConfiguration.topics.map((topic) => ({
          ...topic,
          topic: topic.topic.trim(),
        })),
      }));
      setIsConfirmOpen(false);
      toast.success({ message: "Settings saved." });
    } catch (err) {
      toast.error({ message: err instanceof Error ? err.message : "Failed to save settings." });
    } finally {
      setSaving(false);
    }
  }

  async function testMainEndpoint() {
    if (!settings.mainApiEndpoint.trim()) {
      toast.error({ message: "Main API endpoint is empty." });
      return;
    }

    setTestingEndpoint(true);
    try {
      await fetch(settings.mainApiEndpoint.trim(), {
        headers: settings.mainApiToken.trim() ? { Authorization: `Bearer ${settings.mainApiToken.trim()}` } : undefined,
        method: "GET",
      });
      toast.success({ message: "Main API endpoint reachable." });
    } catch {
      toast.error({ message: "Main API endpoint unreachable." });
    } finally {
      setTestingEndpoint(false);
    }
  }

  return (
    <>
      <div className="content-light-surface space-y-7 text-slate-900">
        <PageBreadcrumb pageTitle="Settings" />

        <form className="space-y-6" onSubmit={submit}>
          <SettingSection eyebrow="License" title="Device License">
            <LicenseSettings />
          </SettingSection>
          <SettingSection eyebrow="Branding" title="Application Logo">
            <div className="grid gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">Sidebar and browser icon</p>
                <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-500">
                  Choose an image to personalize your sidebar and browser tab.
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-bold text-white transition hover:bg-brand-700 focus-within:ring-3 focus-within:ring-brand-500/30">
                    <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                    </svg>
                    Choose image
                    <input
                      className="sr-only"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={(event) => { handleLogoFile(event.target.files?.[0]); event.target.value = ""; }}
                      type="file"
                    />
                  </label>
                  <button
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                    onClick={() => { patchSettings({ brandLogoDataUrl: "", brandLogoUrl: "" }); setLogoFileName(""); }}
                    type="button"
                  >
                    <TrashBinIcon className="size-4" />
                    Use Default
                  </button>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">PNG, JPG, WebP or GIF · Maximum 1 MB</p>
                {logoFileName ? <p className="mt-1 truncate text-xs font-semibold text-slate-600">Selected: {logoFileName}</p> : null}
                <p className="mt-1 text-xs text-slate-500">Save settings to apply your changes.</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Preview</p>
                <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-slate-50 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt="Utility Monitoring System logo preview"
                    className="max-h-full max-w-full object-contain"
                    src={logoPreviewSrc}
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-slate-900">Utility Monitoring</p>
                  <p className="text-xs font-semibold text-slate-500">System</p>
                </div>
                </div>
              </div>
            </div>
          </SettingSection>

          <SettingSection eyebrow="General" title="System Preferences">
            <div className="grid gap-5 px-5 py-6 sm:grid-cols-2 xl:grid-cols-4">
              <label className={labelClass}>
                Timezone
                <select className={inputClass} onChange={(event) => patchSettings({ timezone: event.target.value as TimezoneOption })} value={settings.timezone}>
                  <option value="Asia/Jakarta">Asia/Jakarta</option>
                  <option value="Asia/Bangkok">Asia/Bangkok</option>
                  <option value="UTC">UTC</option>
                </select>
              </label>
              <label className={labelClass}>
                Device Offline Timeout
                <input
                  className={inputClass}
                  min={10}
                  onChange={(event) => patchSettings({ sensorOfflineSeconds: numericValue(event.target.value, settings.sensorOfflineSeconds) })}
                  type="number"
                  value={settings.sensorOfflineSeconds}
                />
              </label>
            </div>
          </SettingSection>

          <SettingSection eyebrow="MQTT" title="Topic Configuration">
            <div className="px-5 py-6">
              <div className="overflow-x-auto">
                <table className="leak-rounded-header-table w-full min-w-[820px] border-separate border-spacing-0 text-left text-sm">
                  <thead className="bg-transparent text-xs uppercase text-white">
                    <tr>
                      <th className="w-28 rounded-l-lg bg-brand-500 px-5 py-3">Sensor</th>
                      <th className="bg-brand-500 px-4 py-3">Description</th>
                      <th className="bg-brand-500 px-4 py-3">MQTT Topic</th>
                      <th className="w-28 bg-brand-500 px-4 py-3">QoS</th>
                      <th className="w-32 rounded-r-lg bg-brand-500 px-5 py-3 text-center">Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mqttConfiguration.topics.map((sensor) => (
                      <tr key={sensor.code}>
                        <td className="border-b border-slate-100 px-3 py-4">
                          <div className="text-base font-black text-slate-900">{sensor.code}</div>
                          <div className="mt-1 text-xs font-bold text-slate-500">{sensor.name}</div>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-4 text-sm font-semibold text-slate-600">
                          {sensorDescriptions[sensor.code]}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-4">
                          <input
                            className={tableInputClass}
                            disabled={!sensor.enabled}
                            onChange={(event) => updateMqttTopic(sensor.code, { topic: event.target.value })}
                            placeholder={`utility/${sensor.code.toLowerCase()}01/raw`}
                            value={sensor.topic}
                          />
                        </td>
                        <td className="border-b border-slate-100 px-3 py-4">
                          <select
                            className={tableInputClass}
                            disabled={!sensor.enabled}
                            onChange={(event) => updateMqttTopic(sensor.code, { qos: event.target.value as MqttSensorTopic["qos"] })}
                            value={sensor.qos}
                          >
                            <option value="0">0</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                          </select>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-4 text-center">
                          <button
                            aria-pressed={sensor.enabled}
                            className={
                              sensor.enabled
                                ? "inline-flex h-10 w-24 items-center justify-center gap-2 rounded-lg bg-emerald-50 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100"
                                : "inline-flex h-10 w-24 items-center justify-center gap-2 rounded-lg bg-slate-100 text-sm font-bold text-slate-500 transition hover:bg-slate-200"
                            }
                            onClick={() => updateMqttTopic(sensor.code, { enabled: !sensor.enabled })}
                            type="button"
                          >
                            {sensor.enabled ? <CheckLineIcon className="size-4" /> : null}
                            {sensor.enabled ? "On" : "Off"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </SettingSection>

          <SettingSection eyebrow="Server" title="Main API Endpoint">
            <div className="grid gap-5 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <label className={labelClass}>
                Endpoint URL
                <input
                  className={inputClass}
                  onChange={(event) => patchSettings({ mainApiEndpoint: event.target.value })}
                  placeholder="https://server-utama.domain/api/upload"
                  value={settings.mainApiEndpoint}
                />
              </label>
              <label className={labelClass}>
                API Token
                <input
                  className={inputClass}
                  onChange={(event) => patchSettings({ mainApiToken: event.target.value })}
                  placeholder="Bearer token"
                  type="password"
                  value={settings.mainApiToken}
                />
              </label>
              <button
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 lg:col-span-2 lg:w-fit"
                disabled={testingEndpoint}
                onClick={() => void testMainEndpoint()}
                type="button"
              >
                <PaperPlaneIcon className="size-5" />
                {testingEndpoint ? "Testing" : "Test Connection"}
              </button>
            </div>
          </SettingSection>

          <SettingSection eyebrow="Billing" title="Electricity Cost">
            <div className="grid gap-5 px-5 py-6 sm:grid-cols-2 xl:grid-cols-4">
              <label className={labelClass}>
                Harga per kWh
                <input
                  className={inputClass}
                  min={0}
                  onChange={(event) => patchSettings({ electricityRatePerKwh: numericValue(event.target.value, settings.electricityRatePerKwh) })}
                  placeholder="0"
                  step="0.01"
                  type="number"
                  value={settings.electricityRatePerKwh}
                />
              </label>
            </div>
          </SettingSection>

          <SettingSection eyebrow="Storage" title="Buffer & Storage">
            <div className="grid gap-5 px-5 py-6 sm:grid-cols-2 xl:grid-cols-3">
              <ToggleField checked={settings.autoCleanupEnabled} label="Auto Cleanup" onChange={(checked) => patchSettings({ autoCleanupEnabled: checked })} />
              <label className={labelClass}>
                Log Retention
                <input
                  className={inputClass}
                  min={1}
                  onChange={(event) => patchSettings({ logRetentionDays: numericValue(event.target.value, settings.logRetentionDays) })}
                  type="number"
                  value={settings.logRetentionDays}
                />
              </label>
              <label className={labelClass}>
                Backup Location
                <input
                  className={inputClass}
                  onChange={(event) => patchSettings({ backupDbLocation: event.target.value })}
                  placeholder="D:\\Backup\\Utility-Monitoring"
                  value={settings.backupDbLocation}
                />
              </label>
            </div>
          </SettingSection>

          <SettingSection eyebrow="Runtime" title="System Info">
            <div className="grid gap-4 px-5 py-6 sm:grid-cols-2 xl:grid-cols-4">
              <StatusCard label="Backend API" note="Local middleware API" status={backendStatus} />
              <StatusCard label="MQTT Broker" note="Broker connection" status={brokerStatus} />
              <StatusCard label="Last MQTT Received" note={lastMqttAt ? new Date(lastMqttAt).toLocaleString() : "No data"} status={lastMqttAt ? "online" : "unknown"} />
              <StatusCard label="App Version" note="v1.3.0" status="online" />
            </div>
          </SettingSection>

          <div className="flex justify-end">
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              <CheckLineIcon className="size-4" />
              {saving ? "Saving" : "Save Setting"}
            </button>
          </div>
        </form>
      </div>

      <ConfirmModal
        cancelText="Cancel"
        confirmText="Yes, Save"
        isOpen={isConfirmOpen}
        isLoading={saving}
        message="Are you sure you want to save these settings?"
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={() => void confirmSave()}
        title="Save Setting?"
      />
    </>
  );
}
