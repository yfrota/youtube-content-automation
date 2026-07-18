"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlusIcon } from "@/components/icons";
import { Breadcrumb } from "@/components/dashboard/Breadcrumb";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { ProjectGridSkeleton } from "@/components/dashboard/Skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { StatsRow } from "@/components/dashboard/StatsRow";
import { EditProjectModal } from "@/components/dashboard/EditProjectModal";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { useToast } from "@/components/dashboard/toast";
import { HaloMark } from "@/components/logo";
import { useT } from "@/lib/i18n/context";
import type { ClientProfile, Project } from "@/lib/dashboard/types";

const RECENT_PROJECTS_LIMIT = 6;

// Overview page (Opção C) — the full filterable/groupable project list now
// lives at /projects (components/projects/ProjectsView.tsx). This page only
// needs a single filter (StatsRow's "Visão" client selector), so it's plain
// useState rather than the URL-backed pattern /projects uses for its many
// filters — nothing else on this page needs to read or share that value.
export function DashboardContent() {
  const router = useRouter();
  const t = useT();
  const { showToast } = useToast();

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [selectedClientId, setSelectedClientId] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/clients")
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setClients(body.clients ?? []);
      })
      .catch(() => {
        // Non-fatal — the "Visão" selector just stays empty.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // "Atividade recente" is scoped to the same "Visão" client filter StatsRow
  // uses, so the whole page stays coherent when a specific client is picked.
  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const qs = new URLSearchParams();
        qs.set("clientId", selectedClientId || "all");
        qs.set("sort", "updated_at");
        qs.set("order", "desc");

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
  }, [selectedClientId]);

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
  const recentProjects = (projects ?? []).slice(0, RECENT_PROJECTS_LIMIT);

  return (
    <div className="min-h-screen bg-halo-bg">
      <div className="mx-auto max-w-5xl px-6 py-12 sm:px-8 sm:py-16">
        <Breadcrumb items={[{ label: "Início", href: "/" }, { label: "Dashboard" }]} />

        <header className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-halo-text">Dashboard</h1>
            <p className="mt-2 text-sm text-halo-text-muted">Visão geral da sua produção</p>
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

        <section className="mt-10">
          <p className="text-xs font-semibold uppercase tracking-wide text-halo-text-muted">
            Visão geral
          </p>
          <div className="mt-3">
            <StatsRow
              projects={projects ?? []}
              clients={clients}
              selectedClientId={selectedClientId}
              onClientChange={setSelectedClientId}
            />
          </div>
        </section>

        <section className="mt-10">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-halo-text-muted">
              Atividade recente
            </p>
            <Link href="/projects" className="text-xs font-medium text-halo-purple hover:underline">
              Ver todos os projetos →
            </Link>
          </div>

          <div className="mt-4">
            {loading ? (
              <ProjectGridSkeleton count={RECENT_PROJECTS_LIMIT} />
            ) : error ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-halo-border px-8 py-20 text-center">
                <p className="text-sm text-halo-text-muted">Não foi possível carregar os projetos.</p>
                <p className="mt-1 text-xs text-halo-text-muted">{error}</p>
              </div>
            ) : recentProjects.length > 0 ? (
              <div className="grid animate-fade-in grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {recentProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onEdit={() => setEditingProject(project)}
                    onDelete={() => setDeletingProject(project)}
                  />
                ))}
              </div>
            ) : selectedClientId ? (
              <EmptyState
                title="Nenhum projeto para este cliente"
                message="Este cliente ainda não tem projetos."
                showCreateButton={false}
              />
            ) : (
              <EmptyState onCreate={handleCreate} />
            )}
          </div>
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
