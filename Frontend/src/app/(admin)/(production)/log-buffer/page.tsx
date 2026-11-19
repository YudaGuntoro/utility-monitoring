import type { Metadata } from "next";
import LogBufferPage from "@/production/LogBufferPage";

export const metadata: Metadata = { title: "Log Buffer | Utility Monitoring System" };

export default function Page() {
  return <LogBufferPage />;
}
