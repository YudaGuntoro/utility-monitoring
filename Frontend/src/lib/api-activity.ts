export const API_ACTIVITY_EVENT = "utility-system:api-activity";
export const API_ACTIVITY_STORAGE_KEY = "utility-system:last-api-at";

export type ApiActivityEventDetail = {
  at: string;
};

export function notifyApiActivity(at = new Date()) {
  if (typeof window === "undefined") {
    return;
  }

  const value = at.toISOString();
  try {
    window.localStorage.setItem(API_ACTIVITY_STORAGE_KEY, value);
  } catch {
    // Ignore storage failures; the in-page event still updates the status bar.
  }
  window.dispatchEvent(new CustomEvent<ApiActivityEventDetail>(API_ACTIVITY_EVENT, { detail: { at: value } }));
}

export function readLastApiActivity() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(API_ACTIVITY_STORAGE_KEY);
  } catch {
    return null;
  }
}
