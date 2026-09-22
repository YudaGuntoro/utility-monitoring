import type { Metadata } from "next";
import EnergyPanelDashboard from "@/production/EnergyPanelDashboard";

export const metadata: Metadata = {
  title: "Dashboard | Energy Monitoring System",
  description: "Energy Monitoring System energy consumption dashboard",
};

export default function UtilityMonitoringHome() {
  return <EnergyPanelDashboard />;
}
