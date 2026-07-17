// Multi-provider LLM catalog (0014) — the "not built yet" gap CLAUDE.md
// flagged: SEO Engine already accepted an llmProvider override per-call,
// nothing in the UI exposed it. LLMSelector (components/project-detail/
// LLMSelector.tsx) reads this list; script-forge.ts/seo-engine.ts/
// thumbnail-text.ts all pass the selected id straight to OpenRouter, which
// proxies to whichever underlying provider the id names.

export type LLMProvider = {
  id: string; // e.g. "google/gemini-2.5-flash" — OpenRouter model id, used verbatim
  name: string; // e.g. "Gemini 2.5 Flash"
  description: string; // e.g. "Rápido e eficiente"
  badge?: string; // e.g. "Recomendado"
};

export const LLM_PROVIDERS: LLMProvider[] = [
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    description: "Rápido, eficiente e econômico",
    badge: "Padrão",
  },
  {
    id: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    description: "Melhor para scripts longos e densos",
  },
  {
    id: "anthropic/claude-sonnet-4-5",
    name: "Claude Sonnet",
    description: "Melhor para ICP e conteúdo nuançado",
    badge: "Recomendado para ICP",
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    description: "Alta qualidade, familiar para clientes",
  },
];

export const DEFAULT_LLM = "google/gemini-2.5-flash";

// Used by the "Powered by [modelo]" badge (ScriptStage/SeoStage/
// ThumbnailStage) — falls back to the raw id for any model id not in this
// list (e.g. one entered before this catalog existed, or a future addition
// to OpenRouter's own catalog not yet added here).
export function getLLMProviderName(id: string | null | undefined): string {
  if (!id) return "—";
  return LLM_PROVIDERS.find((p) => p.id === id)?.name ?? id;
}
