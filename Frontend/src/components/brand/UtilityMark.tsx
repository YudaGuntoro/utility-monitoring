"use client";

import { useEffect, useState } from "react";
import { DEFAULT_BRAND_LOGO_SRC, normalizeBrandLogoUrl, readSystemSettings, SYSTEM_SETTINGS_CHANGED_EVENT } from "@/production/settings";

type UtilityMarkProps = {
  className?: string;
  variant?: "auto" | "dark" | "light";
};

function readBrandLogoSrc() {
  const settings = readSystemSettings();
  return normalizeBrandLogoUrl(settings.brandLogoUrl) || settings.brandLogoDataUrl || DEFAULT_BRAND_LOGO_SRC;
}

export default function UtilityMark({ className = "", variant = "auto" }: UtilityMarkProps) {
  const [logoSrc, setLogoSrc] = useState(DEFAULT_BRAND_LOGO_SRC);

  useEffect(() => {
    function syncLogo() {
      setLogoSrc(readBrandLogoSrc());
    }

    syncLogo();
    window.addEventListener(SYSTEM_SETTINGS_CHANGED_EVENT, syncLogo);
    window.addEventListener("storage", syncLogo);

    return () => {
      window.removeEventListener(SYSTEM_SETTINGS_CHANGED_EVENT, syncLogo);
      window.removeEventListener("storage", syncLogo);
    };
  }, []);

  if (variant === "dark") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="Utility Monitoring System" className={className} src={logoSrc} />;
  }

  if (variant === "light") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="Utility Monitoring System" className={className} src={logoSrc} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="Utility Monitoring System" className={className} src={logoSrc} />
  );
}
