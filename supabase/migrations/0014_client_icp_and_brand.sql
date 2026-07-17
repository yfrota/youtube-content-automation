-- 0014_client_icp_and_brand.sql
-- Three independent additions bundled into one migration (all touch schema
-- work landing together for this feature set):
--   1. clients.icp_* / brand_* — structured audience profile + brand notes,
--      surfaced on /clients/[id] and read by Script Forge/SEO Engine to
--      calibrate tone (see lib/agents/icp-context.ts).
--   2. projects.llm_script/llm_seo/llm_thumbnail — per-stage LLM selection
--      (lib/llm/providers.ts), read by each agent route instead of a
--      hardcoded model id.
--   3. thumbnails.* — Thumbnail Studio (Stage 3) text-generation columns.

-- ============================================================================
-- 1. Client ICP + brand profile
-- ============================================================================

-- ICP estruturado no perfil do cliente
alter table clients
  add column if not exists icp_text text,
  -- texto livre (PDF colado ou gerado pela IA)
  add column if not exists icp_demographics text,
  add column if not exists icp_psychographics text,
  add column if not exists icp_motivations text,
  add column if not exists icp_fears text,
  add column if not exists icp_desires text,
  add column if not exists icp_objections text,
  add column if not exists icp_stories text,
  -- "Vulnerable Stories & Daily Thoughts"
  add column if not exists icp_llm_provider text;
  -- qual modelo gerou o ICP (se foi gerado por IA)

-- Arquivos de marca (placeholder para Storage futuro)
alter table clients
  add column if not exists brand_colors jsonb,
  -- array de { hex: string, name: string, role: string }
  -- ex: [{ hex: "#f9a8d4", name: "Rosa", role: "primary" }]
  add column if not exists brand_notes text;
  -- notas livres sobre identidade visual da marca

grant select, insert, update, delete on clients to service_role;

-- ============================================================================
-- 2. Per-stage LLM selection
-- ============================================================================

alter table projects
  add column if not exists llm_script text
  default 'google/gemini-2.5-flash',
  add column if not exists llm_seo text
  default 'google/gemini-2.5-flash',
  add column if not exists llm_thumbnail text
  default 'google/gemini-2.5-flash';

-- ============================================================================
-- 3. Thumbnail Studio (Stage 3 — text only, no image generation yet)
-- ============================================================================

-- llm_provider and status already exist since 0001 (thumbnails was created
-- with the rest of the original schema, status as the shared approval_status
-- enum) — both clauses below are no-ops, kept for parity with the rest of
-- this alter table statement, same "redundant re-assertion" precedent as
-- 0010's grants.
alter table thumbnails
  add column if not exists headline text,
  add column if not exists subtitle text,
  add column if not exists support_text text,
  add column if not exists visual_style text,
  add column if not exists variations jsonb,
  -- array de { headline, subtitle, support_text, visual_style }
  add column if not exists selected_variation int default 0,
  add column if not exists llm_provider text,
  add column if not exists status text default 'draft';

-- One thumbnails row per project, so app/api/agents/thumbnail-text/route.ts
-- can upsert with onConflict: "project_id" instead of select-then-branch —
-- same reasoning as seo_project_id_key (0005). Without this, upsert fails
-- at runtime: "no unique or exclusion constraint matching the ON CONFLICT
-- specification" (the exact failure class CLAUDE.md's indexer.ts note
-- warns about for scripts' own partial-unique-index case).
create unique index if not exists thumbnails_project_id_key on thumbnails (project_id);

grant select, insert, update, delete on thumbnails to service_role;
