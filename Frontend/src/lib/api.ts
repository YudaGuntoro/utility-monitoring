import type { ApiResponse } from "./types";
import { clearAuthSession, getStoredToken, redirectToSignIn } from "./auth";
import { notifyApiActivity } from "./api-activity";

function normalizeBaseUrl(value?: string) {
  const raw = (value ?? "").split(/\s+#/)[0].trim();
  return raw.replace(/\/+$/, "");
}

function isLocalApiUrlOnPublicPage(value: string) {
  if (typeof window === "undefined" || !value) {
    return false;
  }

  const pageHost = window.location.hostname;
  if (pageHost === "localhost" || pageHost === "127.0.0.1" || pageHost === "::1") {
    return false;
  }

  try {
    const apiHost = new URL(value).hostname;
    return apiHost === "localhost" || apiHost === "127.0.0.1" || apiHost === "::1";
  } catch {
    return false;
  }
}

export function getApiBaseUrl() {
  const baseUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  return isLocalApiUrlOnPublicPage(baseUrl) ? "" : baseUrl;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getStoredToken();
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;

  if (!headers.has("Content-Type") && init.body && !isFormData) {
    headers.set("Content-Type", "application/json");
  }

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
  });
  notifyApiActivity();
  const text = await response.text();
  let payload: ApiResponse<T> | null = null;

  if (text) {
    try {
      payload = JSON.parse(text) as ApiResponse<T>;
    } catch {
      const preview = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
      throw new Error(preview || `API did not return JSON. Status ${response.status}.`);
    }
  }

  if (response.status === 401) {
    clearAuthSession();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/signin")) {
      redirectToSignIn();
    }
  }

  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || `Request failed with status ${response.status}`);
  }

  return payload ? payload.data : (undefined as T);
}

export async function apiDownload(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = getStoredToken();

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
  });
  notifyApiActivity();

  if (response.status === 401) {
    clearAuthSession();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/signin")) {
      redirectToSignIn();
    }
  }

  if (!response.ok) {
    const text = await response.text();
    let message = `Request failed with status ${response.status}`;

    if (text) {
      try {
        const payload = JSON.parse(text) as ApiResponse<unknown>;
        message = payload.message || message;
      } catch {
        message = text;
      }
    }

    throw new Error(message);
  }

  return response.blob();
}

export function apiGet<T>(path: string) {
  return apiRequest<T>(path);
}

export function apiPost<T>(path: string, body?: unknown) {
  return apiRequest<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiPut<T>(path: string, body?: unknown) {
  return apiRequest<T>(path, {
    method: "PUT",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiDelete<T>(path: string) {
  return apiRequest<T>(path, { method: "DELETE" });
}
