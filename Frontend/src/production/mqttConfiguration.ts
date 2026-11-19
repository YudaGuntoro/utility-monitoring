import { apiGet, apiRequest } from "@/lib/api";

export type MqttSensorCode = "POWER" | "WATER" | "AIR" | "TILT" | "VW" | "ATRH" | "ACC";

export type MqttSensorTopic = {
  code: MqttSensorCode;
  name: string;
  topic: string;
  qos: "0" | "1" | "2";
  enabled: boolean;
};

export type MqttConfiguration = {
  brokerHost: string;
  brokerPort: string;
  clientId: string;
  topics: MqttSensorTopic[];
};

export const MQTT_CONFIGURATION_STORAGE_KEY = "utility-mqtt-configuration";

type ApiMqttSensorTopic = {
  code: MqttSensorCode;
  name: string;
  topic: string;
  qos: number | string;
  enabled: boolean;
};

type ApiMqttConfiguration = {
  broker_host?: string;
  broker_port?: string;
  client_id?: string;
  topics?: ApiMqttSensorTopic[];
};

export const defaultMqttConfiguration: MqttConfiguration = {
  brokerHost: "localhost",
  brokerPort: "1883",
  clientId: "utilityClient",
  topics: [
    { code: "POWER", enabled: true, name: "Power Monitoring", qos: "1", topic: "utility/power/+/telemetry" },
    { code: "WATER", enabled: true, name: "Water Monitoring", qos: "1", topic: "utility/water/+/telemetry" },
    { code: "AIR", enabled: true, name: "Compressed Air", qos: "1", topic: "utility/compressed-air/+/telemetry" },
    { code: "TILT", enabled: true, name: "Tilt Sensor", qos: "1", topic: "utility/tilt01/raw" },
    { code: "VW", enabled: true, name: "Vibrating Wire Sensor", qos: "1", topic: "utility/vw01/raw" },
    { code: "ATRH", enabled: true, name: "Air Temperature & RH Sensor", qos: "1", topic: "utility/atrh01/raw" },
    { code: "ACC", enabled: true, name: "Accelerometer Sensor", qos: "1", topic: "utility/acc03/raw" },
  ],
};

function normalizeConfiguration(value: Partial<MqttConfiguration> | null): MqttConfiguration {
  const configuredTopics = Array.isArray(value?.topics) ? value.topics : [];

  return {
    brokerHost: value?.brokerHost ?? defaultMqttConfiguration.brokerHost,
    brokerPort: value?.brokerPort ?? defaultMqttConfiguration.brokerPort,
    clientId: value?.clientId ?? defaultMqttConfiguration.clientId,
    topics: defaultMqttConfiguration.topics.map((topic) => ({
      ...topic,
      ...configuredTopics.find((item) => item.code === topic.code),
    })),
  };
}

function normalizeQos(value: number | string | undefined): MqttSensorTopic["qos"] {
  const normalized = String(value ?? "1");
  return normalized === "0" || normalized === "2" ? normalized : "1";
}

function fromApiConfiguration(value: ApiMqttConfiguration): MqttConfiguration {
  return normalizeConfiguration({
    brokerHost: value.broker_host,
    brokerPort: value.broker_port,
    clientId: value.client_id,
    topics: value.topics?.map((topic) => ({
      code: topic.code,
      enabled: topic.enabled,
      name: topic.name,
      qos: normalizeQos(topic.qos),
      topic: topic.topic,
    })),
  });
}

function toApiConfiguration(configuration: MqttConfiguration): ApiMqttConfiguration {
  return {
    broker_host: configuration.brokerHost.trim(),
    broker_port: configuration.brokerPort.trim(),
    client_id: configuration.clientId.trim(),
    topics: configuration.topics.map((topic) => ({
      code: topic.code,
      enabled: topic.enabled,
      name: topic.name,
      qos: Number(topic.qos),
      topic: normalizeTopic(topic.topic),
    })),
  };
}

function normalizeTopic(value: string) {
  return value.trim().replace(/^\/+|\/+$/g, "").split("/").filter(Boolean).join("/");
}

export function readMqttConfiguration(): MqttConfiguration {
  if (typeof window === "undefined") {
    return defaultMqttConfiguration;
  }

  try {
    const stored = window.localStorage.getItem(MQTT_CONFIGURATION_STORAGE_KEY);
    return stored ? normalizeConfiguration(JSON.parse(stored) as Partial<MqttConfiguration>) : defaultMqttConfiguration;
  } catch {
    return defaultMqttConfiguration;
  }
}

export function saveMqttConfiguration(configuration: MqttConfiguration) {
  window.localStorage.setItem(MQTT_CONFIGURATION_STORAGE_KEY, JSON.stringify(configuration));
}

export async function fetchMqttConfiguration() {
  try {
    const configuration = fromApiConfiguration(await apiGet<ApiMqttConfiguration>("/api/utility-system/mqtt-configuration"));
    saveMqttConfiguration(configuration);
    return configuration;
  } catch {
    return readMqttConfiguration();
  }
}

export async function updateMqttConfiguration(configuration: MqttConfiguration) {
  const updated = fromApiConfiguration(await apiRequest<ApiMqttConfiguration>("/api/utility-system/mqtt-configuration", {
    body: JSON.stringify(toApiConfiguration(configuration)),
    method: "PUT",
  }));
  saveMqttConfiguration(updated);
  return updated;
}
