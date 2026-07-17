"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SettingsIcon } from "@/components/icons";
import { projectProgress, type ClientProfile, type Project } from "@/lib/dashboard/types";

const STORAGE_KEY = "halo-dashboard-kpis";
// Native "storage" only fires in *other* tabs — this custom event lets
// persistSelected notify its own tab too, same pattern lib/i18n/context.tsx
// uses for locale changes.
const KPIS_CHANGE_EVENT = "halo-dashboard-kpis-change";
const MAX_SELECTED = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

type KpiId =
  | "inProduction"
  | "awaitingReview"
  | "indexedVideos"
  | "totalProjects"
  | "publishedThisMonth"
  | "upcomingDeadline";

interface KpiContext {
  projects: Project[];
  indexedVideos: number;
}

interface KpiDef {
  id: KpiId;
  label: string;
  color: string;
  compute: (ctx: KpiContext) => number;
}

const DEFAULT_SELECTED: KpiId[] = [
  "inProduction",
  "awaitingReview",
  "indexedVideos",
  "totalProjects",
];

// Same deadline-urgency math as ProjectCard's own local deadlineUrgency —
// duplicated rather than imported (it's a 3-line local helper there, same
// small-local-dupe precedent as Spinner across this codebase).
function isDeadlineSoon(deadline: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${deadline}T00:00:00`);
  const diffDays = Math.round((due.getTime() - today.getTime()) / DAY_MS);
  return diffDays >= 0 && diffDays <= 3;
}

const KPI_DEFS: KpiDef[] = [
  {
    id: "inProduction",
    label: "Em produção",
    color: "#c4b5fd",
    compute: ({ projects }) =>
      projects.filter((p) => {
        const progress = projectProgress(p);
        return progress > 0 && progress < 100;
      }).length,
  },
  {
    id: "awaitingReview",
    label: "Aguardando revisão",
    color: "#93c5fd",
    compute: ({ projects }) =>
      projects.filter((p) =>
        p.modules.some(
          (m) => (m.key === "script" || m.key === "seo") && m.status === "kelly_review"
        )
      ).length,
  },
  {
    id: "indexedVideos",
    label: "Vídeos indexados",
    color: "#f9a8d4",
    compute: ({ indexedVideos }) => indexedVideos,
  },
  {
    id: "totalProjects",
    label: "Total de projetos",
    color: "#6ee7b7",
    compute: ({ projects }) => projects.length,
  },
  {
    id: "publishedThisMonth",
    label: "Publicados este mês",
    color: "#6ee7b7",
    compute: ({ projects }) => {
      const now = new Date();
      return projects.filter((p) => {
        const checklist = p.modules.find((m) => m.key === "checklist");
        if (checklist?.status !== "published") return false;
        const updated = new Date(p.updatedAt);
        return (
          updated.getFullYear() === now.getFullYear() && updated.getMonth() === now.getMonth()
        );
      }).length;
    },
  },
  {
    id: "upcomingDeadline",
    label: "Projetos com prazo próximo",
    color: "#fca5a5",
    compute: ({ projects }) =>
      projects.filter((p) => p.deadline && isDeadlineSoon(p.deadline)).length,
  },
];

function isKpiId(value: string): value is KpiId {
  return KPI_DEFS.some((k) => k.id === value);
}

function parseSelected(raw: string | null): KpiId[] {
  if (!raw) return DEFAULT_SELECTED;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_SELECTED;
    const valid = parsed.filter((id): id is KpiId => typeof id === "string" && isKpiId(id));
    return valid.length > 0 ? valid.slice(0, MAX_SELECTED) : DEFAULT_SELECTED;
  } catch {
    return DEFAULT_SELECTED;
  }
}

// getSnapshot must return a stable reference when the underlying value
// hasn't changed, or useSyncExternalStore re-renders forever — a plain
// `JSON.parse` on every call would create a new array each time even with
// identical contents, so the parsed result is cached against the raw string
// that produced it (same reasoning lib/i18n/context.tsx's getSnapshot
// doesn't need, since it returns a primitive there, not an array).
let cachedRaw: string | null | undefined;
let cachedSelected: KpiId[] = DEFAULT_SELECTED;

function getSnapshot(): KpiId[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedSelected = parseSelected(raw);
  }
  return cachedSelected;
}

function getServerSnapshot(): KpiId[] {
  return DEFAULT_SELECTED;
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(KPIS_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(KPIS_CHANGE_EVENT, callback);
  };
}

function persistSelected(next: KpiId[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(KPIS_CHANGE_EVENT));
  } catch {
    // Storage full/blocked — the selection just won't persist, non-fatal.
  }
}

interface StatsRowProps {
  projects: Project[];
  clients: ClientProfile[];
  // Shared with ProjectsToolbar's own client filter (lifted to
  // DashboardContent, backed by the `?clientId=` URL param) — this is the
  // "Visão" selector's synchronization: both controls read/write the exact
  // same value through the exact same handler, so there's no separate sync
  // logic to write, the URL is the single source of truth.
  selectedClientId: string;
  onClientChange: (value: string) => void;
}

// 4 KPI cards above the dashboard toolbar (Soft Studio redesign) — which
// four is user-configurable via the gear icon's dropdown, persisted to
// localStorage so the choice survives reloads. Selection itself lives in
// localStorage via useSyncExternalStore (no React state for it at all),
// same pattern lib/i18n/context.tsx's LocaleProvider uses — avoids the
// set-state-in-effect hydration dance entirely.
export function StatsRow({ projects, clients, selectedClientId, onClientChange }: StatsRowProps) {
  const selected = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // "Vídeos indexados" isn't derivable from `projects` (GET /api/projects
  // excludes catalog-imported rows by design) — fetched here, not lifted to
  // DashboardContent, specifically so it can refetch whenever the "Visão"
  // selector changes without DashboardContent needing to know about it.
  const [indexedVideos, setIndexedVideos] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const qs = selectedClientId ? `?clientId=${encodeURIComponent(selectedClientId)}` : "";
    fetch(`/api/dashboard/stats${qs}`)
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setIndexedVideos(body.indexedVideos ?? 0);
      })
      .catch(() => {
        // Non-fatal — the KPI card just reads 0 if this fails.
      });
    return () => {
      cancelled = true;
    };
  }, [selectedClientId]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function toggle(id: KpiId) {
    if (selected.includes(id)) {
      persistSelected(selected.filter((x) => x !== id));
    } else if (selected.length < MAX_SELECTED) {
      persistSelected([...selected, id]);
    }
  }

  const ctx: KpiContext = { projects, indexedVideos };
  const visibleKpis = KPI_DEFS.filter((k) => selected.includes(k.id));

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-halo-text-muted">
            Visão
          </span>
          <select
            value={selectedClientId}
            onChange={(e) => onClientChange(e.target.value)}
            className="h-7 rounded-md border border-halo-border bg-halo-surface px-2 text-xs text-halo-text outline-none transition-colors duration-200 focus:border-accent"
          >
            <option value="">Todos os clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div ref={containerRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Escolher métricas"
            aria-expanded={open}
            className="flex h-6 w-6 items-center justify-center rounded-md text-halo-text-muted transition-colors duration-200 hover:bg-halo-bg hover:text-halo-text"
          >
            <SettingsIcon className="h-3.5 w-3.5" />
          </button>

          {open && (
            <div className="animate-fade-in absolute right-0 top-full z-20 mt-1 w-60 rounded-lg border border-halo-border bg-halo-surface p-2 shadow-lg">
              {KPI_DEFS.map((kpi) => {
                const checked = selected.includes(kpi.id);
                const disabled = !checked && selected.length >= MAX_SELECTED;
                return (
                  <label
                    key={kpi.id}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                      disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-halo-bg"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(kpi.id)}
                      className="h-3.5 w-3.5 rounded border-halo-border"
                    />
                    <span className="text-halo-text">{kpi.label}</span>
                  </label>
                );
              })}
              <p className="mt-1 px-2 text-[10px] text-halo-text-muted">
                Máximo {MAX_SELECTED} métricas
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {visibleKpis.map((kpi) => (
          <div
            key={kpi.id}
            className="rounded-[14px] border border-halo-border bg-halo-surface px-4 pb-4 pt-3.5"
            style={{ borderTop: `3px solid ${kpi.color}` }}
          >
            <p className="text-[22px] font-semibold text-halo-text">{kpi.compute(ctx)}</p>
            <p className="mt-0.5 text-xs text-halo-text-muted">{kpi.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
