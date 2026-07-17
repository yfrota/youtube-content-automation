"use client";

import { useState } from "react";
import { useToast } from "@/components/dashboard/toast";
import { LLMSelector } from "@/components/project-detail/LLMSelector";
import { getLLMProviderName } from "@/lib/llm/providers";
import type { ThumbnailData } from "@/lib/dashboard/types";

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

// The 3 variation angles the prompt asks for, in order — used only for the
// card subtitle label, purely cosmetic (the model's own headline/subtitle
// text is what actually varies).
const VARIATION_LABELS = ["Transformação", "Dor/Problema", "Curiosidade"];

interface ThumbnailStageProps {
  projectId: string;
  thumbnail: ThumbnailData | null;
  onThumbnailChange: (thumbnail: ThumbnailData) => void;
  llmThumbnail: string;
  onLlmThumbnailChange: (model: string) => void;
}

// Raw shape POST /api/agents/thumbnail-text and PATCH /api/thumbnails/[id]
// return (the DB row, snake_case) — mapped to ThumbnailData locally, same
// pattern ScriptStage/SeoStage use for their own agent-route responses.
function toThumbnailData(row: {
  id: string;
  status: ThumbnailData["status"];
  variations: ThumbnailData["variations"] | null;
  selected_variation: number | null;
  llm_provider: string | null;
  created_at: string;
}): ThumbnailData {
  return {
    id: row.id,
    status: row.status,
    variations: row.variations ?? [],
    selectedVariation: row.selected_variation,
    llmProvider: row.llm_provider,
    createdAt: row.created_at,
  };
}

export function ThumbnailStage({
  projectId,
  thumbnail,
  onThumbnailChange,
  llmThumbnail,
  onLlmThumbnailChange,
}: ThumbnailStageProps) {
  const { showToast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    thumbnail?.selectedVariation ?? null
  );
  const [approving, setApproving] = useState(false);
  const [unapproving, setUnapproving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/agents/thumbnail-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Falha ao gerar thumbnail");
      const next = toThumbnailData(body.thumbnail);
      onThumbnailChange(next);
      setSelectedIndex(next.selectedVariation);
      showToast("Thumbnail gerado com sucesso");
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Falha ao gerar thumbnail");
    } finally {
      setGenerating(false);
    }
  }

  async function handleApprove() {
    if (!thumbnail || selectedIndex === null || approving) return;
    setApproving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/thumbnails/${thumbnail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "kelly_review", selectedVariation: selectedIndex }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Falha ao aprovar thumbnail");
      onThumbnailChange({ ...thumbnail, status: "kelly_review", selectedVariation: selectedIndex });
      showToast("Thumbnail aprovado");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Falha ao aprovar thumbnail");
    } finally {
      setApproving(false);
    }
  }

  async function handleUnapprove() {
    if (!thumbnail || unapproving) return;
    setUnapproving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/thumbnails/${thumbnail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Falha ao desfazer aprovação");
      onThumbnailChange({ ...thumbnail, status: "draft" });
      showToast("Aprovação desfeita", "info");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Falha ao desfazer aprovação");
    } finally {
      setUnapproving(false);
    }
  }

  // ESTADO C — approved.
  if (thumbnail && thumbnail.status !== "draft") {
    const selected =
      thumbnail.selectedVariation !== null ? thumbnail.variations[thumbnail.selectedVariation] : null;
    return (
      <div className="flex flex-col gap-4">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/50 dark:text-green-300">
          ✓ Thumbnail Aprovado
        </span>

        {selected && (
          <div>
            <p className="text-sm font-medium text-foreground">{selected.headline}</p>
            <p className="mt-1 line-clamp-1 text-xs text-gray-400 dark:text-gray-500">
              🎨 {selected.visualStyle}
            </p>
          </div>
        )}

        {thumbnail.llmProvider && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            🤖 Powered by {getLLMProviderName(thumbnail.llmProvider)}
          </p>
        )}

        {actionError && <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}

        <div>
          <button
            type="button"
            onClick={handleUnapprove}
            disabled={unapproving}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-600 transition-colors duration-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50"
          >
            {unapproving && <Spinner />}← Desfazer
          </button>
        </div>
      </div>
    );
  }

  // ESTADO A — no thumbnail generated yet.
  if (!thumbnail) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Gere headlines e conceito visual para o thumbnail com base no roteiro e no perfil do
          público.
        </p>

        <LLMSelector
          projectId={projectId}
          stageKey="thumbnail"
          value={llmThumbnail}
          onChange={onLlmThumbnailChange}
          label="Modelo para thumbnail"
        />

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
            Gerar Thumbnail
          </button>
          {generating && (
            <span className="text-sm text-gray-500 dark:text-gray-400">Gerando...</span>
          )}
        </div>
      </div>
    );
  }

  // ESTADO B — generated, awaiting selection (status: draft).
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {thumbnail.variations.map((variation, i) => {
          const selected = selectedIndex === i;
          return (
            <div
              key={i}
              className={`flex flex-col gap-3 rounded-lg border p-4 transition-colors duration-200 ${
                selected
                  ? "border-accent bg-accent/5"
                  : "border-gray-200 dark:border-gray-800"
              }`}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Variação {i + 1} — {VARIATION_LABELS[i] ?? ""}
              </p>

              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  Headline
                </p>
                <p className="mt-0.5 text-base font-semibold leading-tight text-foreground">
                  {variation.headline}
                </p>
              </div>

              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  Subtítulo
                </p>
                <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">
                  {variation.subtitle}
                </p>
              </div>

              {variation.supportText && (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    Texto de apoio
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {variation.supportText}
                  </p>
                </div>
              )}

              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  🎨 Estilo visual
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {variation.visualStyle}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedIndex(i)}
                className={`mt-1 inline-flex h-8 items-center justify-center rounded-lg text-xs font-medium transition-colors duration-200 ${
                  selected
                    ? "bg-accent text-white"
                    : "border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50"
                }`}
              >
                {selected ? "✓ Selecionada" : "Selecionar esta variação"}
              </button>
            </div>
          );
        })}
      </div>

      {thumbnail.llmProvider && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500">
          🤖 Powered by {getLLMProviderName(thumbnail.llmProvider)}
        </p>
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
          Regenerar
        </button>
        <button
          type="button"
          onClick={handleApprove}
          disabled={approving || selectedIndex === null}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-all duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {approving && <Spinner />}
          Aprovar Thumbnail
        </button>
      </div>
    </div>
  );
}
