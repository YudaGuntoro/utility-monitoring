"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SHMSBrand from "@/components/brand/SHMSBrand";
import { useSidebar } from "../context/SidebarContext";
import {
  ChevronDownIcon,
  HorizontaLDots,
} from "../icons/index";
import { NavItem, navItems } from "./navItems";

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();
  const isActive = (path: string) => path === pathname;
  const canShowSubmenu = isExpanded || isHovered || isMobileOpen;
  const activeSubmenuName =
    navItems.find((nav) =>
      nav.subItems?.some((subItem) => subItem.path === pathname)
    )?.name ?? null;
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(
    activeSubmenuName
  );

  useEffect(() => {
    setOpenSubmenu(activeSubmenuName);
  }, [activeSubmenuName]);

  const handleSubmenuToggle = (name: string) => {
    setOpenSubmenu((current) => (current === name ? null : name));
  };

  const renderMenuItems = (navItems: NavItem[]) => (
    <ul className="flex flex-col gap-2">
      {navItems.map((nav) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <>
              <button
                onClick={() => handleSubmenuToggle(nav.name)}
                className={`menu-item group ${openSubmenu === nav.name
                  ? "menu-item-active"
                  : "menu-item-inactive"
                  } cursor-pointer ${!isExpanded && !isHovered
                    ? "lg:justify-center"
                    : "lg:justify-start"
                  }`}
              >
                <span
                  className={`${openSubmenu === nav.name
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                    }`}
                >
                  {nav.icon}
                </span>
                {canShowSubmenu && (
                  <span className={`menu-item-text`}>{nav.name}</span>
                )}
                {canShowSubmenu && (
                  <ChevronDownIcon
                    className={`ml-auto h-5 w-5 transition-transform duration-200 ${openSubmenu === nav.name
                      ? "rotate-180 text-brand-500"
                      : ""
                      }`}
                  />
                )}
              </button>

              {canShowSubmenu && (
                <div
                  className={`overflow-hidden transition-all duration-300 ${openSubmenu === nav.name ? "max-h-96" : "max-h-0"
                    }`}
                >
                  <ul className="mt-2 ml-9 space-y-1">
                    {nav.subItems.map((subItem) => (
                      <li key={subItem.name}>
                        <Link
                          href={subItem.path}
                          className={`menu-dropdown-item ${isActive(subItem.path)
                            ? "menu-dropdown-item-active"
                            : "menu-dropdown-item-inactive"
                            }`}
                        >
                          {subItem.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <Link
              href={nav.path || "#"}
              className={`menu-item group ${nav.path && isActive(nav.path)
                ? "menu-item-active"
                : "menu-item-inactive"
                }`}
            >
              <span
                className={`${nav.path && isActive(nav.path)
                  ? "menu-item-icon-active"
                  : "menu-item-icon-inactive"
                  }`}
              >
                {nav.icon}
              </span>
              {canShowSubmenu && (
                <span className={`menu-item-text`}>{nav.name}</span>
              )}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-4 left-0 bg-white text-gray-900 dark:bg-[#0d1d2b] dark:text-white h-screen transition-all duration-300 ease-in-out z-50 border-r border-[#dbe7f5] shadow-[8px_0_28px_rgba(21,84,179,0.04)] dark:border-white/10 dark:shadow-[8px_0_28px_rgba(2,8,23,0.22)]
        ${isExpanded || isMobileOpen
          ? "w-[290px]"
          : isHovered
            ? "w-[290px]"
            : "w-[90px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-7 flex  ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
          }`}
      >
        <Link href="/" className="sidebar-brand-link flex items-center gap-3">
          <span className="sidebar-brand-motion flex items-center gap-4">
            {isExpanded || isHovered || isMobileOpen ? (
              <SHMSBrand compact />
            ) : (
              <SHMSBrand compact showTitle={false} />
            )}
          </span>
        </Link>
      </div>
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 dark:text-slate-400 ${!isExpanded && !isHovered
                  ? "lg:justify-center"
                  : "justify-start"
                  }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Menu"
                ) : (
                  <HorizontaLDots />
                )}
              </h2>
              {renderMenuItems(navItems)}
            </div>
          </div>
        </nav>
      </div>
    </aside>
  );
};

export default AppSidebar;
