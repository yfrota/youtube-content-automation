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
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", Icon: DashboardIcon },
  { href: "/clients", labelKey: "nav.clients", Icon: UsersIcon },
  { href: "/projects", labelKey: "nav.projects", Icon: FolderIcon },
  { href: "/analytics", labelKey: "nav.analytics", Icon: ChartIcon },
  { href: "/settings", labelKey: "nav.settings", Icon: SettingsIcon },
];
