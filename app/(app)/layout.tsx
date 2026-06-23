import type { ReactNode } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

// Route group (URL-invisible) so the secondary pages share the same sidebar
// shell as /dashboard without duplicating the wrapper per route.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
