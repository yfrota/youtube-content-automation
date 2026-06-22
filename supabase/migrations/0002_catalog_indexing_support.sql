-- 0002_catalog_indexing_support.sql
-- Supports idempotent RAG catalog indexing on top of 0001_initial_schema.sql.

-- ============================================================================
-- One project per (client, external video). NULLs are never equal for
-- uniqueness purposes, so manually-created in-production projects (no
-- external_video_id yet) are unaffected — only real video ids are deduped,
-- which is what makes catalog re-indexing an idempotent upsert.
-- ============================================================================
create unique index if not exists uniq_projects_client_external_video
  on projects (client_id, external_video_id);

-- ============================================================================
-- One catalog-indexing script row per project. Partial: scoped to rows where
-- raw_transcript is null (catalog entries only), so real Script Forge drafts
-- (which always set raw_transcript) are never constrained and can keep
-- multiple versions per project.
-- ============================================================================
create unique index if not exists uniq_scripts_project_catalog_entry
  on scripts (project_id)
  where raw_transcript is null;

-- ============================================================================
-- match_scripts — cosine-similarity search over scripts.embedding, scoped by
-- client and optionally platform. Exposed as an RPC because supabase-js's
-- query builder cannot express `order by embedding <=> $param`.
-- ============================================================================
create or replace function match_scripts(
  query_embedding vector(1536),
  match_client_id uuid,
  match_platform platform_type default null,
  match_count int default 5
)
returns table (
  id uuid,
  project_id uuid,
  content text,
  hook text,
  chapters jsonb,
  similarity float
)
language sql stable
as $$
  select
    s.id,
    s.project_id,
    s.content,
    s.hook,
    s.chapters,
    1 - (s.embedding <=> query_embedding) as similarity
  from scripts s
  where s.client_id = match_client_id
    and s.embedding is not null
    and (match_platform is null or s.platform = match_platform)
  order by s.embedding <=> query_embedding
  limit match_count;
$$;
