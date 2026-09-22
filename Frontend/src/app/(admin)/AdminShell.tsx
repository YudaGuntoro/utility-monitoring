"use client";

import { useSidebar } from "@/context/SidebarContext";
import { AuthGuard } from "@/lib/AuthGuard";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import type { ReactNode } from "react";

const appVersion = "v.13.08.26";

export default function AdminShell({ children }: { children: ReactNode }) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();

  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
    ? "lg:ml-[290px]"
    : "lg:ml-[90px]";

  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#f3f7fc] xl:flex">
        <AppSidebar />
        <Backdrop />
        <div className={`flex-1 transition-all duration-300 ease-in-out ${mainContentMargin}`}>
          <AppHeader />
          <div className="app-main-content mx-auto max-w-(--breakpoint-2xl) p-4 md:p-6">{children}</div>
        </div>
        <div className="pointer-events-none fixed bottom-3 right-4 z-50 rounded border border-slate-200 bg-white/85 px-2 py-1 text-[11px] font-bold text-slate-500 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-400">
          {appVersion}
        </div>
      </div>
    </AuthGuard>
  );
}
