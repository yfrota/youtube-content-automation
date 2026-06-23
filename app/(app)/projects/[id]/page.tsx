"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Avatar } from "@/components/dashboard/Avatar";
import { Breadcrumb } from "@/components/dashboard/Breadcrumb";
import { ProgressBar } from "@/components/dashboard/ProgressBar";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { PipelineStage, type StageState } from "@/components/project-detail/PipelineStage";
import { ScriptStage } from "@/components/project-detail/ScriptStage";
import { SeoStage } from "@/components/project-detail/SeoStage";
import { LockedStageContent } from "@/components/project-detail/LockedStageContent";
import { relativeTime } from "@/lib/time";
import {
  PLATFORM_BADGE_STYLES,
  PLATFORM_LABELS,
  type ApprovalStatus,
  type ProjectDetail,
  type ScriptDetail,
  type SeoData,
} from "@/lib/dashboard/types";

// Stage 1 stays expanded while still being worked on (draft) or sitting in
// internal review (kelly_review); anything past that collapses to a summary
// by default, per the product spec — the user can still re-expand manually.
function scriptStageState(status: ApprovalStatus): StageState {
  return status === "draft" || status === "kelly_review" ? "active" : "complete";
}

function nextStageState(unlocked: boolean, status: ApprovalStatus): StageState {
  if (!unlocked) return "locked";
  return status === "draft" ? "active" : "complete";
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatingScript, setGeneratingScript] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch(`/api/projects/${params.id}`, {
          signal: controller.signal,
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? "Falha ao carregar projeto");
        setProject(body.project);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Falha ao carregar projeto");
      }
    }

    load();
    return () => controller.abort();
  }, [params.id]);

  function handleScriptChange(script: ScriptDetail) {
    setProject((prev) => (prev ? { ...prev, script } : prev));
  }

  function handleSeoChange(seo: SeoData) {
    setProject((prev) => (prev ? { ...prev, seo, seoStatus: seo.status } : prev));
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 sm:px-8 sm:py-16">
        <Breadcrumb items={[{ label: "Início", href: "/" }, { label: "Dashboard" }]} />
        <div className="mt-10 flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 px-8 py-20 text-center dark:border-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Não foi possível carregar o projeto.
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-3xl animate-pulse px-6 py-12 sm:px-8 sm:py-16">
        <div className="h-3 w-32 rounded bg-gray-100 dark:bg-gray-800" />
        <div className="mt-6 h-8 w-2/3 rounded bg-gray-100 dark:bg-gray-800" />
        <div className="mt-4 h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800" />
        <div className="mt-12 flex flex-col gap-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-gray-50 dark:bg-gray-800/40" />
          ))}
        </div>
      </div>
    );
  }

  const scriptStatus: ApprovalStatus = project.script?.status ?? "draft";
  const seoStatus: ApprovalStatus = project.seoStatus ?? "draft";
  const thumbnailStatus: ApprovalStatus = project.thumbnailStatus ?? "draft";

  const seoUnlocked = scriptStatus !== "draft";
  const thumbnailUnlocked = seoUnlocked && seoStatus !== "draft";
  const checklistUnlocked = thumbnailUnlocked && thumbnailStatus !== "draft";

  const doneCount = [scriptStatus, seoStatus, thumbnailStatus, project.status].filter(
    (s) => s === "approved" || s === "published"
  ).length;
  const progress = Math.round((doneCount / 4) * 100);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 sm:px-8 sm:py-16">
      <Breadcrumb
        items={[
          { label: "Início", href: "/" },
          { label: "Dashboard", href: "/dashboard" },
          { label: project.title },
        ]}
      />

      <header className="mt-6">
        <div className="flex items-center gap-2">
          <Avatar name={project.client.name} imageUrl={project.client.imageUrl} />
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {project.client.name}
          </span>
        </div>
        {project.channelUrl && (
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{project.channelUrl}</p>
        )}

        <div className="mt-3 flex items-start justify-between gap-3">
          <h1 className="text-2xl font-light tracking-tight text-foreground">
            {project.title}
          </h1>
          <span
            style={{
              background: PLATFORM_BADGE_STYLES[project.platform].background,
              color: PLATFORM_BADGE_STYLES[project.platform].color,
            }}
            className="flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
          >
            {PLATFORM_LABELS[project.platform]}
          </span>
        </div>
        <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
          Criado {relativeTime(project.createdAt)}
        </p>

        <div className="mt-5 flex items-center gap-3">
          <ProgressBar value={progress} />
          <span className="shrink-0 text-xs tabular-nums text-gray-400 dark:text-gray-500">
            {progress}%
          </span>
        </div>
      </header>

      <div className="mt-12 flex flex-col">
        <PipelineStage
          index={1}
          title="Roteiro"
          state={scriptStageState(scriptStatus)}
          badge={
            generatingScript ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                Gerando...
              </span>
            ) : (
              <StatusBadge status={scriptStatus} />
            )
          }
          collapsible
          defaultExpanded={scriptStatus === "draft" || scriptStatus === "kelly_review"}
        >
          <ScriptStage
            projectId={project.id}
            platform={project.platform}
            language={project.language}
            script={project.script}
            onScriptChange={handleScriptChange}
            onGeneratingChange={setGeneratingScript}
          />
        </PipelineStage>

        <PipelineStage
          index={2}
          title="SEO"
          state={nextStageState(seoUnlocked, seoStatus)}
        >
          {!seoUnlocked || !project.script ? (
            <LockedStageContent message="Disponível após aprovar o roteiro" />
          ) : (
            <SeoStage
              projectId={project.id}
              scriptId={project.script.id}
              language={project.language}
              keywordsContext={project.script.keywordsContext}
              seo={project.seo}
              onSeoChange={handleSeoChange}
            />
          )}
        </PipelineStage>

        <PipelineStage
          index={3}
          title="Thumbnail"
          state={nextStageState(thumbnailUnlocked, thumbnailStatus)}
        >
          <LockedStageContent message="Disponível após aprovar o SEO" />
        </PipelineStage>

        <PipelineStage
          index={4}
          title="Checklist de publicação"
          state={nextStageState(checklistUnlocked, project.status)}
          isLast
        >
          <LockedStageContent message="Disponível após aprovar a thumbnail" />
        </PipelineStage>
      </div>
    </div>
  );
}
