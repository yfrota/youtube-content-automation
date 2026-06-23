import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Platform } from "@/lib/connectors/types";
import { embedText } from "./embeddings";

export interface RagMatch {
  scriptId: string;
  projectId: string;
  // The project's title — match_scripts joins projects for this (see
  // 0007_match_scripts_catalog_titles.sql). Agent prompts must reference
  // videos by this, never by projectId, or the model echoes a raw uuid
  // into generated content.
  title: string;
  content: string;
  hook: string | null;
  chapters: unknown;
  similarity: number;
}

export interface SearchCatalogParams {
  clientId: string;
  queryText: string;
  platform?: Platform;
  matchCount?: number;
}

export async function searchCatalog(params: SearchCatalogParams): Promise<RagMatch[]> {
  const { clientId, queryText, platform, matchCount = 5 } = params;
  const supabase = getSupabaseAdmin();
  const embedding = await embedText(queryText);

  const { data, error } = await supabase.rpc("match_scripts", {
    query_embedding: embedding,
    match_client_id: clientId,
    match_platform: platform ?? null,
    match_count: matchCount,
  });
  if (error) throw new Error(`searchCatalog RPC failed: ${error.message}`);

  return (data ?? []).map((row) => ({
    scriptId: row.id,
    projectId: row.project_id,
    title: row.title,
    content: row.content,
    hook: row.hook,
    chapters: row.chapters,
    similarity: row.similarity,
  }));
}
