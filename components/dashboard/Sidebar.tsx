"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon, SparklesIcon } from "@/components/icons";
import { NAV_ITEMS } from "./navItems";

export function Sidebar() {
  const [expanded, setExpanded] = useState(false);
  const pathname = usePathname();

  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-gray-100 bg-background transition-all duration-200 ease-out md:flex dark:border-gray-800/80 ${
        expanded ? "w-60" : "w-16"
      }`}
    >
      {/* Brand + collapse toggle */}
      <div className="flex h-16 items-center gap-3 px-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Recolher menu" : "Expandir menu"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors duration-200 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800/70"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <span
          className={`flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-sm font-medium text-foreground transition-opacity duration-200 ${
            expanded ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <SparklesIcon className="h-4 w-4 text-accent" />
          Content Studio
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active =
            pathname === href ||
            (href === "/dashboard" && pathname === "/dashboard");
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`flex h-10 items-center gap-3 rounded-lg px-3 transition-colors duration-200 ${
                active
                  ? "bg-gray-100 text-foreground dark:bg-gray-800/70"
                  : "text-gray-500 hover:bg-gray-50 hover:text-foreground dark:text-gray-400 dark:hover:bg-gray-800/40"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span
                className={`overflow-hidden whitespace-nowrap text-sm transition-opacity duration-200 ${
                  expanded ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
