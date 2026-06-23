-- 0003_update_embedding_dimension.sql
-- Switches embeddings from OpenAI text-embedding-3-small (1536 dims) to
-- Gemini text-embedding-004 (768 dims). The database is still empty, so this
-- drops and recreates the column instead of a data migration.

alter table scripts drop column embedding;
alter table scripts add column embedding vector(768);

drop index if exists idx_scripts_embedding;
create index idx_scripts_embedding on scripts using hnsw (embedding vector_cosine_ops);

-- ============================================================================
-- match_scripts must be redefined too: its query_embedding parameter was
-- declared vector(1536) in 0002, and `s.embedding <=> query_embedding`
-- requires both sides to be the same vector dimension. Without this, RAG
-- search would break the moment scripts.embedding becomes vector(768) above
-- — same body as 0002's version, only the parameter type changes.
-- ============================================================================
-- Defensive: Postgres function identity ignores typmod (vector(1536) vs
-- vector(768) are both just "vector" for overload-matching purposes), so
-- `create or replace` below should replace the 0002 version in place rather
-- than creating an ambiguous second overload — but dropping first removes
-- any doubt instead of relying on that nuance.
drop function if exists match_scripts(vector(1536), uuid, platform_type, int);

create or replace function match_scripts(
  query_embedding vector(768),
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
