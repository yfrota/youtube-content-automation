// Mock dashboard data. Shapes mirror the real schema (approval_status enum,
// platform, per-module pipeline) so swapping in Supabase queries later is a
// drop-in: same fields, same status vocabulary.

export type ApprovalStatus =
  | "draft"
  | "kelly_review"
  | "client_review"
  | "approved"
  | "published";

export type Platform = "youtube" | "instagram" | "facebook" | "linkedin";

export type ModuleKey = "script" | "seo" | "thumbnail" | "checklist";

export interface PipelineModule {
  key: ModuleKey;
  status: ApprovalStatus;
}

export interface MockProject {
  id: string;
  title: string;
  platform: Platform;
  channelName: string;
  updatedAt: string; // ISO 8601
  modules: PipelineModule[];
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

export function projectProgress(project: MockProject): number {
  const done = project.modules.filter((m) => isModuleDone(m.status)).length;
  return Math.round((done / project.modules.length) * 100);
}

// Timestamps are expressed relative to "now" at module load so the mock always
// reads as fresh ("há 10 minutos") regardless of when the app is opened.
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const orderedModules = (
  states: Record<ModuleKey, ApprovalStatus>
): PipelineModule[] =>
  (["script", "seo", "thumbnail", "checklist"] as ModuleKey[]).map((key) => ({
    key,
    status: states[key],
  }));

export const MOCK_PROJECTS: MockProject[] = [
  {
    id: "p-001",
    title: "Como a IA está mudando a edição de vídeo",
    platform: "youtube",
    channelName: "Soulshine Studio",
    updatedAt: ago(2 * HOUR),
    modules: orderedModules({
      script: "approved",
      seo: "approved",
      thumbnail: "kelly_review",
      checklist: "draft",
    }),
  },
  {
    id: "p-002",
    title: "5 ferramentas de IA que todo criador precisa",
    platform: "youtube",
    channelName: "Soulshine Studio",
    updatedAt: ago(28 * HOUR),
    modules: orderedModules({
      script: "published",
      seo: "published",
      thumbnail: "published",
      checklist: "published",
    }),
  },
  {
    id: "p-003",
    title: "Entrevista com nosso fundador sobre o futuro do conteúdo",
    platform: "youtube",
    channelName: "Soulshine Studio",
    updatedAt: ago(3 * DAY),
    modules: orderedModules({
      script: "approved",
      seo: "client_review",
      thumbnail: "draft",
      checklist: "draft",
    }),
  },
  {
    id: "p-004",
    title: "Bastidores: gravando nosso primeiro podcast",
    platform: "youtube",
    channelName: "Soulshine Studio",
    updatedAt: ago(12 * MINUTE),
    modules: orderedModules({
      script: "draft",
      seo: "draft",
      thumbnail: "draft",
      checklist: "draft",
    }),
  },
];
