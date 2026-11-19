import type { Metadata } from "next";
import MqttConfigurationPage from "@/production/MqttConfigurationPage";

export const metadata: Metadata = { title: "MQTT Configuration | Utility Monitoring System" };

export default function Page() {
  return <MqttConfigurationPage />;
}
