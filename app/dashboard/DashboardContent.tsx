"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PlusIcon } from "@/components/icons";
import { Avatar } from "@/components/dashboard/Avatar";
import { Breadcrumb } from "@/components/dashboard/Breadcrumb";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { ProjectGridSkeleton } from "@/components/dashboard/Skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ProjectsToolbar } from "@/components/dashboard/ProjectsToolbar";
import { EditProjectModal } from "@/components/dashboard/EditProjectModal";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { useToast } from "@/components/dashboard/toast";
import { HaloMark } from "@/components/logo";
import { useT } from "@/lib/i18n/context";
import type { ClientProfile, Project } from "@/lib/dashboard/types";

interface ClientGroup {
  client: ClientProfile;
  items: Project[];
}

export function DashboardContent() {
  const router = useRouter();
  const t = useT();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);

  const search = searchParams.get("q") ?? "";
  const clientIdFilter = searchParams.get("clientId") ?? "";
  const tag = searchParams.get("tag") ?? "";
  const sort = searchParams.get("sort") ?? "updated_at";
  const order = searchParams.get("order") ?? "desc";
  const view = searchParams.get("view") === "byClient" ? "byClient" : "flat";

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  // Client list for the toolbar's filter dropdown — fetched once, not
  // re-fetched on every filter change like the projects list below.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/clients")
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setClients(body.clients ?? []);
      })
      .catch(() => {
        // Non-fatal — the client filter dropdown just stays empty.
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
        if (search) qs.set("q", search);
        // Always send clientId — an empty toolbar filter means "all
        // clients" now (the API's actual default), distinct from "caller
        // didn't pass the param" (which the API can't tell apart from this
        // otherwise). Needed for "Por cliente" to have more than one group.
        qs.set("clientId", clientIdFilter || "all");
        if (tag) qs.set("tag", tag);
        qs.set("sort", sort);
        qs.set("order", order);

        const res = await fetch(`/api/projects?${qs.toString()}`, {
          signal: controller.signal,
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? "Falha ao carregar projetos");
        setProjects(body.projects);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Falha ao carregar projetos");
      }
    }

    load();
    return () => controller.abort();
  }, [search, clientIdFilter, tag, sort, order]);

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
    setProjects((prev) => prev?.map((p) => (p.id === id ? { ...p, ...patch } : p)) ?? prev);
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
      setProjects((prev) => prev?.filter((p) => p.id !== target.id) ?? prev);
      showToast("Projeto excluído", "info");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Falha ao excluir projeto", "info");
    } finally {
      setDeletingProject(null);
    }
  }

  const loading = projects === null && error === null;
  const hasActiveFilters = Boolean(search || clientIdFilter || tag);

  // Grouping happens entirely over the already-fetched list — no separate
  // fetch for "Por cliente", each Project already carries its own `client`.
  const groupedByClient = useMemo<ClientGroup[]>(() => {
    if (!projects) return [];
    const byId = new Map<string, ClientGroup>();
    for (const project of projects) {
      const existing = byId.get(project.client.id);
      if (existing) existing.items.push(project);
      else byId.set(project.client.id, { client: project.client, items: [project] });
    }
    return [...byId.values()].sort((a, b) => a.client.name.localeCompare(b.client.name));
  }, [projects]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950/40">
      <div className="mx-auto max-w-5xl px-6 py-12 sm:px-8 sm:py-16">
        <Breadcrumb items={[{ label: "Início", href: "/" }, { label: "Dashboard" }]} />

        <header className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-light tracking-tight text-foreground">
              {t("dashboard.pageTitle")}
            </h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {t("dashboard.pageSubtitle")}
            </p>
          </div>

          <button
            type="button"
            onClick={handleCreate}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-all duration-200 hover:bg-accent-hover"
          >
            <PlusIcon className="h-4 w-4" />
            {t("dashboard.newProject")}
          </button>
        </header>

        <div className="mt-6 inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-800">
          <button
            type="button"
            onClick={() => updateParams({ view: null })}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
              view === "flat"
                ? "bg-accent text-white"
                : "text-gray-500 hover:text-foreground dark:text-gray-400"
            }`}
          >
            Todos os projetos
          </button>
          <button
            type="button"
            onClick={() => updateParams({ view: "byClient" })}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
              view === "byClient"
                ? "bg-accent text-white"
                : "text-gray-500 hover:text-foreground dark:text-gray-400"
            }`}
          >
            Por cliente
          </button>
        </div>

        <div className="mt-4">
          <ProjectsToolbar
            search={search}
            onSearchChange={(value) => updateParams({ q: value || null })}
            clientId={clientIdFilter}
            onClientChange={(value) => updateParams({ clientId: value || null })}
            clients={clients}
            tag={tag}
            onTagChange={(value) => updateParams({ tag: value || null })}
            sortValue={`${sort}:${order}`}
            onSortChange={(value) => {
              const [nextSort, nextOrder] = value.split(":");
              updateParams({ sort: nextSort, order: nextOrder });
            }}
          />
        </div>

        <section className="mt-8">
          {loading ? (
            <ProjectGridSkeleton />
          ) : error ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 px-8 py-20 text-center dark:border-gray-800">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Não foi possível carregar os projetos.
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{error}</p>
            </div>
          ) : projects && projects.length > 0 && view === "byClient" ? (
            <div className="animate-fade-in flex flex-col gap-10">
              {groupedByClient.map(({ client, items }) => (
                <div key={client.id}>
                  <div className="mb-4 flex items-center gap-2">
                    <Avatar name={client.name} imageUrl={client.imageUrl} className="h-7 w-7 text-xs" />
                    <h3 className="text-sm font-medium text-foreground">{client.name}</h3>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {items.length} projeto{items.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
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
          ) : projects && projects.length > 0 ? (
            <div className="grid animate-fade-in grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onEdit={() => setEditingProject(project)}
                  onDelete={() => setDeletingProject(project)}
                />
              ))}
            </div>
          ) : hasActiveFilters ? (
            <EmptyState
              title="Nenhum projeto encontrado"
              message="Nenhum projeto corresponde aos filtros atuais. Ajuste a busca, o cliente ou a tag."
              showCreateButton={false}
            />
          ) : (
            <EmptyState onCreate={handleCreate} />
          )}
        </section>
      </div>

      {/* Discreet brand watermark — desktop only, MobileNav already owns the
          bottom bar on small screens. */}
      <Link
        href="/"
        className="fixed bottom-6 right-6 z-10 hidden flex-col items-center gap-1 opacity-40 transition-opacity duration-200 hover:opacity-70 md:flex"
      >
        <HaloMark className="h-8 w-8" />
        <span
          className="text-[9px] font-medium text-gray-500 dark:text-gray-400"
          style={{ letterSpacing: "2px" }}
        >
          HALO STUDIO
        </span>
      </Link>

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
