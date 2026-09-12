"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { ConfirmModal, Modal } from "@/components/ui/modal";
import { useToast } from "@/context/ToastContext";
import { PencilIcon, PlusIcon, TrashBinIcon } from "@/icons";
import { powerApi, topicForDevice, type PowerDevice, type PowerDeviceInput } from "./powerMonitoring";

const emptyInput: PowerDeviceInput = {
  device_code: "",
  name: "",
  model: "Schneider PM8000 / PM8240",
  location: "",
  gateway_id: "GW-01",
  mqtt_topic: "",
  enabled: true,
};

function normalizeDeviceCode(value: string) {
  return value.trim().toUpperCase();
}

export default function DeviceManagementPage() {
  const toast = useToast();
  const [devices, setDevices] = useState<PowerDevice[]>([]);
  const [editing, setEditing] = useState<PowerDevice | null>(null);
  const [deviceToDelete, setDeviceToDelete] = useState<PowerDevice | null>(null);
  const [form, setForm] = useState<PowerDeviceInput>(emptyInput);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setDevices(await powerApi.devices());
    } catch (err) {
      toast.error({ message: err instanceof Error ? err.message : "Failed to load devices." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateForm(patch: Partial<PowerDeviceInput>) {
    setForm((current) => {
      const next = { ...current, ...patch };
      if (patch.device_code !== undefined) {
        const nextCode = normalizeDeviceCode(patch.device_code);
        const previousAutoTopic = current.device_code ? topicForDevice(current.device_code) : "";
        const shouldAutoTopic = !current.mqtt_topic || current.mqtt_topic === previousAutoTopic;
        next.device_code = nextCode;
        if (shouldAutoTopic) {
          next.mqtt_topic = nextCode ? topicForDevice(nextCode) : "";
        }
      }
      return next;
    });
  }

  function create() {
    setEditing(null);
    setForm(emptyInput);
    setIsFormOpen(true);
  }

  function edit(device: PowerDevice) {
    setEditing(device);
    setForm({
      device_code: device.device_code,
      name: device.name,
      model: device.model,
      location: device.location ?? "",
      gateway_id: device.gateway_id ?? "",
      mqtt_topic: device.mqtt_topic,
      enabled: true,
    });
    setIsFormOpen(true);
  }

  function reset() {
    setEditing(null);
    setForm(emptyInput);
    setIsFormOpen(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const deviceCode = normalizeDeviceCode(form.device_code);
    if (!deviceCode) {
      toast.error({ message: "Device Code wajib diisi." });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        device_code: deviceCode,
        gateway_id: form.gateway_id.trim(),
        location: form.location.trim(),
        model: form.model.trim() || "Schneider PM8000 / PM8240",
        mqtt_topic: form.mqtt_topic.trim() || topicForDevice(deviceCode),
        name: form.name.trim() || `Power Meter ${deviceCode}`,
      };
      if (editing) {
        await powerApi.updateDevice(editing.id, payload);
        toast.success({ message: "Device updated." });
      } else {
        await powerApi.createDevice(payload);
        toast.success({ message: "Device created." });
      }
      reset();
      await load();
    } catch (err) {
      toast.error({ message: err instanceof Error ? err.message : "Failed to save device." });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deviceToDelete) return;

    setDeleting(true);
    try {
      await powerApi.deleteDevice(deviceToDelete.id);
      toast.success({ message: "Device deleted." });
      setDeviceToDelete(null);
      await load();
    } catch (err) {
      toast.error({ message: err instanceof Error ? err.message : "Failed to delete device." });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Devices" />

      <div className="flex justify-end">
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 text-sm font-bold text-white transition hover:bg-brand-600"
          onClick={create}
          type="button"
        >
          <PlusIcon className="size-4 fill-current" />
          Add Device
        </button>
      </div>

      <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/10">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-brand-500 text-xs uppercase text-white">
            <tr>
              {["Device Code", "Name", "Model", "Location", "Gateway", "MQTT Topic", "Status", "Last Seen", "Actions"].map((header) => (
                <th className="px-4 py-3" key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr className="border-t border-slate-100 text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-950/60" key={device.id}>
                <td className="px-4 py-3 font-black text-slate-950 dark:text-white">{device.device_code}</td>
                <td className="px-4 py-3">{device.name}</td>
                <td className="px-4 py-3">{device.model}</td>
                <td className="px-4 py-3">{device.location || "-"}</td>
                <td className="px-4 py-3">{device.gateway_id || "-"}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{device.mqtt_topic}</td>
                <td className="px-4 py-3 capitalize text-slate-700 dark:text-slate-200">{device.status}</td>
                <td className="px-4 py-3">{device.last_seen ? new Date(device.last_seen).toLocaleString() : "-"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <ActionIconButton label={`Edit ${device.device_code}`} onClick={() => edit(device)}>
                      <PencilIcon className="h-5 w-5 shrink-0 fill-current" />
                    </ActionIconButton>
                    <ActionIconButton label={`Delete ${device.device_code}`} onClick={() => setDeviceToDelete(device)} tone="danger">
                      <TrashBinIcon className="h-5 w-5 shrink-0 fill-current" />
                    </ActionIconButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && devices.length === 0 ? <p className="p-8 text-center text-sm font-semibold text-slate-500 dark:text-slate-300">No devices found.</p> : null}
      </section>

      <ConfirmModal
        cancelText="Cancel"
        confirmText="Delete"
        isDestructive
        isLoading={deleting}
        isOpen={Boolean(deviceToDelete)}
        message={
          deviceToDelete
            ? `Delete ${deviceToDelete.device_code}? This removes the device and its telemetry records.`
            : ""
        }
        onClose={() => {
          if (!deleting) setDeviceToDelete(null);
        }}
        onConfirm={() => void remove()}
        title="Delete Power Meter"
      />

      <Modal isOpen={isFormOpen} onClose={reset} className="mx-4 max-w-[760px] overflow-hidden p-0">
        <form onSubmit={(event) => void submit(event)}>
          <div className="border-b border-slate-200 px-6 py-5 dark:border-slate-800">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Power Monitoring</p>
            <h2 className="mt-2 text-lg font-black text-slate-900 dark:text-white">
              {editing ? "Edit Device" : "Add Device"}
            </h2>
          </div>

          <div className="grid max-h-[70vh] gap-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
            <Field label="Device Code" value={form.device_code} onChange={(value) => updateForm({ device_code: value })} placeholder="PM-06" required />
            <Field label="Device Name" value={form.name} onChange={(value) => updateForm({ name: value })} placeholder="Main Panel 06" />
            <Field label="Model" value={form.model} onChange={(value) => updateForm({ model: value })} />
            <Field label="Location" value={form.location} onChange={(value) => updateForm({ location: value })} placeholder="Electrical Room" />
            <Field label="Gateway ID" value={form.gateway_id} onChange={(value) => updateForm({ gateway_id: value })} placeholder="GW-01" />
            <Field label="MQTT Topic" value={form.mqtt_topic} onChange={(value) => updateForm({ mqtt_topic: value })} placeholder="utility/power/PM-06/telemetry" />
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:justify-end">
            <button
              className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              disabled={saving}
              onClick={reset}
              type="button"
            >
              Cancel
            </button>
            <button
              className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              {saving ? "Saving" : editing ? "Update Device" : "Add Device"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function ActionIconButton({
  children,
  label,
  onClick,
  tone = "default",
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  const toneClass = {
    danger: "border-red-200 bg-white text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-500/10",
    default: "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
  }[tone];

  return (
    <button
      aria-label={label}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-lg border transition-colors ${toneClass}`}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function Field({
  label,
  onChange,
  placeholder,
  required = false,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  value: string;
}) {
  return (
    <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">
      {label}
      <input
        className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        value={value}
      />
    </label>
  );
}
