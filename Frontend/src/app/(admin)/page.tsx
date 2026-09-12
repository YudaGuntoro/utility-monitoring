import type { Metadata } from "next";
import ProductionDashboard from "@/production/ProductionDashboard";

export const metadata: Metadata = {
  title: "Utility Monitoring | Power Monitoring",
  description: "Utility Monitoring power dashboard",
};

export default function UtilityMonitoringHome() {
  return <ProductionDashboard />;
}
