import type { Metadata } from "next";
import ProductionDashboard from "@/production/ProductionDashboard";

export const metadata: Metadata = {
  title: "Data Monitor | Energy Monitoring System",
  description: "Energy Monitoring System data monitor",
};

export default function DataMonitorRoute() {
  return <ProductionDashboard />;
}
