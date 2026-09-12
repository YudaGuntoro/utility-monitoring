import React from "react";
import {
  BoltIcon,
  GridIcon,
} from "../icons/index";

const SettingsIcon = () => (
  <svg
    aria-hidden="true"
    fill="none"
    height="22"
    viewBox="0 0 24 24"
    width="22"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
    <path
      d="M18.2 13.75c.08-.56.08-1.14 0-1.75l1.6-1.25-1.9-3.3-1.95.78a7.34 7.34 0 0 0-1.5-.87L14.15 5h-3.8l-.3 2.36c-.54.22-1.04.51-1.5.87L6.6 7.45l-1.9 3.3L6.3 12c-.08.61-.08 1.19 0 1.75L4.7 15l1.9 3.3 1.95-.78c.46.36.96.65 1.5.87l.3 2.36h3.8l.3-2.36c.54-.22 1.04-.51 1.5-.87l1.95.78 1.9-3.3-1.6-1.25Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  </svg>
);

export type NavSubItem = {
  name: string;
  path: string;
  pro?: boolean;
  new?: boolean;
};

export type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: NavSubItem[];
};

export const navItems: NavItem[] = [
  {
    icon: <GridIcon />,
    name: "Dashboard",
    path: "/",
  },
  {
    icon: <BoltIcon />,
    name: "Power Monitoring",
    path: "/",
  },
  {
    icon: <BoltIcon />,
    name: "Devices",
    path: "/devices",
  },
  {
    icon: <SettingsIcon />,
    name: "Settings",
    path: "/settings",
  },
];
