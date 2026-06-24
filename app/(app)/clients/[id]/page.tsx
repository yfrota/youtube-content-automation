"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Avatar } from "@/components/dashboard/Avatar";
import { Breadcrumb } from "@/components/dashboard/Breadcrumb";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { EditClientModal } from "@/components/dashboard/EditClientModal";
import { EditProjectModal } from "@/components/dashboard/EditProjectModal";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { ProjectGridSkeleton } from "@/components/dashboard/Skeleton";
import { useToast } from "@/components/dashboard/toast";
import { PencilIcon, PlusIcon } from "@/components/icons";
import type { ClientProfile, Priority, Project } from "@/lib/dashboard/types";

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();

  const [client, setClient] = useState<ClientProfile | null>(null);
  const [projectsCount, setProjectsCount] = useState(0);
  const [clientError, setClientError] = useState<string | null>(null);
  const [editingClient, setEditingClient] = useState(false);

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch(`/api/clients/${params.id}`, { signal: controller.signal });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? "Falha ao carregar cliente");
        setClient(body.client);
        setProjectsCount(body.projectsCount ?? 0);
      } catch (err) {
        if (controller.signal.aborted) return;
        setClientError(err instanceof Error ? err.message : "Falha ao carregar cliente");
      }
    }

    load();
    return () => controller.abort();
  }, [params.id]);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch(`/api/projects?clientId=${params.id}`, {
          signal: controller.signal,
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? "Falha ao carregar projetos");
        setProjects(body.projects);
      } catch (err) {
        if (controller.signal.aborted) return;
        setProjectsError(err instanceof Error ? err.message : "Falha ao carregar projetos");
      }
    }

    load();
    return () => controller.abort();
  }, [params.id]);

  function handleNewProject() {
    router.push(`/projects/new?clientId=${params.id}`);
  }

  function handleEditProjectSaved(patch: {
    title: string;
    priority: Priority;
    deadline: string | null;
    tags: string[];
    updatedAt: string;
  }) {
    const id = editingProject?.id;
    setProjects((prev) => prev?.map((p) => (p.id === id ? { ...p, ...patch } : p)) ?? prev);
  }

  async function handleDeleteProjectConfirm() {
    if (!deletingProject) return;
    const target = deletingProject;
    try {
      const res = await fetch(`/api/projects/${target.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Falha ao excluir projeto");
      }
      setProjects((prev) => prev?.filter((p) => p.id !== target.id) ?? prev);
      setProjectsCount((c) => Math.max(0, c - 1));
      showToast("Projeto excluído", "info");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Falha ao excluir projeto", "info");
    } finally {
      setDeletingProject(null);
    }
  }

  if (clientError) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-12 sm:px-8 sm:py-16">
        <Breadcrumb items={[{ label: "Início", href: "/" }, { label: "Clientes", href: "/clients" }]} />
        <div className="mt-10 flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 px-8 py-20 text-center dark:border-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Não foi possível carregar o cliente.
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{clientError}</p>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="mx-auto max-w-5xl animate-pulse px-6 py-12 sm:px-8 sm:py-16">
        <div className="h-3 w-32 rounded bg-gray-100 dark:bg-gray-800" />
        <div className="mt-6 flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-800" />
          <div className="h-6 w-48 rounded bg-gray-100 dark:bg-gray-800" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 sm:px-8 sm:py-16">
      <Breadcrumb
        items={[
          { label: "Início", href: "/" },
          { label: "Clientes", href: "/clients" },
          { label: client.name },
        ]}
      />

      <header className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Avatar name={client.name} imageUrl={client.imageUrl} className="h-16 w-16 text-xl" />
          <div>
            <h1 className="text-2xl font-light tracking-tight text-foreground">{client.name}</h1>
            <div className="mt-1 flex flex-col gap-0.5 text-sm text-gray-500 dark:text-gray-400">
              {client.email && <p>{client.email}</p>}
              {client.phone && <p>{client.phone}</p>}
            </div>
            {client.description && (
              <p className="mt-2 max-w-xl text-sm text-gray-500 dark:text-gray-400">
                {client.description}
              </p>
            )}
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
              {projectsCount} projeto{projectsCount === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setEditingClient(true)}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-600 transition-colors duration-200 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50"
        >
          <PencilIcon className="h-3.5 w-3.5" />
          Editar
        </button>
      </header>

      <section className="mt-12">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-light text-foreground">Projetos</h2>
          <button
            type="button"
            onClick={handleNewProject}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-white transition-all duration-200 hover:bg-accent-hover"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Novo projeto
          </button>
        </div>

        <div className="mt-6">
          {projects === null && !projectsError ? (
            <ProjectGridSkeleton />
          ) : projectsError ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 px-8 py-20 text-center dark:border-gray-800">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Não foi possível carregar os projetos.
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{projectsError}</p>
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
          ) : (
            <EmptyState
              title="Nenhum projeto ainda"
              message="Crie o primeiro projeto deste cliente."
              onCreate={handleNewProject}
            />
          )}
        </div>
      </section>

      {editingClient && (
        <EditClientModal
          client={client}
          onClose={() => setEditingClient(false)}
          onSaved={(updated) => setClient(updated)}
        />
      )}

      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSaved={handleEditProjectSaved}
        />
      )}

      {deletingProject && (
        <ConfirmDialog
          title="Excluir projeto"
          message="Tem certeza? Esta ação não pode ser desfeita."
          confirmLabel="Excluir"
          onConfirm={handleDeleteProjectConfirm}
          onCancel={() => setDeletingProject(null)}
        />
      )}
    </div>
  );
}
