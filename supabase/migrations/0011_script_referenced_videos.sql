-- 0011_script_referenced_videos.sql
-- Two related additions, bundled for the same reason 0007 bundled its two
-- fixes (both require touching the same join/output shape):
--
-- 1. scripts.referenced_videos (jsonb) — the cross-reference list Script
--    Forge fills in when it actually mentions a catalog video in the
--    generated script:
--      [{ videoId, title, reason, youtubeUrl }]
--    Surfaced in ScriptStage's split-view output panel as "Vídeos
--    referenciados neste episódio".
--
-- 2. match_scripts must also return external_video_id. Without this,
--    searchCatalog()/RagMatch (lib/rag/search.ts) only ever exposed
--    `title`/`projectId` to the agent prompts — there was no YouTube video
--    id anywhere in the RAG context to cross-reference
--    referenced_video_ids against at all. p.external_video_id is already
--    used in the `where` clause (only catalog-indexed videos are eligible
--    matches), this just also selects the column instead of only filtering
--    on it. Output columns changed again — same drop-then-recreate
--    precedent as 0003/0007 (create or replace can't change a
--    table-returning function's output shape in place).

alter table scripts
  add column if not exists referenced_videos jsonb;

drop function if exists match_scripts(vector(768), uuid, platform_type, int);

create or replace function match_scripts(
  query_embedding vector(768),
  match_client_id uuid,
  match_platform platform_type default null,
  match_count int default 5
)
returns table (
  id uuid,
  project_id uuid,
  external_video_id text,
  title text,
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
    p.external_video_id,
    p.title,
    s.content,
    s.hook,
    s.chapters,
    1 - (s.embedding <=> query_embedding) as similarity
  from scripts s
  join projects p on p.id = s.project_id
  where s.client_id = match_client_id
    and s.embedding is not null
    and p.external_video_id is not null
    and (match_platform is null or s.platform = match_platform)
  order by s.embedding <=> query_embedding
  limit match_count;
$$;
