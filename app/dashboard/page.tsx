"use client";

import { useEffect, useState } from "react";
import { PlusIcon } from "@/components/icons";
import { Breadcrumb } from "@/components/dashboard/Breadcrumb";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { ProjectGridSkeleton } from "@/components/dashboard/Skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { useToast } from "@/components/dashboard/toast";
import { MOCK_PROJECTS, type MockProject } from "@/lib/mock/projects";

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M12 3a9 9 0 0 1 9 9h-3a6 6 0 0 0-6-6V3Z"
      />
    </svg>
  );
}

export default function DashboardPage() {
  const { showToast } = useToast();
  const [projects, setProjects] = useState<MockProject[] | null>(null);
  const [creating, setCreating] = useState(false);

  // Simulate the initial data fetch so the skeleton + load toast are visible.
  // Cleanup clears the timer, which also collapses React StrictMode's
  // double-invoke in dev into a single toast.
  useEffect(() => {
    const timer = setTimeout(() => {
      setProjects(MOCK_PROJECTS);
      showToast("Projetos carregados");
    }, 700);
    return () => clearTimeout(timer);
  }, [showToast]);

  function handleCreate() {
    if (creating) return;
    setCreating(true);
    setTimeout(() => {
      setCreating(false);
      showToast("Em breve: criação de projetos", "info");
    }, 900);
  }

  const loading = projects === null;
  const isEmpty = projects !== null && projects.length === 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 sm:px-8 sm:py-16">
      <Breadcrumb items={[{ label: "Início" }, { label: "Dashboard" }]} />

      <header className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-light tracking-tight text-foreground">
            Projetos
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Acompanhe cada etapa da produção, do roteiro à publicação.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCreate}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-all duration-200 hover:bg-accent-hover"
        >
          {creating ? <Spinner /> : <PlusIcon className="h-4 w-4" />}
          Novo projeto
        </button>
      </header>

      <section className="mt-10">
        {loading ? (
          <ProjectGridSkeleton />
        ) : isEmpty ? (
          <EmptyState onCreate={handleCreate} />
        ) : (
          <div className="grid animate-fade-in grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
