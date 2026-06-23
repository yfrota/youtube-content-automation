-- 0007_match_scripts_catalog_titles.sql
-- Two fixes to match_scripts, bundled because both require touching the
-- same join:
--
-- 1. match_scripts never returned the video's title, only project_id (a
--    uuid). The agent prompts (script-forge.ts, seo-engine.ts) interpolated
--    that uuid directly into the "related existing videos" context block,
--    so the model had nothing but a uuid to refer to a video by — and
--    sometimes echoed it verbatim into generated scripts. Joining projects
--    here and returning title fixes the root cause at the data layer rather
--    than patching it in the prompt.
--
-- 2. match_scripts must only surface real catalog videos (projects with
--    external_video_id set, i.e. indexed via POST /api/connectors/youtube/
--    index) as cross-reference candidates — never manually-created
--    in-production projects from the dashboard's "Novo projeto" form
--    (external_video_id is null), which aren't published videos yet.
--    Filtering here, before the `limit`, matters: filtering in application
--    code after the RPC call could silently return fewer than match_count
--    results even when enough eligible catalog matches exist further down
--    the similarity ranking.

-- Changing a table-returning function's output columns isn't something
-- `create or replace` can do in place (same constraint 0003 hit when the
-- parameter type changed) — drop first.
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
