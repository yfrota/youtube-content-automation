import type { ComponentType, SVGProps } from "react";
import {
  DashboardIcon,
  FolderIcon,
  ChartIcon,
  SettingsIcon,
  UsersIcon,
} from "@/components/icons";

export interface NavItem {
  href: string;
  /** Dotted path into lib/i18n/translations.ts, resolved via useT() at the
   * render site — kept as a key here since this array isn't itself a
   * component and can't call hooks. */
  labelKey: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  // Soft Studio redesign — Sidebar.tsx renders `dotColor` as a small
  // rounded dot instead of `Icon`; MobileNav.tsx still uses `Icon` (bottom-
  // bar convention, out of scope for this redesign). activeBg/activeText
  // are the soft tinted pair shown when this item is the current route.
  dotColor: string;
  activeBg: string;
  activeText: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    labelKey: "nav.dashboard",
    Icon: DashboardIcon,
    dotColor: "#c4b5fd",
    activeBg: "#f3efff",
    activeText: "#6d5fc7",
  },
  {
    href: "/clients",
    labelKey: "nav.clients",
    Icon: UsersIcon,
    dotColor: "#f9a8d4",
    activeBg: "#fdf0f6",
    activeText: "#c2478a",
  },
  {
    href: "/projects",
    labelKey: "nav.projects",
    Icon: FolderIcon,
    dotColor: "#93c5fd",
    activeBg: "#eef6ff",
    activeText: "#3b7dd8",
  },
  {
    href: "/analytics",
    labelKey: "nav.analytics",
    Icon: ChartIcon,
    dotColor: "#6ee7b7",
    activeBg: "#eefdf5",
    activeText: "#1f9d6c",
  },
  {
    href: "/settings",
    labelKey: "nav.settings",
    Icon: SettingsIcon,
    dotColor: "#d4cdb8",
    activeBg: "#faf7f0",
    activeText: "#8a7f5c",
  },
];
