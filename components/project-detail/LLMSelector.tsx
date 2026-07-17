"use client";

import { useState } from "react";
import { LLM_PROVIDERS } from "@/lib/llm/providers";

type StageKey = "script" | "seo" | "thumbnail";

// Maps the compact stageKey prop to the actual projects.llm_* column PATCH
// /api/projects/[id] expects (0014) — keeps call sites terse (`stageKey="seo"`)
// without leaking the DB column name into every usage.
const STAGE_FIELD: Record<StageKey, "llm_script" | "llm_seo" | "llm_thumbnail"> = {
  script: "llm_script",
  seo: "llm_seo",
  thumbnail: "llm_thumbnail",
};

interface LLMSelectorProps {
  /** Needed to PATCH /api/projects/[id] — not in the original prop list but
   * structurally required to persist a selection. */
  projectId: string;
  stageKey: StageKey;
  value: string;
  onChange: (value: string) => void;
  label: string;
  /** Header/inline placements (fix, post-0014) — no visible label text above
   * the select (still exposed via aria-label), smaller height/font, no
   * min-width. Full labeled form stays the default for standalone
   * "before generate" placements where there's room for it. */
  compact?: boolean;
}

// Compact per-stage model dropdown (0014) — the multi-provider selector UI
// CLAUDE.md's "Not built yet" section flagged as missing (SEO Engine already
// accepted an llmProvider override per-call, nothing in the UI exposed it).
// Self-contained: PATCHes the project the moment a new value is picked, same
// "component owns its own persistence" pattern as ScriptStage's mode toggle.
export function LLMSelector({
  projectId,
  stageKey,
  value,
  onChange,
  label,
  compact = false,
}: LLMSelectorProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: string) {
    if (next === value || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [STAGE_FIELD[stageKey]]: next }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Falha ao trocar modelo");
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao trocar modelo");
    } finally {
      setSaving(false);
    }
  }

  const select = (
    <select
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      disabled={saving}
      aria-label={label}
      className={
        compact
          ? "h-6 rounded-md border border-gray-200 bg-background px-1.5 text-[10px] text-gray-500 outline-none transition-colors duration-200 focus:border-accent disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400"
          : "h-9 w-fit min-w-[240px] rounded-lg border border-gray-200 bg-background px-2.5 text-xs text-foreground outline-none transition-colors duration-200 focus:border-accent disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700"
      }
    >
      {LLM_PROVIDERS.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.badge ? ` — ${p.badge}` : ""}
        </option>
      ))}
    </select>
  );

  if (compact) {
    return (
      <div className="inline-flex items-center gap-1.5">
        {select}
        {error && <span className="text-[10px] text-red-600 dark:text-red-400">{error}</span>}
      </div>
    );
  }

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        🤖 {label}
      </span>
      {select}
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </label>
  );
}
