"use client";

import { EyeCloseIcon, EyeIcon, LockIcon, UserIcon } from "@/icons";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useId, useState } from "react";
import { apiPost } from "@/lib/api";
import { hasValidAuthSession, saveAuthSession } from "@/lib/auth";
import type { LoginResponse } from "@/lib/types";
import { useToast } from "@/context/ToastContext";

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
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-8 text-white sm:px-6">
      <div
        aria-hidden="true"
        className="absolute inset-0 scale-[1.01] bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/images/auth/utility-login-background.png')" }}
      />
      <div className="absolute inset-0 bg-[#07121d]/42" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(51,131,202,0.08),transparent_55%),linear-gradient(180deg,rgba(7,18,29,0.18),rgba(7,18,29,0.62))]" />

      <div className="relative z-10 w-full max-w-[500px]">
        <div className="rounded-lg border border-white/18 bg-[#172231]/84 px-8 py-10 shadow-[0_28px_80px_rgba(0,0,0,0.36)] backdrop-blur-[6px] sm:px-8">
          <div className="mb-8 text-center">
            <h1 className="text-[15px] font-extrabold leading-tight text-white whitespace-nowrap sm:text-[20px] md:text-[22px]">
              Utility Monitoring
            </h1>
            <p className="mt-2 text-sm font-medium text-[#9db8d2]">Power Monitoring System</p>
            <p className="mt-3 text-sm text-[#b8c7d8]">Electrical utility telemetry dashboard</p>
          </div>

          <form autoComplete="off" data-form-type="other" onSubmit={(event) => void submit(event)}>
            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-xs font-extrabold uppercase text-white" htmlFor={`production-user-${usernameFieldId}`}>
                  Username
                </label>
                <div className="relative">
                  <UserIcon className="pointer-events-none absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-[#9db0c3]" />
                  <input
                    autoCapitalize="none"
                    autoComplete="new-password"
                    className="h-12 w-full rounded-md border border-transparent bg-[#293440] px-11 text-sm font-medium text-white outline-none transition placeholder:text-[#a9bbcc] focus:border-[#2b74ff] focus:bg-[#2b3643] focus:ring-3 focus:ring-[#2b74ff]/18"
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
                <label className="mb-2 block text-xs font-extrabold uppercase text-white" htmlFor={`production-secret-${passwordFieldId}`}>
                  Password
                </label>
                <div className="relative">
                  <LockIcon className="pointer-events-none absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-[#9db0c3]" />
                  <input
                    autoComplete="new-password"
                    className="h-12 w-full rounded-md border border-transparent bg-[#293440] px-11 pr-12 text-sm font-medium text-white outline-none transition placeholder:text-[#a9bbcc] focus:border-[#2b74ff] focus:bg-[#2b3643] focus:ring-3 focus:ring-[#2b74ff]/18"
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
                    className="absolute right-4 top-1/2 z-30 -translate-y-1/2 cursor-pointer text-[#9db0c3] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
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

              <label className="flex w-fit items-center gap-2 text-sm text-[#c4d2e2]">
                <input
                  className="size-3.5 rounded border-white/40 bg-white text-[#2468ff] focus:ring-[#2468ff]"
                  disabled={loading}
                  type="checkbox"
                />
                Remember me
              </label>

              <button
                className="inline-flex h-12 w-full items-center justify-center rounded-md bg-[#2468ff] px-4 text-sm font-extrabold text-white shadow-[0_12px_28px_rgba(36,104,255,0.34)] transition-colors hover:bg-[#1858e8] focus:outline-none focus:ring-3 focus:ring-[#2468ff]/28 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading}
                type="submit"
              >
                {loading ? "Processing..." : "Sign In"}
              </button>
            </div>
          </form>
        </div>

        <p className="mt-7 text-center text-[11px] font-medium text-[#89a1b8]/80">
          © 2026 Utility Monitoring. All rights reserved.
        </p>
      </div>
    </div>
  );
}
