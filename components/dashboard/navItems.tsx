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
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", Icon: DashboardIcon },
  { href: "/clients", label: "Clientes", Icon: UsersIcon },
  { href: "/projects", label: "Projetos", Icon: FolderIcon },
  { href: "/analytics", label: "Análises", Icon: ChartIcon },
  { href: "/settings", label: "Configurações", Icon: SettingsIcon },
];
