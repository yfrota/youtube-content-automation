-- 0010_content_type_and_deliverables.sql
-- Content type per project (drives which Script Forge prompt/structure
-- applies) and the extra deliverables a podcast/vodcast episode needs
-- beyond the base {content, hook, chapters} shape.

-- Tipo de conteúdo no projeto
alter table projects
  add column if not exists content_type text
  not null default 'youtube_tutorial';
-- valores válidos: 'youtube_tutorial', 'podcast_vodcast', 'short_form'
-- (enforced at the application layer only, same precedent as
-- projects.language/priority — not a Postgres enum/check)

-- Entregáveis adicionais no script
alter table scripts
  add column if not exists content_type text
  not null default 'youtube_tutorial',
  add column if not exists clip_script    text,
  add column if not exists cta_line       text,
  add column if not exists pod_description text;

-- Redundant re-assertion, not a new fix: 0004 already granted service_role
-- select/insert/update/delete on all six 0001 tables, including these two.
-- Kept only because it was explicitly requested.
grant select, insert, update, delete on scripts to service_role;
grant select, insert, update, delete on projects to service_role;
