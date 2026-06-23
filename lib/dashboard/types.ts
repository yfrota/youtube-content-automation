// Shared dashboard types — the shape returned by GET /api/projects
// (app/api/projects/route.ts) and consumed by ProjectCard et al.

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

export interface Project {
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

export function projectProgress(project: Project): number {
  const done = project.modules.filter((m) => isModuleDone(m.status)).length;
  return Math.round((done / project.modules.length) * 100);
}
