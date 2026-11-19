"use client";

import { EyeCloseIcon, EyeIcon, LockIcon, UserIcon } from "@/icons";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useId, useState } from "react";
import { apiPost } from "@/lib/api";
import { hasValidAuthSession, saveAuthSession } from "@/lib/auth";
import type { LoginResponse } from "@/lib/types";
import { useToast } from "@/context/ToastContext";
import utilityTheme from "@/components/common/UtilityTheme.module.css";
import UtilityMark from "@/components/brand/UtilityMark";

function safeNextPath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") && !value.startsWith("/signin") ? value : "/";
}

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const usernameFieldId = useId().replace(/:/g, "");
  const passwordFieldId = useId().replace(/:/g, "");
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [autofillLocked, setAutofillLocked] = useState(true);
  const [fieldNonce, setFieldNonce] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (hasValidAuthSession()) {
      router.replace(nextPath);
    }
  }, [nextPath, router]);

  useEffect(() => {
    setFieldNonce(crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!username.trim() || !password) {
      toast.error({ message: "Username and password are required." });
      return;
    }

    setLoading(true);
    try {
      const response = await apiPost<LoginResponse>("/api/auth/login", {
        username: username.trim(),
        password,
      });
      saveAuthSession(response);
      toast.success({ message: "Login successful!" });
      router.push(nextPath);
    } catch (err) {
      toast.error({ message: err instanceof Error ? err.message : "Login failed." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`${utilityTheme.auth} relative flex min-h-screen w-full items-center justify-center px-4 py-8 sm:px-6`}>
      <div className="relative z-10 w-full max-w-[500px]">
        <div className={`${utilityTheme.authCard} px-6 py-8 sm:px-8 sm:py-10`}>
          <div className="mb-8 text-center">
            <UtilityMark className="mx-auto mb-5 h-14 w-14 object-contain" />
            <h1 className="text-xl font-semibold leading-tight text-slate-900 sm:text-[22px]">
              Utility Monitoring System
            </h1>
            <p className="mt-2 text-sm text-slate-500">Electricity, water, and compressed air</p>
            <p className="mt-5 rounded-lg border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-[#1d4f8f]">Sign in to monitor your utilities</p>
          </div>

          <form autoComplete="off" data-form-type="other" onSubmit={(event) => void submit(event)}>
            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase text-slate-600" htmlFor={`production-user-${usernameFieldId}`}>
                  Username
                </label>
                <div className="relative">
                  <UserIcon className="pointer-events-none absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-slate-400" />
                  <input
                    autoCapitalize="none"
                    autoComplete="new-password"
                    className="h-12 w-full rounded-md border border-slate-300 bg-white px-11 text-sm font-medium text-slate-700 outline-none transition placeholder:text-[#a9bbcc] focus:border-[#2b74ff] focus:bg-white focus:ring-3 focus:ring-[#2b74ff]/18"
                    data-1p-ignore="true"
                    data-form-type="other"
                    data-login-field="true"
                    data-lpignore="true"
                    disabled={loading}
                    id={`production-user-${usernameFieldId}`}
                    inputMode="text"
                    name={fieldNonce ? `production-operator-${fieldNonce}` : `production-operator-${usernameFieldId}`}
                    onChange={(event) => setUsername(event.target.value)}
                    onFocus={() => setAutofillLocked(false)}
                    placeholder="Enter your username"
                    readOnly={autofillLocked}
                    spellCheck={false}
                    type="search"
                    value={username}
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase text-slate-600" htmlFor={`production-secret-${passwordFieldId}`}>
                  Password
                </label>
                <div className="relative">
                  <LockIcon className="pointer-events-none absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-slate-400" />
                  <input
                    autoComplete="new-password"
                    className="h-12 w-full rounded-md border border-slate-300 bg-white px-11 pr-12 text-sm font-medium text-slate-700 outline-none transition placeholder:text-[#a9bbcc] focus:border-[#2b74ff] focus:bg-white focus:ring-3 focus:ring-[#2b74ff]/18"
                    data-1p-ignore="true"
                    data-form-type="other"
                    data-login-field="true"
                    data-lpignore="true"
                    disabled={loading}
                    id={`production-secret-${passwordFieldId}`}
                    name={fieldNonce ? `production-key-${fieldNonce}` : `production-key-${passwordFieldId}`}
                    onChange={(event) => setPassword(event.target.value)}
                    onFocus={() => setAutofillLocked(false)}
                    placeholder="Enter your password"
                    readOnly={autofillLocked}
                    type={showPassword ? "text" : "password"}
                    value={password}
                  />
                  <button
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-4 top-1/2 z-30 -translate-y-1/2 cursor-pointer text-slate-400 transition-colors hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={loading}
                    onClick={() => setShowPassword((current) => !current)}
                    type="button"
                  >
                    {showPassword ? (
                      <EyeIcon className="fill-current" />
                    ) : (
                      <EyeCloseIcon className="fill-current" />
                    )}
                  </button>
                </div>
              </div>

              <label className="flex w-fit items-center gap-2 text-sm text-slate-600">
                <input
                  className="size-3.5 rounded border-white/40 bg-white text-[#2468ff] focus:ring-[#2468ff]"
                  disabled={loading}
                  type="checkbox"
                />
                Remember me
              </label>

              <button
                className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-[#2879e7] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#1d64c4] focus:outline-none focus:ring-3 focus:ring-[#2879e7]/20 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading}
                type="submit"
              >
                {loading ? "Processing..." : "Sign In"}
              </button>
            </div>
          </form>
        </div>

        <p className="mt-7 text-center text-[11px] font-medium text-white">
          Copyright 2026 Utility Monitoring System. All rights reserved.
        </p>
      </div>
    </div>
  );
}
