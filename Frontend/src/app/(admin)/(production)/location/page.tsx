import type { Metadata } from "next";
import LocationPage from "@/production/LocationPage";

export const metadata: Metadata = { title: "Location | Utility Monitoring System" };

export default function Page() {
  return <LocationPage />;
}
