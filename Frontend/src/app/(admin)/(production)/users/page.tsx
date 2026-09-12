import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import UserTable from "@/components/user/UserTable";

export const metadata: Metadata = { title: "User | PT. Baja Titian Utama" };

export default function Page() {
  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="User" />

      <UserTable />
    </div>
  );
}
