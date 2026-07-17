-- 0013_script_mode_and_review.sql
-- "Review" output mode: instead of Script Forge rewriting the transcript
-- verbatim (existing behavior, now called 'rewrite'), it can instead analyze
-- the raw transcript against a fixed structure/retention checklist and
-- return annotations only — never rewriting Dr. Satie's own words.

-- Per-project output mode. App-layer-only constraint, same precedent as
-- projects.language/priority/content_type (0006/0008/0010) — not a Postgres
-- enum/check.
alter table projects
  add column if not exists output_mode text
  not null default 'rewrite';
-- valores válidos: 'rewrite', 'review'

-- Structured review output — array of per-checklist-element annotations:
--   [{
--     element: string,
--     status: 'present' | 'missing' | 'flag',
--     keep?: string,
--     insert?: { text: string, placement: string },
--     flag?: { issue: string, suggestion: string }
--   }]
-- Null for rewrite-mode scripts (and any script generated before this
-- existed).
alter table scripts
  add column if not exists review_output jsonb;

-- User-edited version of the rewrite-mode script content, kept separate from
-- the AI-generated `content` column so the original generation is never
-- overwritten. Null means the user hasn't edited yet — read sites fall back
-- to `content`.
alter table scripts
  add column if not exists edited_content text;
