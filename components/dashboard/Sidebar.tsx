"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HaloLogo } from "@/components/logo";
import { useT } from "@/lib/i18n/context";
import { NAV_ITEMS } from "./navItems";

// Soft Studio redesign — fixed-width sidebar with labels always visible (no
// icon-only collapsed state, unlike the previous expand-on-click version),
// colored dots instead of icons, and the same HaloLogo+wordmark pairing
// /login already uses for the brand identity.
export function Sidebar() {
  const pathname = usePathname();
  const t = useT();

  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-halo-border bg-halo-surface md:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <HaloLogo size={34} />
        <span className="text-sm font-semibold tracking-[0.14em] text-halo-text">HALO</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {NAV_ITEMS.map(({ href, labelKey, dotColor, activeBg, activeText }) => {
          const label = t(labelKey);
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-200 ${
                active
                  ? "font-medium"
                  : "font-normal text-halo-text-muted hover:bg-halo-bg hover:text-halo-text"
              }`}
              style={active ? { backgroundColor: activeBg, color: activeText } : undefined}
            >
              <span
                className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ backgroundColor: dotColor }}
                aria-hidden="true"
              />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
