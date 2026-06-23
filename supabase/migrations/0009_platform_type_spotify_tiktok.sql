-- 0009_platform_type_spotify_tiktok.sql
-- Adds spotify/tiktok to platform_type (0001) so the new-project form's
-- platform picker can offer them as real, persistable values — previously
-- only youtube/instagram/facebook/linkedin existed in the enum.
--
-- ALTER TYPE ... ADD VALUE cannot run inside the same transaction as other
-- schema changes that use the new value, but as its own statement (this
-- migration does nothing else) it's safe to apply directly.

alter type platform_type add value if not exists 'spotify';
alter type platform_type add value if not exists 'tiktok';
