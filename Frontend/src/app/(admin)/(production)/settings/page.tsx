import type { Metadata } from "next";
import SettingPage from "@/production/SettingPage";

export const metadata: Metadata = { title: "Setting | Energy Monitoring System" };

export default function Page() {
  return <SettingPage />;
}
