"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/context";
import { NAV_ITEMS } from "./navItems";

export function MobileNav() {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-gray-100 bg-background/90 backdrop-blur-md md:hidden dark:border-gray-800/80">
      {NAV_ITEMS.map(({ href, labelKey, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 transition-colors duration-200 ${
              active
                ? "text-accent"
                : "text-gray-400 hover:text-foreground dark:text-gray-500"
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{t(labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
