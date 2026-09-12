import type { Metadata } from "next";
import PowerDeviceDetailPage from "@/production/PowerDeviceDetailPage";

export const metadata: Metadata = { title: "Power Device | Utility Monitoring" };

export default async function PowerDeviceRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PowerDeviceDetailPage id={id} />;
}
