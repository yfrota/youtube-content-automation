-- 0008_clients_profile_and_project_fields.sql
-- Two additive changes:
--
-- 1. clients gains a profile (image, description, phone) for a future
--    clients-management UI. Email is NOT a new column here: clients
--    .contact_email already exists (0001) and serves that purpose — the
--    API/TS layer exposes it as `email` (see app/api/clients/*, ClientProfile
--    in lib/dashboard/types.ts), but it reads/writes the existing column
--    rather than adding a second, overlapping one.
--
-- 2. projects gains priority/deadline/tags for the dashboard's project list
--    (filtering/sorting). priority is a plain text column constrained at
--    the application layer only, same precedent as projects.language
--    (0006) — not a Postgres enum/check.
--
-- clients.updated_at and projects.updated_at/created_at already exist
-- (0001, both tables already have not-null defaults and an auto-update
-- trigger via set_updated_at()) — intentionally not touched here.

alter table clients
  add column if not exists image_url   text,
  add column if not exists description text,
  add column if not exists phone       text;

alter table projects
  add column if not exists priority text default 'normal',
  add column if not exists deadline date,
  add column if not exists tags     jsonb;

-- Redundant re-assertion, not a new fix: 0004 already granted service_role
-- select/insert/update/delete on all six 0001 tables, including clients.
-- Kept only because it was explicitly requested.
grant select, insert, update, delete on clients to service_role;
