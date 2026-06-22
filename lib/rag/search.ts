import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Platform } from "@/lib/connectors/types";
import { embedText } from "./embeddings";

export interface RagMatch {
  scriptId: string;
  projectId: string;
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
    content: row.content,
    hook: row.hook,
    chapters: row.chapters,
    similarity: row.similarity,
  }));
}
