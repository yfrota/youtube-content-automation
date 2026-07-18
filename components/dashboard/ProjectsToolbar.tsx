"use client";

import { useEffect, useState } from "react";
import { SearchIcon } from "@/components/icons";
import { useT } from "@/lib/i18n/context";
import { PLATFORM_LABELS, type ClientProfile, type Platform } from "@/lib/dashboard/types";

const SEARCH_DEBOUNCE_MS = 400;

// labelKey, not label — this array is a module const and can't call
// useT() itself, same pattern as navItems.tsx/CONTENT_TYPE_OPTIONS.
const SORT_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "updated_at:desc", labelKey: "dashboard.mostRecent" },
  { value: "created_at:asc", labelKey: "dashboard.oldest" },
  { value: "name:asc", labelKey: "dashboard.nameAZ" },
  { value: "deadline:asc", labelKey: "dashboard.byDeadline" },
  { value: "priority:desc", labelKey: "dashboard.byPriority" },
];

// Explicit order (not PLATFORM_LABELS' own key order) — matches the order
// requested for this dropdown specifically.
const PLATFORM_OPTIONS: Platform[] = [
  "youtube",
  "instagram",
  "tiktok",
  "linkedin",
  "facebook",
  "spotify",
];

const INPUT_CLASSES =
  "h-10 rounded-[10px] border border-halo-border bg-background px-3 text-sm text-foreground outline-none transition-colors duration-200 placeholder:text-gray-400 focus:border-accent";

interface ProjectsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  clientId: string;
  onClientChange: (value: string) => void;
  clients: ClientProfile[];
  // Both default true. /projects (ProjectsView) hides whichever dimension is
  // already covered by the active sidebar folder — e.g. grouped by
  // Plataforma, the folder already sets `platform`, so this toolbar only
  // needs to offer the cross-filter (client), not a redundant platform
  // dropdown.
  showClientFilter?: boolean;
  platform: string;
  onPlatformChange: (value: string) => void;
  showPlatformFilter?: boolean;
  tag: string;
  onTagChange: (value: string) => void;
  sortValue: string;
  onSortChange: (value: string) => void;
}

export function ProjectsToolbar({
  search,
  onSearchChange,
  clientId,
  onClientChange,
  clients,
  showClientFilter = true,
  platform,
  onPlatformChange,
  showPlatformFilter = true,
  tag,
  onTagChange,
  sortValue,
  onSortChange,
}: ProjectsToolbarProps) {
  const t = useT();
  // Local echo of `search` so typing feels instant; the upward call (which
  // triggers a URL update + refetch) is debounced, same pattern as
  // ScriptStage's YouTube trending search.
  const [searchInput, setSearchInput] = useState(search);

  useEffect(() => {
    const timer = setTimeout(() => onSearchChange(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // onSearchChange intentionally omitted — it's a stable setter from the
    // parent, including it would re-arm the debounce timer for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
      <div className="relative flex-1 sm:max-w-xs">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t("dashboard.searchProjects")}
          className={`${INPUT_CLASSES} w-full pl-9`}
        />
      </div>

      {showClientFilter && (
        <select
          value={clientId}
          onChange={(e) => onClientChange(e.target.value)}
          className={`${INPUT_CLASSES} sm:w-44`}
        >
          <option value="">{t("dashboard.allClients")}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      {showPlatformFilter && (
        <select
          value={platform}
          onChange={(e) => onPlatformChange(e.target.value)}
          className={`${INPUT_CLASSES} sm:w-40`}
        >
          <option value="">Todas as plataformas</option>
          {PLATFORM_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p]}
            </option>
          ))}
        </select>
      )}

      <input
        type="text"
        value={tag}
        onChange={(e) => onTagChange(e.target.value)}
        placeholder={t("dashboard.filterByTag")}
        className={`${INPUT_CLASSES} sm:w-40`}
      />

      <select
        value={sortValue}
        onChange={(e) => onSortChange(e.target.value)}
        className={`${INPUT_CLASSES} sm:w-40`}
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {t(opt.labelKey)}
          </option>
        ))}
      </select>
    </div>
  );
}
