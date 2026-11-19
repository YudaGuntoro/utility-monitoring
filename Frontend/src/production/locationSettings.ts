export type BridgeLocationSettings = {
  area: string;
  bridgeName: string;
  mapQuery: string;
  latitude: number;
  longitude: number;
  zoom: number;
};

export const BRIDGE_LOCATION_STORAGE_KEY = "utility-bridge-location";

export const defaultBridgeLocationSettings: BridgeLocationSettings = {
  area: "",
  bridgeName: "",
  latitude: -0.789275,
  longitude: 113.921327,
  mapQuery: "-0.789275, 113.921327",
  zoom: 14,
};

export function readBridgeLocationSettings(): BridgeLocationSettings {
  if (typeof window === "undefined") {
    return defaultBridgeLocationSettings;
  }

  try {
    const stored = window.localStorage.getItem(BRIDGE_LOCATION_STORAGE_KEY);
    return stored
      ? { ...defaultBridgeLocationSettings, ...JSON.parse(stored) }
      : defaultBridgeLocationSettings;
  } catch {
    return defaultBridgeLocationSettings;
  }
}

export function saveBridgeLocationSettings(settings: BridgeLocationSettings) {
  window.localStorage.setItem(BRIDGE_LOCATION_STORAGE_KEY, JSON.stringify(settings));
}

export function parseMapCoordinates(value: string) {
  const trimmed = value.trim();
  const googleMapMatch = trimmed.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  const directMatch = trimmed.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  const match = googleMapMatch ?? directMatch;

  if (!match) {
    return null;
  }

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return { latitude, longitude };
}
