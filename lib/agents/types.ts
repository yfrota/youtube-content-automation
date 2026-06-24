import type { Platform } from "@/lib/connectors/types";

// Platform-agnostic agent contracts — `platform` is only ever a tag threaded
// through to the DB row and to RAG search scoping. Agents must never branch
// on its value; platform-specific formatting belongs in the connector layer.

// Content language, set per-project (see 0006_project_language.sql). Not a
// Postgres enum — enforced only at the application layer (the new-project
// form only ever offers these two), so this union is the actual constraint.
export type Language = "pt-BR" | "en-US";

// Content type, set per-project (see 0010_content_type_and_deliverables.sql)
// — selects which Script Forge prompt/structure applies. Not a Postgres
// enum either. Duplicated in lib/dashboard/types.ts, same deliberate
// cross-layer pattern as Language/Platform.
export type ContentType = "youtube_tutorial" | "podcast_vodcast" | "short_form";

export interface ScriptForgeInput {
  clientId: string;
  projectId: string;
  platform: Platform;
  rawTranscript: string;
  language: Language;
  contentType: ContentType;
}

// `type`, not `interface` — interfaces don't get an implicit index
// signature, which the scripts.chapters jsonb insert relies on structurally.
export type ScriptChapter = {
  title: string;
  startTime: string; // free-text timestamp label (e.g. "00:00"), not seconds
};

export interface ScriptForgeOutput {
  id: string;
  status: "draft";
  content: string;
  hook: string;
  chapters: ScriptChapter[];
  contentType: ContentType;
  // podcast_vodcast-only deliverables (0010) — null for youtube_tutorial/
  // short_form, where the tool is never asked to fill them.
  clipScript: string | null;
  ctaLine: string | null;
  podDescription: string | null;
  crossReferencedProjectIds: string[];
}

export interface SeoEngineInput {
  clientId: string;
  projectId: string;
  scriptId: string;
  platform: Platform;
  projectTitle: string;
  scriptContent: string;
  hook: string;
  chapters: ScriptChapter[];
  keywordsContext: string[];
  language: Language;
  // Overrides which OpenRouter model generates this SEO package — the
  // multi-provider selector the README describes, scoped to this one call.
  // Defaults to the module-level MODEL constant in seo-engine.ts if omitted.
  llmProvider?: string;
}

// `type`, not `interface` — same jsonb-structural-typing reason as
// ScriptChapter above (round-trips through the seo.titles column).
export type SeoTitleOption = {
  text: string;
  ctrScore: number;
  reasoning: string;
};

export interface SeoOutput {
  titles: SeoTitleOption[];
  description: string;
  tags: string[];
  hashtags: string[];
}
