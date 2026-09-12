"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { ConfirmModal } from "@/components/ui/modal/ConfirmModal";
import { useToast } from "@/context/ToastContext";
import { CheckLineIcon, CloseLineIcon } from "@/icons";
import {
  defaultMqttConfiguration,
  fetchMqttConfiguration,
  readMqttConfiguration,
  saveMqttConfiguration,
  updateMqttConfiguration,
  type MqttConfiguration,
  type MqttSensorCode,
  type MqttSensorTopic,
} from "./mqttConfiguration";

const inputClass = "mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-3 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500";
const tableInputClass = "h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-3 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500";
const labelClass = "text-xs font-bold uppercase text-slate-600 dark:text-slate-300";

const sensorDescriptions: Record<MqttSensorCode, string> = {
  ACC: "Getaran dan akselerasi struktur.",
  ATRH: "Air temperature dan relative humidity.",
  TILT: "Kemiringan struktur dari tilt sensor.",
  VW: "Pembacaan vibrating wire sensor.",
};

export default function MqttConfigurationPage() {
  const toast = useToast();
  const [configuration, setConfiguration] = useState<MqttConfiguration>(() => readMqttConfiguration());
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const activeTopicCount = useMemo(() => configuration.topics.filter((topic) => topic.enabled).length, [configuration.topics]);

  useEffect(() => {
    let ignore = false;

    void fetchMqttConfiguration()
      .then((result) => {
        if (!ignore) {
          setConfiguration(result);
        }
      })
      .catch((err) => {
        if (!ignore) {
          toast.error({ message: err instanceof Error ? err.message : "Failed to load MQTT configuration." });
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [toast]);

  function updateConfiguration(patch: Partial<Omit<MqttConfiguration, "topics">>) {
    setConfiguration((current) => ({ ...current, ...patch }));
  }

  function updateTopic(code: MqttSensorCode, patch: Partial<MqttSensorTopic>) {
    setConfiguration((current) => ({
      ...current,
      topics: current.topics.map((topic) => (topic.code === code ? { ...topic, ...patch } : topic)),
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const emptyTopic = configuration.topics.find((topic) => topic.enabled && !topic.topic.trim());
    if (emptyTopic) {
      toast.error({ message: `Topic untuk sensor ${emptyTopic.code} wajib diisi.` });
      return;
    }

    setIsConfirmOpen(true);
  }

  async function confirmSave() {
    const normalized: MqttConfiguration = {
      ...configuration,
      brokerHost: configuration.brokerHost.trim(),
      brokerPort: configuration.brokerPort.trim(),
      clientId: configuration.clientId.trim(),
      topics: configuration.topics.map((topic) => ({
        ...topic,
        topic: topic.topic.trim(),
      })),
    };

    setSaving(true);
    try {
      setConfiguration(await updateMqttConfiguration(normalized));
      setIsConfirmOpen(false);
      toast.success({ message: "MQTT configuration saved." });
    } catch (err) {
      toast.error({ message: err instanceof Error ? err.message : "Failed to save MQTT configuration." });
    } finally {
      setSaving(false);
    }
  }

  async function resetDefaults() {
    setSaving(true);
    try {
      setConfiguration(await updateMqttConfiguration(defaultMqttConfiguration));
      toast.success({ message: "MQTT configuration reset to default topics." });
    } catch (err) {
      saveMqttConfiguration(defaultMqttConfiguration);
      setConfiguration(defaultMqttConfiguration);
      toast.error({ message: err instanceof Error ? err.message : "Failed to reset MQTT configuration in database." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="space-y-7">
        <PageBreadcrumb pageTitle="MQTT Configuration" />

        <form
          className="mx-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
          onSubmit={submit}
        >
          <div className="border-b border-slate-200 px-5 py-5 dark:border-slate-800">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Broker Connection</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  {loading ? "Loading MQTT topics..." : `${activeTopicCount} active sensor topics configured.`}
                </p>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-xs font-black uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                1 sensor = 1 topic
              </div>
            </div>
          </div>

          <div className="grid gap-5 px-5 py-6 md:grid-cols-3">
            <label className={labelClass}>
              Broker Host
              <input
                className={inputClass}
                onChange={(event) => updateConfiguration({ brokerHost: event.target.value })}
                placeholder="localhost"
                value={configuration.brokerHost}
              />
            </label>

            <label className={labelClass}>
              Broker Port
              <input
                className={inputClass}
                inputMode="numeric"
                onChange={(event) => updateConfiguration({ brokerPort: event.target.value })}
                placeholder="1883"
                value={configuration.brokerPort}
              />
            </label>

            <label className={labelClass}>
              Client ID
              <input
                className={inputClass}
                onChange={(event) => updateConfiguration({ clientId: event.target.value })}
                placeholder="Worker"
                value={configuration.clientId}
              />
            </label>
          </div>

          <div className="border-y border-slate-200 px-5 py-5 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Sensor Topics</h2>
          </div>

          <div className="overflow-x-auto p-5">
            <table className="leak-rounded-header-table w-full min-w-[900px] border-separate border-spacing-0 text-left text-sm">
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
                {configuration.topics.map((sensor) => (
                  <tr key={sensor.code}>
                    <td className="border-b border-slate-100 px-3 py-4 dark:border-slate-800">
                      <div className="text-base font-black text-slate-900 dark:text-white">{sensor.code}</div>
                      <div className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">{sensor.name}</div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-4 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">
                      {sensorDescriptions[sensor.code]}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-4 dark:border-slate-800">
                      <input
                        className={tableInputClass}
                        disabled={!sensor.enabled}
                        onChange={(event) => updateTopic(sensor.code, { topic: event.target.value })}
                        placeholder={`shms/${sensor.code.toLowerCase()}`}
                        value={sensor.topic}
                      />
                    </td>
                    <td className="border-b border-slate-100 px-3 py-4 dark:border-slate-800">
                      <select
                        className={tableInputClass}
                        disabled={!sensor.enabled}
                        onChange={(event) => updateTopic(sensor.code, { qos: event.target.value as MqttSensorTopic["qos"] })}
                        value={sensor.qos}
                      >
                        <option value="0">0</option>
                        <option value="1">1</option>
                        <option value="2">2</option>
                      </select>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-4 text-center dark:border-slate-800">
                      <button
                        aria-pressed={sensor.enabled}
                        className={
                          sensor.enabled
                            ? "inline-flex h-10 w-24 items-center justify-center gap-2 rounded-lg bg-emerald-50 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300"
                            : "inline-flex h-10 w-24 items-center justify-center gap-2 rounded-lg bg-slate-100 text-sm font-bold text-slate-500 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                        }
                        onClick={() => updateTopic(sensor.code, { enabled: !sensor.enabled })}
                        type="button"
                      >
                        {sensor.enabled ? <CheckLineIcon className="size-4" /> : <CloseLineIcon className="size-4" />}
                        {sensor.enabled ? "On" : "Off"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
            <button
              className="h-10 rounded-lg border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              disabled={saving}
              onClick={() => void resetDefaults()}
              type="button"
            >
              Reset Default
            </button>
            <button
              className="h-10 rounded-lg bg-brand-500 px-5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              {saving ? "Saving" : "Save Configuration"}
            </button>
          </div>
        </form>
      </div>

      <ConfirmModal
        cancelText="Cancel"
        confirmText="Yes, Save"
        isOpen={isConfirmOpen}
        isLoading={saving}
        message="Are you sure you want to save this MQTT sensor topic configuration?"
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={() => void confirmSave()}
        title="Save MQTT Configuration?"
      />
    </>
  );
}
