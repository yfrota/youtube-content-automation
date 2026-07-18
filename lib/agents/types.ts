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

// Script Forge output mode, set per-project (see
// 0013_script_mode_and_review.sql) — 'rewrite' is the original behavior
// (reproduce the transcript as a YouTube-optimized script); 'review' never
// rewrites the creator's own words, it only annotates the transcript against
// a fixed structure/retention/quality checklist.
export type OutputMode = "rewrite" | "review";

export interface ScriptForgeInput {
  clientId: string;
  projectId: string;
  platform: Platform;
  rawTranscript: string;
  language: Language;
  contentType: ContentType;
  outputMode: OutputMode;
  // Optional creator instruction, read before generation and given top
  // priority in the prompt — e.g. "focus on retention elements in section
  // 2" in review mode, or "emphasize the personal story at minute 3" in
  // rewrite mode.
  contextNote?: string;
  // Which OpenRouter model id to call (0014, lib/llm/providers.ts) — read
  // from the project's own llm_script column by the route, same "per-project
  // setting, not caller-overridable" precedent as language/contentType.
  // Optional only so callers that predate this field don't break; script-
  // forge.ts itself falls back to DEFAULT_LLM when omitted.
  llmProvider?: string;
  // Audience profile context (0014, lib/agents/icp-context.ts) — empty
  // string when the client has no ICP configured yet.
  icpContext?: string;
}

// One checklist-element annotation from review mode (0013) — `type`, not
// `interface`, same structural-typing reason as ScriptChapter (this
// round-trips through the scripts.review_output jsonb column).
export type ReviewElement = {
  name: string;
  status: "present" | "missing" | "flag";
  // Only ever one of these three is populated, matching `status`.
  keep?: string;
  insert?: { text: string; placement: string };
  flag?: { issue: string; suggestion: string };
  // Catalog videos suggested for this element (checklist items 7/20 — episode
  // cross-referencing) — resolved server-side against this run's own RAG
  // matches, same "never trust a model-returned id verbatim" precedent as
  // ReferencedVideo in rewrite mode. Undefined for every other element.
  referencedVideos?: ReferencedVideo[];
};

// `type`, not `interface` — interfaces don't get an implicit index
// signature, which the scripts.chapters jsonb insert relies on structurally.
export type ScriptChapter = {
  title: string;
  startTime: string; // free-text timestamp label (e.g. "00:00"), not seconds
};

// Added in 0011 — a catalog video Script Forge actually referenced in the
// generated script (cross-referenced from the RAG context the model was
// given, not every RAG match — only ones the model says it used).
export type ReferencedVideo = {
  videoId: string;
  title: string;
  reason: string;
  youtubeUrl: string;
};

export interface ScriptForgeOutput {
  id: string;
  status: "draft";
  outputMode: OutputMode;
  // Null in review mode — nothing gets rewritten, see reviewOutput instead.
  content: string | null;
  hook: string | null;
  chapters: ScriptChapter[];
  contentType: ContentType;
  // podcast_vodcast-only deliverables (0010) — null for youtube_tutorial/
  // short_form, where the tool is never asked to fill them. Also null in
  // review mode.
  clipScript: string | null;
  ctaLine: string | null;
  podDescription: string | null;
  crossReferencedProjectIds: string[];
  // Added in 0011 — the subset of crossReferencedProjectIds' matches the
  // model actually says it referenced, with its own stated reason per
  // video. Always an array (never null) — empty when the model referenced
  // nothing, or in review mode (identifyReferencedVideoIds isn't run there).
  referencedVideos: ReferencedVideo[];
  // Populated only in review mode (0013) — null in rewrite mode.
  reviewOutput: ReviewElement[] | null;
  // The actual model id used for this generation (0014) — mirrors
  // scripts.llm_provider, surfaced for the "Powered by" badge.
  llmProvider: string;
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
  // Read from the project row (0013) — 'review' switches the description to
  // Kelly's fixed soulSHINE template instead of the free-form description.
  outputMode?: OutputMode;
  // Audience profile context (0014, lib/agents/icp-context.ts) — empty
  // string when the client has no ICP configured yet.
  icpContext?: string;
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

// Thumbnail Studio, text-only (0014, Stage 3) — no clientId/projectId/
// scriptId here unlike ScriptForgeInput/SeoEngineInput: this agent doesn't
// do a RAG search, it's a single free-standing generation off the already-
// approved script. The route persists the result (upsert onConflict
// project_id), same "agent doesn't touch the DB" split as SeoEngine.
export interface ThumbnailTextInput {
  platform: Platform;
  projectTitle: string;
  scriptContent: string;
  hook: string;
  icpContext?: string;
  llmProvider?: string;
}

// `type`, not `interface` — same jsonb-structural-typing reason as
// ScriptChapter (round-trips through thumbnails.variations).
export type ThumbnailVariation = {
  headline: string;
  subtitle: string;
  supportText: string;
  visualStyle: string;
};

export interface ThumbnailTextOutput {
  variations: ThumbnailVariation[];
  llmProvider: string;
}
