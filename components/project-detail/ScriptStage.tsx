"use client";

import { useState } from "react";
import { useToast } from "@/components/dashboard/toast";
import type { Platform, ScriptDetail } from "@/lib/dashboard/types";

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

interface ScriptStageProps {
  projectId: string;
  platform: Platform;
  script: ScriptDetail | null;
  onScriptChange: (script: ScriptDetail) => void;
  onGeneratingChange?: (generating: boolean) => void;
}

export function ScriptStage({
  projectId,
  platform,
  script,
  onScriptChange,
  onGeneratingChange,
}: ScriptStageProps) {
  const { showToast } = useToast();
  const [transcript, setTranscript] = useState("");
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!transcript.trim() || generating) return;
    setGenerating(true);
    onGeneratingChange?.(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/script-forge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, platform, rawTranscript: transcript }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Falha ao gerar roteiro");

      const result = body.script as {
        id: string;
        status: ScriptDetail["status"];
        content: string;
        hook: string;
        chapters: ScriptDetail["chapters"];
      };
      onScriptChange({
        id: result.id,
        status: result.status,
        content: result.content,
        hook: result.hook,
        chapters: result.chapters,
        createdAt: new Date().toISOString(),
      });
      showToast("Roteiro gerado com sucesso");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar roteiro");
    } finally {
      setGenerating(false);
      onGeneratingChange?.(false);
    }
  }

  async function handleApprove() {
    if (!script || approving) return;
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(`/api/scripts/${script.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "kelly_review" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Falha ao aprovar roteiro");
      onScriptChange({ ...script, status: "kelly_review" });
      showToast("Roteiro aprovado e enviado para revisão");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao aprovar roteiro");
    } finally {
      setApproving(false);
    }
  }

  if (!script) {
    return (
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Transcrição bruta
          </span>
          <textarea
            rows={8}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Cole aqui a transcrição bruta do vídeo..."
            className="rounded-lg border border-gray-200 bg-background p-3 text-sm text-foreground outline-none transition-colors duration-200 placeholder:text-gray-400 focus:border-accent dark:border-gray-700"
          />
        </label>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || !transcript.trim()}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-all duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating && <Spinner />}
            Gerar Script com IA
          </button>
          {generating && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Gerando seu roteiro...
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg bg-accent/5 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">Hook</p>
        <p className="mt-1 text-sm text-foreground">{script.hook}</p>
      </div>

      {script.chapters.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Capítulos
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {script.chapters.map((chapter, i) => (
              <li
                key={i}
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"
              >
                <span className="font-mono text-xs text-gray-400 dark:text-gray-500">
                  {chapter.startTime}
                </span>
                {chapter.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Roteiro completo
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-300">
          {script.content}
        </p>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {script.status === "draft" && (
        <div>
          <button
            type="button"
            onClick={handleApprove}
            disabled={approving}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-all duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {approving && <Spinner />}
            Aprovar roteiro
          </button>
        </div>
      )}
    </div>
  );
}
