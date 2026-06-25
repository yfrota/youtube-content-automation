// Shared dashboard types — the shape returned by GET /api/projects
// (app/api/projects/route.ts) and consumed by ProjectCard et al.

export type ApprovalStatus =
  | "draft"
  | "kelly_review"
  | "client_review"
  | "approved"
  | "published";

// spotify/tiktok added in 0009 (platform_type enum) — enum-valid, but no
// connector/agent support exists for either yet.
export type Platform = "youtube" | "instagram" | "facebook" | "linkedin" | "spotify" | "tiktok";

// Content language, set per-project (see 0006_project_language.sql) — not a
// Postgres enum, the new-project form is the actual constraint.
export type Language = "pt-BR" | "en-US";

// Content type, set per-project (see 0010_content_type_and_deliverables.sql)
// — drives which Script Forge prompt/structure is used. Not a Postgres
// enum, same precedent as Language/Priority. Also duplicated in
// lib/agents/types.ts — same deliberate cross-layer duplication as
// Platform/Language, not an oversight.
export type ContentType = "youtube_tutorial" | "podcast_vodcast" | "short_form";

export type ModuleKey = "script" | "seo" | "thumbnail" | "checklist";

export interface PipelineModule {
  key: ModuleKey;
  status: ApprovalStatus;
}

// `type`, not `interface` — same structural-typing reason as ScriptChapter
// (CLAUDE.md's type gotchas section), even though this doesn't round-trip
// through a jsonb column directly. email is the clients.contact_email
// column under a friendlier name (see 0008's migration comment) — there is
// no separate `email` column.
export type ClientProfile = {
  id: string;
  name: string;
  imageUrl: string | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  // The client's YouTube channel (handle/URL/Channel ID) — added in 0012,
  // separate from any one project's channelUrl (projects.external_channel_id)
  // since a client isn't 1:1 with a project. Used by the "Indexar canal"
  // button on /clients/[id].
  channelUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

// `projectsCount` is a computed aggregate, not a clients-table column — kept
// out of ClientProfile itself (same separation GET /api/clients/[id] already
// established: `{ client: ClientProfile, projectsCount }`) and used by both
// the clients list (GET /api/clients) and the single-client GET.
export type ClientWithProjectsCount = ClientProfile & { projectsCount: number };

export type Priority = "low" | "normal" | "high" | "urgent";

// Shared by every route that joins or queries `clients` directly (clients
// list/detail, the projects list join, project detail) so the
// contact_email-as-email mapping lives in one place.
export function toClientProfile(row: {
  id: string;
  name: string;
  image_url: string | null;
  description: string | null;
  contact_email: string | null;
  phone: string | null;
  channel_url: string | null;
  created_at: string;
  updated_at: string;
}): ClientProfile {
  return {
    id: row.id,
    name: row.name,
    imageUrl: row.image_url,
    description: row.description,
    email: row.contact_email,
    phone: row.phone,
    channelUrl: row.channel_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface Project {
  id: string;
  title: string;
  platform: Platform;
  contentType: ContentType;
  client: ClientProfile;
  channelUrl: string | null;
  priority: Priority;
  deadline: string | null; // ISO 8601 date, no time component
  tags: string[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  modules: PipelineModule[];
}

export interface ScriptChapter {
  title: string;
  startTime: string;
}

// Added in 0011 — a catalog video Script Forge says it actually referenced
// in the generated script (not every RAG match offered, just the ones the
// model used). `type`, not `interface`, same structural-typing reason as
// ScriptChapter — this round-trips through the scripts.referenced_videos
// jsonb column.
export type ReferencedVideo = {
  videoId: string;
  title: string;
  reason: string;
  youtubeUrl: string;
};

export interface ScriptDetail {
  id: string;
  rawTranscript: string | null;
  content: string;
  hook: string | null;
  chapters: ScriptChapter[];
  contentType: ContentType;
  // The three podcast/vodcast-only deliverables (0010) — null for
  // youtube_tutorial/short_form scripts, and for any script generated
  // before 0010 existed.
  clipScript: string | null;
  ctaLine: string | null;
  podDescription: string | null;
  // Keyword-research selections (extracted from the script + YouTube
  // trending + manual additions). Null until "Salvar keywords" or "Aprovar
  // roteiro" persists a selection — see PATCH /api/scripts/[id].
  keywordsContext: string[] | null;
  // Catalog videos Script Forge referenced in this script (0011) — null for
  // scripts generated before this existed, empty array when the model
  // referenced nothing this run.
  referencedVideos: ReferencedVideo[] | null;
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
  contentType: ContentType;
  status: ApprovalStatus;
  client: ClientProfile;
  channelUrl: string | null;
  priority: Priority;
  deadline: string | null;
  tags: string[];
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

export const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  spotify: "Spotify",
  tiktok: "TikTok",
};

// Brand colors, used verbatim (not the app's muted palette) so the platform
// badge reads as "this is YouTube/Instagram/etc" at a glance. A pastel-tint
// version was tried and reverted — solid brand colors are the kept design.
// Selectable in the new-project form's picker as of 0009, but spotify/tiktok
// still have no connector or agent behind them — same gap instagram/
// facebook/linkedin have had since 0001.
export const PLATFORM_BADGE_STYLES: Record<Platform, { background: string; color: string }> = {
  youtube: { background: "#FF0000", color: "#ffffff" },
  instagram: { background: "linear-gradient(45deg, #833AB4, #FD1D1D)", color: "#ffffff" },
  linkedin: { background: "#0A66C2", color: "#ffffff" },
  facebook: { background: "#1877F2", color: "#ffffff" },
  spotify: { background: "#1DB954", color: "#ffffff" },
  tiktok: { background: "#000000", color: "#ffffff" },
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

// "normal" intentionally has no entry — it's the common case and gets
// neither this text treatment nor a left border on the card (see
// PRIORITY_BORDER_COLORS below). Text-only now, no background pill — the
// left border carries the emphasis instead.
export const PRIORITY_BADGE_STYLES: Partial<Record<Priority, string>> = {
  urgent: "text-red-600 dark:text-red-400",
  high: "text-orange-600 dark:text-orange-400",
  low: "text-gray-400 dark:text-gray-500",
};

// Hex (not Tailwind classes) because this drives an inline `border-left`
// style on the whole card — ProjectCard already uses inline `style` for
// PLATFORM_BADGE_STYLES for the same reason (precise colors outside the
// theme), and inline beats `dark:border-gray-800` on the card's own border
// class, so the priority color reads the same in both color schemes.
export const PRIORITY_BORDER_COLORS: Partial<Record<Priority, string>> = {
  urgent: "#DC2626",
  high: "#EA580C",
  low: "#9CA3AF",
};

// Stages count as "done" for progress purposes once approved or published.
export function isModuleDone(status: ApprovalStatus): boolean {
  return status === "approved" || status === "published";
}

export function projectProgress(project: Project): number {
  const done = project.modules.filter((m) => isModuleDone(m.status)).length;
  return Math.round((done / project.modules.length) * 100);
}
