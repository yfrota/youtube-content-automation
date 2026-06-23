-- 0004_grant_service_role_privileges.sql
-- Fixes "permission denied for table X" on every table when querying via
-- service_role. This is NOT an RLS issue — service_role's BYPASSRLS skips
-- row-level policies, but the role still needs ordinary Postgres table
-- grants to touch a table at all, and none of 0001-0003 ever granted any.
-- Discovered by actually running the app against the live Supabase project:
-- every read/write through lib/supabase/admin.ts (i.e. the whole app) was
-- failing on all six tables.

grant select, insert, update, delete
  on public.clients,
     public.projects,
     public.scripts,
     public.seo,
     public.thumbnails,
     public.approval_events
  to service_role;

-- Prevents this from silently recurring: any table created by a future
-- migration in the public schema automatically grants service_role access
-- without needing to remember this step again.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
