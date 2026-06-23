-- 0006_project_language.sql
-- Content language per project, used by Script Forge, the keywords
-- extractor, YouTube trending search, and the SEO Engine to generate in the
-- right language. No enum/check constraint — enforced at the application
-- layer only (the new-project form only ever offers these two), matching
-- how this migration was specified.

alter table projects
  add column if not exists language text not null default 'pt-BR';
-- valores válidos: 'pt-BR', 'en-US'
