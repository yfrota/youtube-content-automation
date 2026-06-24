// Hand-written, minimal Database type — covers only the tables/RPC this
// slice touches (clients, projects, scripts, match_scripts). Not full
// codegen; extend as seo/thumbnails/approval_events get wired up.
//
// NOTE: these must be `type` aliases, not `interface`s — supabase-js checks
// `Database['public'] extends GenericSchema` (Row/Insert/Update extends
// Record<string, unknown>), and TypeScript only grants object type literals
// (and `type` aliases of them) an implicit index signature for that
// structural check; `interface` declarations are excluded from it.

// spotify/tiktok added in 0009.
export type PlatformType =
  | "youtube"
  | "instagram"
  | "facebook"
  | "linkedin"
  | "spotify"
  | "tiktok";

// Content language (0006_project_language.sql) — unlike PlatformType, this
// is a plain `text` column, not a Postgres enum; this union is the only
// enforcement (the new-project form is the real constraint).
export type LanguageType = "pt-BR" | "en-US";

export type ApprovalStatus =
  | "draft"
  | "kelly_review"
  | "client_review"
  | "approved"
  | "published";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type ClientsRow = {
  id: string;
  name: string;
  slug: string;
  contact_email: string | null;
  status: string;
  // Profile fields added in 0008 — image_url/description/phone are new
  // columns; email is intentionally NOT a new column here, contact_email
  // above already covers it (see 0008's migration comment).
  image_url: string | null;
  description: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
};

type ProjectsRow = {
  id: string;
  client_id: string;
  platform: PlatformType;
  title: string;
  external_channel_id: string | null;
  external_video_id: string | null;
  language: LanguageType;
  status: ApprovalStatus;
  // Added in 0008. priority is a plain text column constrained at the
  // application layer only, same precedent as `language` (0006) — not a
  // Postgres enum/check.
  priority: string | null;
  deadline: string | null;
  tags: Json | null;
  // Added in 0010 — same bare-string precedent as `priority` above (not a
  // dedicated union here; lib/dashboard/types.ts's ContentType is where the
  // real constraint lives, same split as Priority/Platform).
  content_type: string;
  created_at: string;
  updated_at: string;
};

type ScriptsRow = {
  id: string;
  client_id: string;
  project_id: string;
  platform: PlatformType;
  raw_transcript: string | null;
  content: string;
  hook: string | null;
  chapters: Json;
  llm_provider: string | null;
  version: number;
  status: ApprovalStatus;
  // pgvector columns come back from PostgREST as their text representation
  // ("[0.1,0.2,...]"), not a native JSON array — only the write path accepts
  // a plain number[]. Dimension is 768 (Gemini text-embedding-004) — not
  // encoded here since TypeScript doesn't enforce array length; the actual
  // constraint lives in the vector(768) column type (see migration 0003).
  embedding: string | null;
  // Keyword-research selections (extracted + trending + manual), passed to
  // the SEO Engine prompt. Added in 0005 — null until "Salvar keywords" or
  // "Aprovar roteiro" persists a selection.
  keywords_context: Json | null;
  // Added in 0010 — content_type records what type this specific script was
  // generated under (denormalized from projects.content_type at generation
  // time, same denormalization precedent as client_id/platform across this
  // schema). clip_script/cta_line/pod_description are podcast_vodcast-only
  // deliverables, null otherwise.
  content_type: string;
  clip_script: string | null;
  cta_line: string | null;
  pod_description: string | null;
  created_at: string;
  updated_at: string;
};

// title_options/keywords are the original 0001 columns, unused by the SEO
// Engine (titles/tags below, added in 0005) — left in place, not dropped.
type SeoRow = {
  id: string;
  client_id: string;
  project_id: string;
  script_id: string;
  platform: PlatformType;
  title_options: Json;
  description: string | null;
  keywords: Json;
  titles: Json;
  tags: Json;
  hashtags: Json;
  selected_title: string | null;
  llm_provider: string | null;
  status: ApprovalStatus;
  created_at: string;
  updated_at: string;
};

type ThumbnailsRow = {
  id: string;
  client_id: string;
  project_id: string;
  script_id: string | null;
  platform: PlatformType;
  copy_options: Json;
  image_url: string | null;
  image_storage_path: string | null;
  llm_provider: string | null;
  status: ApprovalStatus;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      clients: {
        Row: ClientsRow;
        Insert: Partial<ClientsRow> & { name: string; slug: string };
        Update: Partial<ClientsRow>;
        Relationships: [];
      };
      projects: {
        Row: ProjectsRow;
        Insert: Partial<ProjectsRow> & {
          client_id: string;
          platform: PlatformType;
          title: string;
        };
        Update: Partial<ProjectsRow>;
        Relationships: [];
      };
      scripts: {
        Row: ScriptsRow;
        Insert: Partial<Omit<ScriptsRow, "embedding">> & {
          client_id: string;
          project_id: string;
          platform: PlatformType;
          content: string;
          embedding?: number[] | null;
        };
        Update: Partial<Omit<ScriptsRow, "embedding">> & {
          embedding?: number[] | null;
        };
        Relationships: [];
      };
      seo: {
        Row: SeoRow;
        Insert: Partial<SeoRow> & {
          client_id: string;
          project_id: string;
          script_id: string;
          platform: PlatformType;
        };
        Update: Partial<SeoRow>;
        Relationships: [];
      };
      thumbnails: {
        Row: ThumbnailsRow;
        Insert: Partial<ThumbnailsRow> & {
          client_id: string;
          project_id: string;
          platform: PlatformType;
        };
        Update: Partial<ThumbnailsRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      match_scripts: {
        Args: {
          query_embedding: number[];
          match_client_id: string;
          match_platform?: PlatformType | null;
          match_count?: number;
        };
        Returns: Array<{
          id: string;
          project_id: string;
          title: string;
          content: string;
          hook: string | null;
          chapters: Json;
          similarity: number;
        }>;
      };
    };
    Enums: {
      platform_type: PlatformType;
      approval_status: ApprovalStatus;
    };
  };
};
