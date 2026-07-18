"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import {
  FacebookIcon,
  InstagramIcon,
  LinkedinIcon,
  PlayCircleIcon,
  PlusIcon,
  SpotifyIcon,
  TiktokIcon,
} from "@/components/icons";
import { Avatar } from "@/components/dashboard/Avatar";
import { Breadcrumb } from "@/components/dashboard/Breadcrumb";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { ProjectGridSkeleton } from "@/components/dashboard/Skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ProjectsToolbar } from "@/components/dashboard/ProjectsToolbar";
import { EditProjectModal } from "@/components/dashboard/EditProjectModal";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { useToast } from "@/components/dashboard/toast";
import { useT } from "@/lib/i18n/context";
import {
  PLATFORM_BADGE_STYLES,
  PLATFORM_LABELS,
  type ClientProfile,
  type Platform,
  type Project,
} from "@/lib/dashboard/types";

type GroupBy = "platform" | "client" | "none";

// Fixed display order — matches ProjectsToolbar's own PLATFORM_OPTIONS order.
const PLATFORM_ORDER: Platform[] = [
  "youtube",
  "instagram",
  "tiktok",
  "linkedin",
  "facebook",
  "spotify",
];

// Same generic-outline-glyph precedent duplicated in ProjectCard.tsx — small
// local dupe, not meant as a shared utility.
const PLATFORM_ICONS: Record<Platform, ComponentType<SVGProps<SVGSVGElement>>> = {
  youtube: PlayCircleIcon,
  instagram: InstagramIcon,
  linkedin: LinkedinIcon,
  facebook: FacebookIcon,
  spotify: SpotifyIcon,
  tiktok: TiktokIcon,
};

const GROUPBY_STORAGE_KEY = "halo-projects-groupby";
// Native "storage" only fires in *other* tabs — this custom event lets
// persistGroupBy notify its own tab too, same pattern StatsRow's KPI
// selection and lib/i18n/context.tsx's locale change use.
const GROUPBY_CHANGE_EVENT = "halo-projects-groupby-change";

function isGroupBy(value: string): value is GroupBy {
  return value === "platform" || value === "client" || value === "none";
}

// Cached against the raw string so getSnapshot returns a stable reference
// when localStorage hasn't actually changed — same reasoning as StatsRow's
// own getSnapshot (a fresh string is a primitive so it's less critical here,
// but keeps the two call sites consistent).
let cachedRaw: string | null | undefined;
let cachedGroupBy: GroupBy = "platform";

function getSnapshot(): GroupBy {
  const raw = window.localStorage.getItem(GROUPBY_STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedGroupBy = raw && isGroupBy(raw) ? raw : "platform";
  }
  return cachedGroupBy;
}

function getServerSnapshot(): GroupBy {
  return "platform";
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(GROUPBY_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(GROUPBY_CHANGE_EVENT, callback);
  };
}

function persistGroupBy(next: GroupBy) {
  try {
    window.localStorage.setItem(GROUPBY_STORAGE_KEY, next);
    window.dispatchEvent(new Event(GROUPBY_CHANGE_EVENT));
  } catch {
    // Storage full/blocked — the choice just won't persist, non-fatal.
  }
}

function FolderButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors duration-200 ${
        active
          ? "border border-halo-border bg-halo-surface text-halo-text shadow-sm"
          : "border border-transparent text-halo-text-muted hover:bg-halo-surface"
      }`}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      <span
        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
          active ? "bg-halo-purple/15 text-halo-purple" : "bg-halo-bg text-halo-text-muted"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function AllFolderIcon() {
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] text-white"
      style={{ background: "linear-gradient(135deg, #c4b5fd, #a78bfa)" }}
    >
      ✦
    </span>
  );
}

function PlatformIconBadge({ platform }: { platform: Platform }) {
  const Icon = PLATFORM_ICONS[platform];
  const style = PLATFORM_BADGE_STYLES[platform];
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
      style={{ background: style.background }}
    >
      <Icon className="h-3 w-3" style={{ color: style.color }} />
    </span>
  );
}

function SubsectionHeader({ icon, name, count }: { icon: ReactNode; name: string; count: number }) {
  return (
    <div className="mb-4 flex items-center gap-2 border-b border-halo-border pb-3">
      {icon}
      <h3 className="text-sm font-medium text-halo-text">{name}</h3>
      <span className="text-xs text-halo-text-muted">
        · {count} projeto{count === 1 ? "" : "s"}
      </span>
    </div>
  );
}

const CARD_GRID_CLASSES = "grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3";

// Full filterable/groupable project list (Bloco 2 of the dashboard
// restructure) — the overview at /dashboard only shows the 6 most recent
// projects and links here for everything else.
export function ProjectsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useT();
  const { showToast } = useToast();

  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);

  const storedGroupBy = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const groupByParam = searchParams.get("groupBy");
  const groupBy: GroupBy = groupByParam && isGroupBy(groupByParam) ? groupByParam : storedGroupBy;

  const search = searchParams.get("q") ?? "";
  const tag = searchParams.get("tag") ?? "";
  const sort = searchParams.get("sort") ?? "updated_at";
  const order = searchParams.get("order") ?? "desc";
  // Both dimensions always live in these same two params regardless of which
  // UI control set them — a folder click and the toolbar's cross-filter
  // dropdown call the exact same handlers below.
  const platformFilter = searchParams.get("platform") ?? "";
  const clientIdFilter = searchParams.get("clientId") ?? "";

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleGroupByChange(next: GroupBy) {
    persistGroupBy(next);
    // Reset both cross-dimension filters on mode switch — a param that was a
    // folder selection in the old mode isn't necessarily a sensible
    // cross-filter value in the new one, so start clean.
    updateParams({ groupBy: next, platform: null, clientId: null });
  }

  function handlePlatformChange(value: string) {
    updateParams({ platform: value || null });
  }

  function handleClientChange(value: string) {
    updateParams({ clientId: value || null });
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/clients")
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setClients(body.clients ?? []);
      })
      .catch(() => {
        // Non-fatal — folder/toolbar client lists just stay empty.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Unfiltered fetch, used only to compute folder counts (per-platform,
  // per-client) — deliberately ignores search/tag so the sidebar taxonomy
  // stays stable while the user types. Delete/edit apply optimistic patches
  // to this list too instead of refetching (see below).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects?clientId=all")
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setAllProjects(body.projects ?? []);
      })
      .catch(() => {
        // Non-fatal — folder counts just read 0.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const qs = new URLSearchParams();
        qs.set("clientId", clientIdFilter || "all");
        if (platformFilter) qs.set("platform", platformFilter);
        if (search) qs.set("q", search);
        if (tag) qs.set("tag", tag);
        qs.set("sort", sort);
        qs.set("order", order);

        const res = await fetch(`/api/projects?${qs.toString()}`, {
          signal: controller.signal,
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? "Falha ao carregar projetos");
        setFilteredProjects(body.projects);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Falha ao carregar projetos");
      }
    }

    load();
    return () => controller.abort();
  }, [clientIdFilter, platformFilter, search, tag, sort, order]);

  function handleCreate() {
    router.push("/projects/new");
  }

  function handleEditSaved(patch: {
    title: string;
    priority: Project["priority"];
    deadline: string | null;
    tags: string[];
    updatedAt: string;
  }) {
    const id = editingProject?.id;
    const apply = (prev: Project[]) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p));
    setFilteredProjects((prev) => (prev ? apply(prev) : prev));
    setAllProjects((prev) => apply(prev));
  }

  async function handleDeleteConfirm() {
    if (!deletingProject) return;
    const target = deletingProject;
    try {
      const res = await fetch(`/api/projects/${target.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Falha ao excluir projeto");
      }
      setFilteredProjects((prev) => prev?.filter((p) => p.id !== target.id) ?? prev);
      setAllProjects((prev) => prev.filter((p) => p.id !== target.id));
      showToast("Projeto excluído", "info");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Falha ao excluir projeto", "info");
    } finally {
      setDeletingProject(null);
    }
  }

  const platformCounts = useMemo(() => {
    const counts = new Map<Platform, number>();
    for (const p of allProjects) counts.set(p.platform, (counts.get(p.platform) ?? 0) + 1);
    return counts;
  }, [allProjects]);

  const clientCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of allProjects) counts.set(p.client.id, (counts.get(p.client.id) ?? 0) + 1);
    return counts;
  }, [allProjects]);

  const clientSubgroups = useMemo(() => {
    if (groupBy !== "platform" || !filteredProjects) return [];
    const map = new Map<string, { client: ClientProfile; items: Project[] }>();
    for (const p of filteredProjects) {
      const existing = map.get(p.client.id);
      if (existing) existing.items.push(p);
      else map.set(p.client.id, { client: p.client, items: [p] });
    }
    return [...map.values()].sort((a, b) => a.client.name.localeCompare(b.client.name));
  }, [groupBy, filteredProjects]);

  const platformSubgroups = useMemo(() => {
    if (groupBy !== "client" || !filteredProjects) return [];
    const map = new Map<Platform, Project[]>();
    for (const p of filteredProjects) {
      const list = map.get(p.platform) ?? [];
      list.push(p);
      map.set(p.platform, list);
    }
    return PLATFORM_ORDER.filter((pf) => map.has(pf)).map((pf) => ({
      platform: pf,
      items: map.get(pf)!,
    }));
  }, [groupBy, filteredProjects]);

  const loading = filteredProjects === null && error === null;
  const count = filteredProjects?.length ?? 0;
  const subtitle =
    groupBy === "platform"
      ? `${count} projeto${count === 1 ? "" : "s"} agrupados por plataforma`
      : groupBy === "client"
        ? `${count} projeto${count === 1 ? "" : "s"} agrupados por cliente`
        : `${count} projeto${count === 1 ? "" : "s"}`;

  return (
    <div className="min-h-screen bg-halo-bg">
      <div className="mx-auto max-w-6xl px-6 py-12 sm:px-8 sm:py-16">
        <Breadcrumb items={[{ label: "Início", href: "/" }, { label: "Projetos" }]} />

        <header className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-halo-text">Projetos</h1>
            <p className="mt-2 text-sm text-halo-text-muted">{subtitle}</p>
          </div>

          <button
            type="button"
            onClick={handleCreate}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[10px] px-4 text-sm font-medium text-white transition-all duration-200 hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, #c4b5fd, #a78bfa)",
              boxShadow: "0 2px 8px rgba(167,139,250,0.3)",
            }}
          >
            <PlusIcon className="h-4 w-4" />
            {t("dashboard.newProject")}
          </button>
        </header>

        <div className="mt-8 flex items-center gap-3">
          <span className="text-xs font-medium text-halo-text-muted">Agrupar por:</span>
          <div className="inline-flex rounded-lg border border-halo-border bg-halo-surface p-0.5">
            {(
              [
                { mode: "platform" as GroupBy, label: "Plataforma" },
                { mode: "client" as GroupBy, label: "Cliente" },
                { mode: "none" as GroupBy, label: "Nenhum" },
              ]
            ).map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleGroupByChange(mode)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
                  groupBy === mode
                    ? "bg-halo-purple text-white"
                    : "text-halo-text-muted hover:text-halo-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className={`mt-6 ${groupBy === "none" ? "" : "grid grid-cols-[180px_1fr] gap-6"}`}>
          {groupBy === "platform" && (
            <aside className="flex flex-col gap-1">
              <FolderButton
                active={!platformFilter}
                onClick={() => handlePlatformChange("")}
                icon={<AllFolderIcon />}
                label="Todas"
                count={allProjects.length}
              />
              {PLATFORM_ORDER.map((pf) => (
                <FolderButton
                  key={pf}
                  active={platformFilter === pf}
                  onClick={() => handlePlatformChange(pf)}
                  icon={<PlatformIconBadge platform={pf} />}
                  label={PLATFORM_LABELS[pf]}
                  count={platformCounts.get(pf) ?? 0}
                />
              ))}
            </aside>
          )}

          {groupBy === "client" && (
            <aside className="flex flex-col gap-1">
              <FolderButton
                active={!clientIdFilter}
                onClick={() => handleClientChange("")}
                icon={<AllFolderIcon />}
                label="Todos"
                count={allProjects.length}
              />
              {clients.map((c) => (
                <FolderButton
                  key={c.id}
                  active={clientIdFilter === c.id}
                  onClick={() => handleClientChange(c.id)}
                  icon={<Avatar name={c.name} imageUrl={c.imageUrl} gradient className="h-5 w-5 text-[9px]" />}
                  label={c.name}
                  count={clientCounts.get(c.id) ?? 0}
                />
              ))}
            </aside>
          )}

          <div className="min-w-0">
            <ProjectsToolbar
              search={search}
              onSearchChange={(value) => updateParams({ q: value || null })}
              clientId={clientIdFilter}
              onClientChange={handleClientChange}
              clients={clients}
              showClientFilter={groupBy !== "client"}
              platform={platformFilter}
              onPlatformChange={handlePlatformChange}
              showPlatformFilter={groupBy !== "platform"}
              tag={tag}
              onTagChange={(value) => updateParams({ tag: value || null })}
              sortValue={`${sort}:${order}`}
              onSortChange={(value) => {
                const [nextSort, nextOrder] = value.split(":");
                updateParams({ sort: nextSort, order: nextOrder });
              }}
            />

            <div className="mt-8">
              {loading ? (
                <ProjectGridSkeleton />
              ) : error ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-halo-border px-8 py-20 text-center">
                  <p className="text-sm text-halo-text-muted">Não foi possível carregar os projetos.</p>
                  <p className="mt-1 text-xs text-halo-text-muted">{error}</p>
                </div>
              ) : !filteredProjects || filteredProjects.length === 0 ? (
                <EmptyState
                  title="Nenhum projeto encontrado"
                  message="Nenhum projeto corresponde à pasta ou aos filtros atuais."
                  showCreateButton={false}
                />
              ) : groupBy === "platform" ? (
                <div className="animate-fade-in flex flex-col gap-10">
                  {clientSubgroups.map(({ client, items }) => (
                    <div key={client.id}>
                      <SubsectionHeader
                        icon={<Avatar name={client.name} imageUrl={client.imageUrl} gradient className="h-6 w-6 text-[10px]" />}
                        name={client.name}
                        count={items.length}
                      />
                      <div className={CARD_GRID_CLASSES}>
                        {items.map((project) => (
                          <ProjectCard
                            key={project.id}
                            project={project}
                            onEdit={() => setEditingProject(project)}
                            onDelete={() => setDeletingProject(project)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : groupBy === "client" ? (
                <div className="animate-fade-in flex flex-col gap-10">
                  {platformSubgroups.map(({ platform, items }) => (
                    <div key={platform}>
                      <SubsectionHeader
                        icon={<PlatformIconBadge platform={platform} />}
                        name={PLATFORM_LABELS[platform]}
                        count={items.length}
                      />
                      <div className={CARD_GRID_CLASSES}>
                        {items.map((project) => (
                          <ProjectCard
                            key={project.id}
                            project={project}
                            onEdit={() => setEditingProject(project)}
                            onDelete={() => setDeletingProject(project)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`animate-fade-in ${CARD_GRID_CLASSES}`}>
                  {filteredProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onEdit={() => setEditingProject(project)}
                      onDelete={() => setDeletingProject(project)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSaved={handleEditSaved}
        />
      )}

      {deletingProject && (
        <ConfirmDialog
          title={t("dashboard.deleteProject")}
          message="Tem certeza? Esta ação não pode ser desfeita."
          confirmLabel={t("dashboard.confirmDelete")}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeletingProject(null)}
        />
      )}
    </div>
  );
}
