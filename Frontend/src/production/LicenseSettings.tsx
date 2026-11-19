"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { apiGet, apiPost } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";

type LicenseStatus = {
  installationId: string;
  usedDevices: number;
  maxDevices: number;
  active: boolean;
  verificationConfigured: boolean;
};

export default function LicenseSettings() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setIsAdmin(getStoredUser()?.role === "ADMIN");
    let cancelled = false;
    apiGet<LicenseStatus>("/api/license").then((result) => { if (!cancelled) setStatus(result); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load license."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function activate() {
    if (!token.trim()) { toast.error({ message: "Enter a license token." }); return; }
    setActivating(true);
    try {
      setStatus(await apiPost<LicenseStatus>("/api/license/activate", { token: token.trim() }));
      setToken("");
      toast.success({ message: "License activated." });
    } catch (err) {
      toast.error({ message: err instanceof Error ? err.message : "License activation failed." });
    } finally { setActivating(false); }
  }

  return (
    <div className="grid gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-4">
        <p className="text-sm leading-6 text-slate-500">Send your installation ID to the license provider, then enter the token you receive. An upgraded token replaces the current capacity.</p>
        {loading ? <p className="text-sm text-slate-500">Loading license…</p> : error ? <p role="alert" className="text-sm text-red-600">{error}</p> : status && <>
          <div>
            <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Installation ID</span>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800">{status.installationId}</code>
              <button type="button" className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50" onClick={() => void navigator.clipboard.writeText(status.installationId).then(() => toast.success({ message: "Installation ID copied." })).catch(() => toast.error({ message: "Could not copy the installation ID." }))}>Copy</button>
            </div>
          </div>
          {!status.verificationConfigured && <p role="alert" className="text-sm text-amber-700">The server license verification key has not been configured. Contact your administrator.</p>}
          {isAdmin ? <div>
            <label htmlFor="license-token" className="text-xs font-bold uppercase tracking-wide text-slate-600">License token</label>
            <textarea id="license-token" value={token} onChange={(event) => setToken(event.target.value)} rows={3} maxLength={8192} placeholder="Paste your token here" className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-500/20" />
            <button type="button" disabled={activating || !status.verificationConfigured} onClick={() => void activate()} className="mt-3 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">{activating ? "Activating…" : "Activate token"}</button>
          </div> : <p className="text-sm text-slate-500">Only an administrator can activate a token.</p>}
        </>}
      </div>
      {status && <div className="self-start rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Device capacity</p>
        <p className="mt-2 text-2xl font-bold text-slate-900">{status.usedDevices} <span className="text-base text-slate-400">/ {status.active ? status.maxDevices : "—"}</span></p>
        <p className="mt-1 text-sm text-slate-500">{status.active ? "Registered devices" : "No valid license active"}</p>
        <p className="mt-3 text-xs leading-5 text-slate-500">Includes power, water, compressed air, and registered sensors.</p>
      </div>}
    </div>
  );
}
