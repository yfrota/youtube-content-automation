// Hand-written, minimal Database type — covers only the tables/RPC this
// slice touches (clients, projects, scripts, match_scripts). Not full
// codegen; extend as seo/thumbnails/approval_events get wired up.
//
// NOTE: these must be `type` aliases, not `interface`s — supabase-js checks
// `Database['public'] extends GenericSchema` (Row/Insert/Update extends
// Record<string, unknown>), and TypeScript only grants object type literals
// (and `type` aliases of them) an implicit index signature for that
// structural check; `interface` declarations are excluded from it.

export type PlatformType = "youtube" | "instagram" | "facebook" | "linkedin";

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
  status: ApprovalStatus;
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
