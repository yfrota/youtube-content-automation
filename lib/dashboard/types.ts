// Shared dashboard types — the shape returned by GET /api/projects
// (app/api/projects/route.ts) and consumed by ProjectCard et al.

export type ApprovalStatus =
  | "draft"
  | "kelly_review"
  | "client_review"
  | "approved"
  | "published";

export type Platform = "youtube" | "instagram" | "facebook" | "linkedin";

// Content language, set per-project (see 0006_project_language.sql) — not a
// Postgres enum, the new-project form is the actual constraint.
export type Language = "pt-BR" | "en-US";

export type ModuleKey = "script" | "seo" | "thumbnail" | "checklist";

export interface PipelineModule {
  key: ModuleKey;
  status: ApprovalStatus;
}

export interface Project {
  id: string;
  title: string;
  platform: Platform;
  channelName: string;
  updatedAt: string; // ISO 8601
  modules: PipelineModule[];
}

export interface ScriptChapter {
  title: string;
  startTime: string;
}

export interface ScriptDetail {
  id: string;
  rawTranscript: string | null;
  content: string;
  hook: string | null;
  chapters: ScriptChapter[];
  // Keyword-research selections (extracted from the script + YouTube
  // trending + manual additions). Null until "Salvar keywords" or "Aprovar
  // roteiro" persists a selection — see PATCH /api/scripts/[id].
  keywordsContext: string[] | null;
  status: ApprovalStatus;
  createdAt: string;
}

// One title option from the SEO Engine, with the model's own CTR estimate
// and reasoning — `type`, not `interface`, per CLAUDE.md's structural-typing
// gotcha (this shape round-trips through the `seo.titles` jsonb column).
export type SeoTitleOption = {
  text: string;
  ctrScore: number;
  reasoning: string;
};

export type SeoData = {
  id: string;
  status: ApprovalStatus;
  titles: SeoTitleOption[];
  description: string | null;
  tags: string[];
  hashtags: string[];
  selectedTitle: string | null;
  llmProvider: string | null;
  createdAt: string;
};

// Shape returned by GET /api/projects/[id] — one project's full pipeline
// state. `seoStatus`/`thumbnailStatus` are null when no row exists yet
// (stage not started); `status` is the project's own column, reused as the
// checklist stage per the mapping note in CLAUDE.md.
export interface ProjectDetail {
  id: string;
  title: string;
  platform: Platform;
  language: Language;
  status: ApprovalStatus;
  createdAt: string;
  updatedAt: string;
  script: ScriptDetail | null;
  seo: SeoData | null;
  seoStatus: ApprovalStatus | null;
  thumbnailStatus: ApprovalStatus | null;
}

export const MODULE_LABELS: Record<ModuleKey, string> = {
  script: "Roteiro",
  seo: "SEO",
  thumbnail: "Thumbnail",
  checklist: "Checklist",
};

export const STATUS_LABELS: Record<ApprovalStatus, string> = {
  draft: "Rascunho",
  kelly_review: "Em revisão",
  client_review: "Revisão do cliente",
  approved: "Aprovado",
  published: "Publicado",
};

// Stages count as "done" for progress purposes once approved or published.
export function isModuleDone(status: ApprovalStatus): boolean {
  return status === "approved" || status === "published";
}

export function projectProgress(project: Project): number {
  const done = project.modules.filter((m) => isModuleDone(m.status)).length;
  return Math.round((done / project.modules.length) * 100);
}
