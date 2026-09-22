import type { Metadata } from "next";
import PowerDeviceDetailPage from "@/production/PowerDeviceDetailPage";

export const metadata: Metadata = { title: "Energy Device | Energy Monitoring System" };

export default async function PowerDeviceRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PowerDeviceDetailPage id={id} />;
}
