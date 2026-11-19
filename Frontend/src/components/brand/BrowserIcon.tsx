"use client";

import { useEffect } from "react";
import { hasValidAuthSession } from "@/lib/auth";
import { fetchSystemSettings, normalizeBrandLogoUrl, readSystemSettings, SYSTEM_SETTINGS_CHANGED_EVENT } from "@/production/settings";

const defaultIcon = "/utility-icon.svg?v=utility-system";

export default function BrowserIcon() {
  useEffect(() => {
    function syncIcon() {
      const settings = readSystemSettings();
      const src = normalizeBrandLogoUrl(settings.brandLogoUrl) || settings.brandLogoDataUrl || defaultIcon;
      document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').forEach((link) => {
        link.href = src;
        link.removeAttribute("type");
      });
    }

    syncIcon();
    window.addEventListener(SYSTEM_SETTINGS_CHANGED_EVENT, syncIcon);
    window.addEventListener("storage", syncIcon);
    if (hasValidAuthSession()) void fetchSystemSettings();
    return () => {
      window.removeEventListener(SYSTEM_SETTINGS_CHANGED_EVENT, syncIcon);
      window.removeEventListener("storage", syncIcon);
    };
  }, []);

  return null;
}
