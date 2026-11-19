import type { Metadata } from "next";
import ProductionDashboard from "@/production/ProductionDashboard";

export const metadata: Metadata = {
  title: "Data Monitor | Utility Monitoring System",
  description: "Utility Monitoring System data monitor",
};

export default function DataMonitorRoute() {
  return <ProductionDashboard />;
}
