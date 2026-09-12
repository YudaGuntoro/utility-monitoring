"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { ConfirmModal } from "@/components/ui/modal/ConfirmModal";
import { useToast } from "@/context/ToastContext";
import { CheckLineIcon, PaperPlaneIcon } from "@/icons";
import { apiGet } from "@/lib/api";
import { fetchSystemSettings, readSystemSettings, updateSystemSettings, type SystemSettings, type TimezoneOption } from "./settings";

const inputClass = "mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-3 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500";
const labelClass = "text-xs font-bold uppercase text-slate-600 dark:text-slate-300";
const cardClass = "overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900";

type HealthState = "online" | "offline" | "unknown";

type SHMSStatus = {
  last_mqtt_at?: string | null;
};

type MqttBrokerStatus = {
  configured: boolean;
  host?: string;
  online: boolean;
  port?: number;
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
    return "bg-teal-50 text-teal-700 ring-teal-600/15 dark:bg-teal-500/10 dark:text-teal-200 dark:ring-teal-400/20";
  }

  if (status === "offline") {
    return "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-500/10 dark:text-red-200 dark:ring-red-400/20";
  }

  return "bg-slate-100 text-slate-600 ring-slate-500/15 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-500/25";
}

function SettingSection({ children, eyebrow, title }: { children: ReactNode; eyebrow?: string; title: string }) {
  return (
    <section className={cardClass}>
      <div className="border-b border-slate-200 px-5 py-5 dark:border-slate-800">
        {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">{eyebrow}</p> : null}
        <h2 className={eyebrow ? "mt-2 text-base font-bold text-slate-900 dark:text-white" : "text-base font-bold text-slate-900 dark:text-white"}>
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
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
      <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{label}</span>
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
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ring-1 ${statusClass(status)}`}>
        <span className={`size-2 rounded-full ${status === "online" ? "bg-teal-600" : status === "offline" ? "bg-red-600" : "bg-slate-400"}`} />
        {formatStatus(status)}
      </span>
      <p className="mt-4 text-sm font-bold text-slate-900 dark:text-white">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{note}</p>
    </div>
  );
}

export default function SettingPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<SystemSettings>(() => readSystemSettings());
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingEndpoint, setTestingEndpoint] = useState(false);
  const [brokerStatus, setBrokerStatus] = useState<HealthState>("unknown");
  const [backendStatus, setBackendStatus] = useState<HealthState>("unknown");
  const [lastMqttAt, setLastMqttAt] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    void fetchSystemSettings().then((result) => {
      if (!ignore) {
        setSettings(result);
      }
    });

    async function loadSystemInfo() {
      const [statusResult, brokerResult] = await Promise.allSettled([
        apiGet<SHMSStatus>("/api/shms-system/status"),
        apiGet<MqttBrokerStatus>("/api/shms-system/mqtt-broker/status"),
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsConfirmOpen(true);
  }

  async function confirmSave() {
    setSaving(true);
    try {
      setSettings(await updateSystemSettings(settings));
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
      <div className="space-y-7">
        <PageBreadcrumb pageTitle="Setting" />

        <form className="mx-4 space-y-6" onSubmit={submit}>
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
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800 lg:col-span-2 lg:w-fit"
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
