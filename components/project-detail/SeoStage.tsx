"use client";

import { useState } from "react";
import { useToast } from "@/components/dashboard/toast";
import { useT } from "@/lib/i18n/context";
import type { Language, SeoData } from "@/lib/dashboard/types";

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M12 3a9 9 0 0 1 9 9h-3a6 6 0 0 0-6-6V3Z"
      />
    </svg>
  );
}

function ctrBadgeStyle(score: number): string {
  if (score >= 8) return "bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-300";
  if (score >= 6) return "bg-yellow-50 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300";
  return "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400";
}

interface SeoStageProps {
  projectId: string;
  scriptId: string;
  language: Language;
  keywordsContext: string[] | null;
  seo: SeoData | null;
  onSeoChange: (seo: SeoData) => void;
}

export function SeoStage({
  projectId,
  scriptId,
  language,
  keywordsContext,
  seo,
  onSeoChange,
}: SeoStageProps) {
  const { showToast } = useToast();
  const t = useT();
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [selectedTitleText, setSelectedTitleText] = useState<string | null>(
    seo?.selectedTitle ?? null
  );
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [approving, setApproving] = useState(false);
  const [unapproving, setUnapproving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/agents/seo-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // language is also resolved authoritatively from the project row
        // server-side (see app/api/agents/seo-engine/route.ts) — sent here
        // too only for symmetry with ScriptStage's calls, not load-bearing.
        body: JSON.stringify({ projectId, scriptId, language }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Falha ao gerar SEO");

      const row = body.seo as {
        id: string;
        status: SeoData["status"];
        titles: SeoData["titles"];
        description: string | null;
        tags: string[];
        hashtags: string[];
        selected_title: string | null;
        llm_provider: string | null;
        created_at: string;
      };
      const next: SeoData = {
        id: row.id,
        status: row.status,
        titles: row.titles,
        description: row.description,
        tags: row.tags,
        hashtags: row.hashtags,
        selectedTitle: row.selected_title,
        llmProvider: row.llm_provider,
        createdAt: row.created_at,
      };
      onSeoChange(next);
      setSelectedTitleText(next.selectedTitle);
      showToast("SEO gerado com sucesso");
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Falha ao gerar SEO");
    } finally {
      setGenerating(false);
    }
  }

  async function handleApprove() {
    if (!seo || !selectedTitleText || approving) return;
    setApproving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/seo/${seo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "kelly_review", selectedTitle: selectedTitleText }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Falha ao aprovar SEO");
      onSeoChange({ ...seo, status: "kelly_review", selectedTitle: selectedTitleText });
      showToast("SEO aprovado e enviado para revisão");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Falha ao aprovar SEO");
    } finally {
      setApproving(false);
    }
  }

  async function handleUnapprove() {
    if (!seo || unapproving) return;
    setUnapproving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/seo/${seo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Falha ao desfazer aprovação");
      onSeoChange({ ...seo, status: "draft" });
      showToast("Aprovação desfeita", "info");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Falha ao desfazer aprovação");
    } finally {
      setUnapproving(false);
    }
  }

  // ESTADO C — approved.
  if (seo && seo.status !== "draft") {
    return (
      <div className="flex flex-col gap-4">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/50 dark:text-green-300">
          ✓ {t("seoStage.seoApproved")}
        </span>

        {seo.selectedTitle && (
          <p className="text-sm text-foreground">{seo.selectedTitle}</p>
        )}

        {seo.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {seo.tags.slice(0, 10).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {actionError && <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}

        <div>
          <button
            type="button"
            onClick={handleUnapprove}
            disabled={unapproving}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-600 transition-colors duration-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50"
          >
            {unapproving && <Spinner />}← {t("seoStage.undoApproval")}
          </button>
        </div>
      </div>
    );
  }

  // ESTADO A — no SEO generated yet.
  if (!seo) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Gera títulos otimizados, descrição e tags com base no roteiro aprovado e nas keywords
          selecionadas.
        </p>

        {keywordsContext && keywordsContext.length > 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Keywords incluídas: {keywordsContext.join(", ")}
          </p>
        )}

        {generateError && (
          <p className="text-sm text-red-600 dark:text-red-400">{generateError}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-all duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating && <Spinner />}
            {t("seoStage.generateSeo")}
          </button>
          {generating && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t("seoStage.generatingSeo")}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ESTADO B — generated, awaiting selection (status: draft).
  const descriptionLength = seo.description?.length ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
          {t("seoStage.titleOptions")}
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {seo.titles.map((title) => {
            const selected = selectedTitleText === title.text;
            return (
              <button
                key={title.text}
                type="button"
                onClick={() => setSelectedTitleText(title.text)}
                className={`w-full rounded-lg border p-3 text-left transition-colors duration-200 ${
                  selected
                    ? "border-accent bg-accent/5"
                    : "border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/40"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-foreground">{title.text}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${ctrBadgeStyle(title.ctrScore)}`}
                  >
                    {t("seoStage.ctrScore")} {title.ctrScore}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{title.reasoning}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
          {t("seoStage.description")}
        </p>
        <p
          className={`mt-2 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 ${
            descriptionExpanded ? "" : "line-clamp-4"
          }`}
        >
          {seo.description}
        </p>
        <div className="mt-1 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDescriptionExpanded((v) => !v)}
            className="text-xs font-medium text-accent hover:underline"
          >
            {descriptionExpanded ? "Recolher" : "Ver completo"}
          </button>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {descriptionLength} {t("seoStage.charCount")} (meta: 500-800)
          </span>
        </div>
      </div>

      {seo.tags.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {t("seoStage.tags")} ({seo.tags.length})
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {seo.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {seo.hashtags.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {t("seoStage.hashtags")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {seo.hashtags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {(generateError || actionError) && (
        <p className="text-sm text-red-600 dark:text-red-400">{generateError ?? actionError}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-600 transition-colors duration-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50"
        >
          {generating && <Spinner />}
          {t("seoStage.regenerate")}
        </button>
        <button
          type="button"
          onClick={handleApprove}
          disabled={approving || !selectedTitleText}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-all duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {approving && <Spinner />}
          {t("seoStage.approveSeo")}
        </button>
      </div>
    </div>
  );
}
