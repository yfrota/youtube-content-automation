-- 0001_initial_schema.sql
-- Initial multi-tenant, multi-platform schema for the YouTube Content Automation Platform.
--
-- Tenancy: every tenant-scoped table carries client_id directly (denormalized),
-- so RLS policies and queries never need to join through projects to filter by tenant.
--
-- Platform: projects/scripts/seo/thumbnails carry platform directly so the connector
-- layer (lib/connectors/) can dispatch on a row without joining back to projects.

-- ============================================================================
-- Extensions
-- ============================================================================
create extension if not exists pgcrypto; -- gen_random_uuid()
create extension if not exists vector;   -- pgvector, for RAG embeddings

-- ============================================================================
-- Enum types
-- ============================================================================
create type platform_type as enum ('youtube', 'instagram', 'facebook', 'linkedin');

-- Approval state machine shared by projects, scripts, seo, and thumbnails.
-- kelly_review = internal review step before a record goes to the client.
create type approval_status as enum (
  'draft',
  'kelly_review',
  'client_review',
  'approved',
  'published'
);

-- Entities that can appear in the approval_events audit log.
create type approval_entity_type as enum ('script', 'seo', 'thumbnail');

-- ============================================================================
-- updated_at trigger helper
-- ============================================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================================
-- clients — tenant root. Intentionally has no client_id column: it IS the tenant.
-- ============================================================================
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  contact_email text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger clients_set_updated_at
  before update on clients
  for each row execute function set_updated_at();

-- ============================================================================
-- projects — one production pipeline per piece of content (e.g. one video),
-- scoped to a client and a single platform.
-- ============================================================================
create table projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  platform platform_type not null,
  title text not null,
  external_channel_id text,
  external_video_id text,
  status approval_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_projects_client_id on projects(client_id);
create index idx_projects_platform on projects(platform);

create trigger projects_set_updated_at
  before update on projects
  for each row execute function set_updated_at();

-- ============================================================================
-- scripts — Script Forge output. embedding powers the RAG Catalog
-- (cross-referencing existing videos). Dimension 1536 assumes an
-- OpenAI-compatible embedding model; adjust if a different model is used.
-- ============================================================================
create table scripts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  platform platform_type not null,
  raw_transcript text,
  content text not null,
  hook text,
  chapters jsonb not null default '[]'::jsonb,
  llm_provider text,
  version integer not null default 1,
  status approval_status not null default 'draft',
  embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_scripts_client_id on scripts(client_id);
create index idx_scripts_project_id on scripts(project_id);
create index idx_scripts_platform on scripts(platform);
create index idx_scripts_embedding on scripts using hnsw (embedding vector_cosine_ops);

create trigger scripts_set_updated_at
  before update on scripts
  for each row execute function set_updated_at();

-- ============================================================================
-- seo — SEO Engine output (title options, description, keywords) for a script.
-- ============================================================================
create table seo (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  script_id uuid not null references scripts(id) on delete cascade,
  platform platform_type not null,
  title_options jsonb not null default '[]'::jsonb,
  description text,
  keywords jsonb not null default '[]'::jsonb,
  llm_provider text,
  status approval_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_seo_client_id on seo(client_id);
create index idx_seo_project_id on seo(project_id);
create index idx_seo_script_id on seo(script_id);
create index idx_seo_platform on seo(platform);

create trigger seo_set_updated_at
  before update on seo
  for each row execute function set_updated_at();

-- ============================================================================
-- thumbnails — Thumbnail Studio output (copy options + generated image).
-- script_id is nullable: thumbnail copy may be derived from seo titles
-- rather than directly from a script.
-- ============================================================================
create table thumbnails (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  script_id uuid references scripts(id) on delete cascade,
  platform platform_type not null,
  copy_options jsonb not null default '[]'::jsonb,
  image_url text,
  image_storage_path text,
  llm_provider text,
  status approval_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_thumbnails_client_id on thumbnails(client_id);
create index idx_thumbnails_project_id on thumbnails(project_id);
create index idx_thumbnails_platform on thumbnails(platform);

create trigger thumbnails_set_updated_at
  before update on thumbnails
  for each row execute function set_updated_at();

-- ============================================================================
-- approval_events — append-only audit log of approval state transitions
-- across scripts, seo, and thumbnails. entity_id is polymorphic (no FK,
-- enforced at application level) since it points into different tables
-- depending on entity_type.
-- ============================================================================
create table approval_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  entity_type approval_entity_type not null,
  entity_id uuid not null,
  from_status approval_status,
  to_status approval_status not null,
  actor_id uuid references auth.users(id),
  comment text,
  created_at timestamptz not null default now()
);

create index idx_approval_events_client_id on approval_events(client_id);
create index idx_approval_events_project_id on approval_events(project_id);
create index idx_approval_events_entity on approval_events(entity_type, entity_id);

-- ============================================================================
-- Row Level Security — enabled with no policies yet. Until tenant membership
-- (linking auth.users to clients) is modeled, every table is deny-by-default;
-- policies will be added in a follow-up migration.
-- ============================================================================
alter table clients enable row level security;
alter table projects enable row level security;
alter table scripts enable row level security;
alter table seo enable row level security;
alter table thumbnails enable row level security;
alter table approval_events enable row level security;
