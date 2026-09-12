import type { Metadata } from "next";
import DeviceManagementPage from "@/production/DeviceManagementPage";

export const metadata: Metadata = { title: "Devices | Utility Monitoring" };

export default function DevicesRoute() {
  return <DeviceManagementPage />;
}
