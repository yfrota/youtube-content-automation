-- 0005_seo_and_keywords.sql
-- Adds keyword-research context to scripts and the content columns the SEO
-- Engine needs on seo, plus a unique index so the engine can upsert one seo
-- row per project (mirrors the script-forge / catalog-indexer pattern).

-- keywords context on the script (passed to the SEO Engine prompt)
alter table scripts
  add column if not exists keywords_context jsonb;

-- content columns on seo. description/llm_provider already existed since
-- 0001 — these two are no-ops, kept for clarity/idempotency with the rest.
alter table seo
  add column if not exists titles jsonb,
  add column if not exists description text,
  add column if not exists tags jsonb,
  add column if not exists hashtags jsonb,
  add column if not exists selected_title text,
  add column if not exists llm_provider text;

-- One seo row per project, so the SEO Engine route can upsert with
-- onConflict: "project_id" instead of select-then-branch.
create unique index if not exists seo_project_id_key on seo (project_id);

-- service_role grants follow the 0004 pattern — table already had grants
-- from 0004's blanket grant, but stated explicitly here since this
-- migration is the one introducing the columns that make seo load-bearing.
grant select, insert, update, delete on seo to service_role;
