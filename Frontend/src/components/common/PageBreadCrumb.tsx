"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { navItems } from "@/layout/navItems";

interface BreadcrumbProps {
  pageTitle: string;
  parentTitle?: string;
}

const isPathMatch = (itemPath: string, pathname: string) =>
  pathname === itemPath || pathname.startsWith(`${itemPath}/`);

const BreadcrumbSeparator = () => (
  <li className="flex items-center text-gray-400">
    <svg
      className="stroke-current"
      width="14"
      height="14"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7 5L12 10L7 15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </li>
);

const PageBreadcrumb: React.FC<BreadcrumbProps> = ({
  pageTitle,
  parentTitle,
}) => {
  const pathname = usePathname();
  const matchedParentTitle =
    parentTitle ??
    navItems.find((nav) =>
      nav.subItems?.some((subItem) => isPathMatch(subItem.path, pathname))
    )?.name;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6 mx-4">
      <h2
        className="text-xl font-semibold text-gray-800"
        x-text="pageName"
      >
        {pageTitle}
      </h2>
      <nav>
        <ol className="flex items-center gap-2">
          <li className="flex items-center">
            <Link
              className="text-sm font-medium text-gray-500 transition-colors hover:text-brand-500"
              href="/"
            >
              Home
            </Link>
          </li>
          <BreadcrumbSeparator />
          {matchedParentTitle && (
            <>
              <li className="text-sm font-medium text-gray-500">
                {matchedParentTitle}
              </li>
              <BreadcrumbSeparator />
            </>
          )}
          <li
            className="text-sm font-medium text-gray-800"
            aria-current="page"
          >
            {pageTitle}
          </li>
        </ol>
      </nav>
    </div>
  );
};

export default PageBreadcrumb;
