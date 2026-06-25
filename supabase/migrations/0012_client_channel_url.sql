-- 0012_client_channel_url.sql
-- The YouTube channel URL/handle/id used to only live per-project
-- (projects.external_channel_id, set once when a project is created via
-- /projects/new's "URL do canal" field). The "Indexar canal" button on
-- /clients/[id] needs one per *client* instead — a client's channel isn't
-- necessarily the same as any one project's external_channel_id (a client
-- can have zero projects yet, or several pointed at different channels),
-- so this is a new, separate column, not a reuse of the existing one.

alter table clients
  add column if not exists channel_url text;
