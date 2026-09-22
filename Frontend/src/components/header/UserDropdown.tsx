"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { clearAuthSession, getStoredUser } from "@/lib/auth";

type AuthUser = {
  fullName: string;
  username: string;
  role: string;
};

const formatRole = (role: string) => {
  if (!role) {
    return "Role unavailable";
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
};

const getAuthUser = (): AuthUser => {
  const storedUser = getStoredUser();

  return {
    fullName: storedUser?.full_name || "User",
    role: storedUser?.role || "",
    username: storedUser?.username || "User",
  };
};

export default function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser>(() => getAuthUser());

  useEffect(() => {
    const timer = window.setTimeout(() => setAuthUser(getAuthUser()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function toggleDropdown(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  return (
    <div className="relative">
      <button
        aria-label="Open user menu"
        onClick={toggleDropdown}
        className="dropdown-toggle flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white"
        type="button"
      >
        <svg
          aria-hidden="true"
          className="stroke-current"
          width="22"
          height="22"
          viewBox="0 0 18 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M9 1.75C4.996 1.75 1.75 5.246 1.75 9.558C1.75 13.87 4.996 17.367 9 17.367C13.004 17.367 16.25 13.87 16.25 9.558C16.25 5.246 13.004 1.75 9 1.75Z"
            strokeWidth="1.5"
          />
          <path
            d="M5.75 14.18C6.45 12.87 7.66 12.06 9 12.06C10.34 12.06 11.55 12.87 12.25 14.18"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M9 9.98C10.09 9.98 10.98 9.09 10.98 8C10.98 6.91 10.09 6.02 9 6.02C7.91 6.02 7.02 6.91 7.02 8C7.02 9.09 7.91 9.98 9 9.98Z"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute right-0 mt-[17px] flex w-[260px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"
      >
        <div>
          <span className="block font-medium text-gray-700 text-theme-sm dark:text-gray-300">
            {authUser.fullName}
          </span>
          <span className="mt-0.5 block text-theme-xs text-gray-500 dark:text-gray-400">
            {authUser.username} - {formatRole(authUser.role)}
          </span>
        </div>

        <Link
          href="/signin"
          onClick={clearAuthSession}
          className="mt-4 flex items-center gap-3 rounded-lg border-t border-gray-200 px-3 py-3 font-medium text-gray-700 group text-theme-sm hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
        >
          <svg
            className="fill-gray-500 group-hover:fill-gray-700 dark:group-hover:fill-gray-300"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M15.1007 19.247C14.6865 19.247 14.3507 18.9112 14.3507 18.497L14.3507 14.245H12.8507V18.497C12.8507 19.7396 13.8581 20.747 15.1007 20.747H18.5007C19.7434 20.747 20.7507 19.7396 20.7507 18.497L20.7507 5.49609C20.7507 4.25345 19.7433 3.24609 18.5007 3.24609H15.1007C13.8581 3.24609 12.8507 4.25345 12.8507 5.49609V9.74501L14.3507 9.74501V5.49609C14.3507 5.08188 14.6865 4.74609 15.1007 4.74609L18.5007 4.74609C18.9149 4.74609 19.2507 5.08188 19.2507 5.49609L19.2507 18.497C19.2507 18.9112 18.9149 19.247 18.5007 19.247H15.1007ZM3.25073 11.9984C3.25073 12.2144 3.34204 12.4091 3.48817 12.546L8.09483 17.1556C8.38763 17.4485 8.86251 17.4487 9.15549 17.1559C9.44848 16.8631 9.44863 16.3882 9.15583 16.0952L5.81116 12.7484L16.0007 12.7484C16.4149 12.7484 16.7507 12.4127 16.7507 11.9984C16.7507 11.5842 16.4149 11.2484 16.0007 11.2484L5.81528 11.2484L9.15585 7.90554C9.44864 7.61255 9.44847 7.13767 9.15547 6.84488C8.86248 6.55209 8.3876 6.55226 8.09481 6.84525L3.52309 11.4202C3.35673 11.5577 3.25073 11.7657 3.25073 11.9984Z"
              fill=""
            />
          </svg>
          Sign out
        </Link>
      </Dropdown>
    </div>
  );
}
