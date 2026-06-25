# YouTube Content Automation Platform — Project Context

@AGENTS.md

Read this before starting work in a new session — it has the architecture decisions, schema, and gotchas that aren't obvious from the code alone. Full product pitch/status table lives in `README.md`; historical debug narratives and decision rationale live in `docs/DECISIONS.md`.

## What this is

Multi-tenant SaaS that automates YouTube content production (script rewriting, SEO, thumbnails) with AI agents and a RAG pipeline over the channel's existing video catalog. Built to expand to Instagram/Facebook/LinkedIn later — every tenant-scoped table already carries `client_id` and every content table carries `platform`.

Built as part of a boutique AI automation consultancy (see README footer).

## Status

The full pipeline — index a real YouTube channel → generate a script via Script Forge → confirm it's genuinely cross-referenced against the catalog — has been run end-to-end against the live Supabase/Gemini/OpenRouter stack (not mocked). It passed.

## Stack

Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind + Supabase (Postgres + pgvector) + OpenRouter (agents) + Gemini embeddings. No test framework — verification is manual (`npm run build` / `tsc --noEmit` + curl).

**Current model ids (verify live if 404s appear):** embeddings use `gemini-embedding-001` (768 dims). Script Forge/SEO Engine use `google/gemini-2.5-flash` via OpenRouter. **These silently go stale** — `tsc`/`lint`/`build` never catch a retired model id. If you see "model not found" or "no endpoints found," check the provider's live `/models` list before assuming a code bug.

**Provider history:** started on Anthropic Claude + OpenAI embeddings; migrated to OpenRouter + Gemini. Stray Anthropic/OpenAI mentions in old commits are expected drift from before the migration.

**Next.js 16 has real breaking changes vs. training data.** Check `node_modules/next/dist/docs/` before writing App Router code that looks "off."

## Architecture principles (don't violate these)

- **Multi-tenant**: every tenant-scoped table has `client_id` directly (denormalized). `clients` is the tenant root with no `client_id`.
- **Multi-platform**: `projects`/`scripts`/`seo`/`thumbnails` carry `platform` (`youtube | instagram | facebook | linkedin`) directly, so the connector layer can dispatch without joining back to `projects`.
- **Connectors are adapters**: `lib/connectors/types.ts` defines `PlatformConnector` (`fetchCatalog`); each platform implements it (`lib/connectors/youtube.ts` today). No platform-specific branching outside connector files.
- **Agents are platform-agnostic**: `lib/agents/` never branches on `platform`. Platform-specific output formatting is the connector's job.

## Database (`supabase/migrations/`)

- `0001_initial_schema.sql` — `clients`, `projects`, `scripts`, `seo`, `thumbnails`, `approval_events`. Enums: `platform_type`, `approval_status` (`draft → kelly_review → client_review → approved → published` — `kelly_review` is an internal review step, not a typo). `scripts.embedding` is `vector(1536)` with HNSW. **RLS enabled on every table with no policies yet** — the only access path is `lib/supabase/admin.ts` (service-role key, bypasses RLS).

- `0002_catalog_indexing_support.sql` — `unique index on projects (client_id, external_video_id)` (non-partial — NULLs coexist fine, makes catalog re-indexing idempotent); `unique index on scripts (project_id) where raw_transcript is null` (partial, catalog entries only — real Script Forge drafts always set `raw_transcript`); `match_scripts()` RPC (supabase-js can't express `order by embedding <=> $param` in its query builder — RPC is the only way RAG search works).

- `0003_update_embedding_dimension.sql` — drops/recreates `scripts.embedding` as `vector(768)`. **If you ever change the embedding dimension: update both the column AND `match_scripts` in the same migration** or RAG breaks with a dimension mismatch on `<=>`. Always `drop function` before redefining `match_scripts` when changing parameter typmod — `create or replace` is unreliable for that.

- `0004_grant_service_role_privileges.sql` — grants `service_role` `select/insert/update/delete` on all tables + `alter default privileges`. **Critical**: `service_role`'s `BYPASSRLS` only skips row-level policies — it does NOT imply ordinary table grants. Without this migration every API route returns "permission denied for table X" even though RLS is bypassed. See `docs/DECISIONS.md`.

- `0005_seo_and_keywords.sql` — `scripts.keywords_context` (jsonb), `seo.titles`/`tags`/`hashtags`/`selected_title` (`0001` columns `title_options`/`keywords` are unused dead weight, left in place), `unique index on seo (project_id)`. **Missing this breaks `GET /api/projects/[id]` entirely** (selects `keywords_context`) — the whole detail page 500s, not just a missing-feature gap.

- `0006_project_language.sql` — `projects.language text not null default 'pt-BR'`. Same breakage pattern as `0005`: `GET /api/projects/[id]`, `POST /api/projects`, and both agent routes all select/insert `language` directly and break until this is applied.

- `0007_match_scripts_catalog_titles.sql` — redefines `match_scripts` (drop-then-recreate, see `0003`): (1) joins `projects` and returns `title` — **agents must reference RAG matches by `title`, never `projectId`**, the model echoes raw uuids into generated content otherwise; (2) adds `p.external_video_id is not null` to WHERE — manually-created projects must never be RAG candidates. Filtering in SQL before `ORDER BY`/`LIMIT` matters: post-filtering in app code could silently return fewer than `match_count` results when eligible catalog entries exist further down the ranking.

- `0008_clients_profile_and_project_fields.sql` — `clients.image_url`/`description`/`phone`, `projects.priority`/`deadline`/`tags`. **`clients.email` not added** — `contact_email` already exists (`0001`); `toClientProfile()` maps `contact_email` → `email`. `priority` is app-layer-only (text, no Postgres enum/check).

- `0009_platform_type_spotify_tiktok.sql` — adds `'spotify'`/`'tiktok'` to `platform_type` (each in its own statement — Postgres can't add an enum value in the same transaction as other schema work using it). `Platform`/`PlatformType` updated in `lib/connectors/types.ts`, `lib/dashboard/types.ts`, and `lib/supabase/database.types.ts` — all three together or type-checking breaks.

- `0010_content_type_and_deliverables.sql` — `projects.content_type` (`'youtube_tutorial'|'podcast_vodcast'|'short_form'`, default `'youtube_tutorial'`, app-layer-only constraint); `scripts.content_type` (same, denormalized — records what type was used at generation time, independent of whatever `projects.content_type` is now); `scripts.clip_script`/`cta_line`/`pod_description` (nullable text, `podcast_vodcast`-only deliverables).

- `0011_script_referenced_videos.sql` — `scripts.referenced_videos jsonb` (`[{videoId, title, reason, youtubeUrl}]`). Also redefines `match_scripts` again (drop-then-recreate) to return `p.external_video_id` — without it `RagMatch` had no YouTube video id for `referencedVideos` cross-referencing.

- `0012_client_channel_url.sql` — `clients.channel_url text`. Powers the "Indexar canal" button on `/clients/[id]`.

- **Next migration: `0013_*.sql`** — don't renumber existing ones.

## What's implemented

### `lib/connectors/youtube.ts`
Metadata-only via `YOUTUBE_API_KEY`, plain `fetch` (no `googleapis`). Pulls title/description/tags via `channels.list` → `playlistItems.list` (paginated) → `videos.list` (batched 50). **Deliberately no OAuth** — explicit decision; only needed for publishing or private-video transcript access.

**`channels.list`'s `id` param only accepts a literal Channel ID (`UCxxxx`, 24 chars) — a `@handle` or full URL returns zero items silently, no error.** `resolveChannelId(input)` normalizes any format: already-canonical id (regex) → `/channel/UCxxxx` (regex) → `@handle` via `channels.list?forHandle=` → legacy `/c/`/`/user/` name via `forUsername=`, fallback to `search.list?type=channel` (100 quota units vs. 1 — that rare path only). Exported and called by both `fetchCatalog` and the index route before storing `external_channel_id`, so the canonical id is always stored.

### `lib/rag/embeddings.ts`
Gemini `gemini-embedding-001`, 768 dims via `outputDimensionality`. Plain `fetch` against `generativelanguage.googleapis.com`. **Don't change dimensionality without updating both the schema column and `match_scripts`.**

### `lib/rag/indexer.ts`
`indexCatalog()`. For `scripts`, **does NOT use `.upsert()`** — explicit select then insert/update because PostgREST can't target a partial unique index. Simplifying to `.upsert()` fails at runtime: "no unique or exclusion constraint matching the ON CONFLICT specification."

Per-video chains run concurrently up to `PER_VIDEO_CONCURRENCY` (10) via a hand-rolled `runWithConcurrency` (no `p-limit` dependency). Sequential was ~550ms/video; concurrent is ~130ms/video. Safe because Node's event loop means no true parallel mutation.

### `app/api/connectors/youtube/index/route.ts`
Paginates via `?limit=` (default 10). Each call: fetches the full catalog (cheap, metadata-only), queries which video ids already exist for `clientId`, indexes only the next `limit` unindexed videos. Returns `{ totalVideos, indexed, remaining, failed }` — `totalVideos` is full catalog size. **Call repeatedly with the same body until `remaining === 0`.** DB-based resume means retries are automatic with no bookkeeping. See `docs/DECISIONS.md` for timing numbers and Vercel plan context.

### `lib/rag/search.ts`
`searchCatalog()` wraps `match_scripts` RPC. Returns `RagMatch[]` with `title` and `externalVideoId` (both non-null, guaranteed by the RPC's own WHERE). Callers never need to filter manual-project matches — the RPC already excludes them.

### `lib/agents/script-forge.ts`
OpenRouter (`https://openrouter.ai/api/v1`), `google/gemini-2.5-flash`, `tool_choice: "required"` for structured output.

**`max_tokens` is dynamic:**
```
max_tokens = min(max(transcriptWords × 1.872, 10000), 30000)
```
Floor 10000 (below this the formula under-provisions real transcripts and causes truncation). Cap 30000 (~10k output words). **Never omit `max_tokens`** — OpenRouter defaults to model max (65535) and fails 402 if account credit can't cover it (reads like a billing bug, not a missing-parameter bug). See `docs/DECISIONS.md` for the full history.

**`temperature: 0.4`** on the main generation call — critical. Without it, output length varies wildly run-to-run regardless of `max_tokens` because `finish_reason` is `"tool_calls"` (a clean voluntary stop), not token exhaustion. The model chooses how much to write via sampling.

**`referencedVideos` comes from a separate second call** (`identifyReferencedVideoIds()`), not from `emit_script`. Putting id-extraction properties on the same tool call competed with the script for budget and caused truncation. The second call uses `max_tokens: 200` (`VIDEO_ID_EXTRACTION_MAX_TOKENS`), prompts with the script's first 2000 chars (`SCRIPT_EXCERPT_CHAR_LIMIT`) plus each RAG match's title+id, returns a plain JSON array. `reason` is always `""` on the output (extraction call doesn't ask for reasons). See `docs/DECISIONS.md`.

**`contextBlock` includes each match's `externalVideoId`** (`(id: ${m.externalVideoId}, ...)`). Without a real id in the text the model saw, it echoed bracketed list indices (`[1]`, `[2]`) as if they were ids — the same class of bug `0007` fixed for `projectId`.

**Two prompts** (`buildPrompt()` picks by `contentType`): `youtube_tutorial`/`short_form` share the original prompt; `podcast_vodcast` gets a dedicated full-episode verbatim script with a fixed 7-part structure (teaser hook → formal intro → roadmap → development → mid-episode CTA → closing questions → sign-off). The `podcast_vodcast` prompt has word-count instructions (80%–120% of transcript) plus "desenvolva completamente" on each section — these are in tension for short transcripts. Re-test with long real transcripts before concluding calibration is broken. See `docs/DECISIONS.md`.

**`podcast_vodcast`**: "IDIOMA OBRIGATÓRIO" sits at the very top covering all four deliverables — previously only the main script had a language instruction and the three extra deliverables (`clip_script`/`cta_line`/`pod_description`) could drift to the wrong language.

`llm_provider` stored as the actual model id (e.g. `"google/gemini-2.5-flash"`), not the gateway name.

`referencedVideos` persisted as a **plain array, not `JSON.stringify()`'d** — `referenced_videos` is `jsonb` and supabase-js serializes JS values for jsonb columns itself. Stringifying double-encodes it. Persistence happens inside `runScriptForge`, in the same `scripts` insert as everything else — the route (`app/api/agents/script-forge/route.ts`) has never done its own DB writes.

### API routes

- `GET /api/clients` — list ordered by name; `projectsCount` via one aggregate query (not N+1).
- `POST /api/clients` — `slug` server-side via `slugify(name)`, retried once with random suffix on unique-constraint collision.
- `DELETE /api/clients/[id]` — **blocked (400) if client has any projects**. `projects.client_id` is `on delete cascade`; without this guard a delete silently wipes all projects/scripts/seo/thumbnails/approval_events.
- `GET /api/projects` — `?clientId=all` or omitted → all clients; specific id → scoped. `?sort=name|created_at|updated_at|deadline|priority`, `?order=asc|desc` (default `updated_at desc`). **`priority` sorted in application code** by severity rank — alphabetical DB order would put "high" before "low" before "normal". `?q=` title search, `?tag=` jsonb containment.
- `GET/PATCH/DELETE /api/projects/[id]` — **no longer filter by `client_id`**. `id` is a unique key; client scoping broke lookups for non-`DEV_CLIENT_ID` clients.
- `PATCH /api/scripts/[id]` — `status` and/or `keywordsContext` independently.
- `GET /api/scripts/[id]/keywords` — forced tool-use (`tool_choice: "required"`, `extract_keywords`). Plain free-text was original impl; intermittently threw JSON-parse errors on markdown-fenced model output.
- `GET /api/youtube/trending?q=` — **serves ISO-8859-1 regardless of Content-Type header**. Decode via `new TextDecoder("iso-8859-1").decode(await res.arrayBuffer())`. JSONP body — parse by slicing between first `[` and last `]`.
- `POST /api/agents/script-forge` and `POST /api/agents/seo-engine` — **`clientId` derived from the project row, never accepted from the body, no `DEV_CLIENT_ID` fallback**. Prevents cross-client RAG contamination.
- **None have auth/session checks** — `// TODO(auth):` throughout; no tenant-membership model exists yet.

### `lib/agents/seo-engine.ts`
Same shape as script-forge (OpenRouter, `google/gemini-2.5-flash`, `max_tokens: 4096`, `tool_choice: "required"`, same `m.title`-based RAG `contextBlock`). Takes `keywordsContext: string[]`; non-empty adds "KEYWORDS PRIORITÁRIAS" block. Optional `llmProvider` input overrides model per-call.

### Content language
`Language = "pt-BR" | "en-US"` defined separately in `lib/agents/types.ts`, `lib/dashboard/types.ts`, and `lib/supabase/database.types.ts` — deliberate cross-layer duplication, same pattern as `Platform`/`ApprovalStatus`. **Script Forge and SEO Engine read `language` from the DB project row, not the request body** — per-project setting, not caller-overridable. Keywords-extraction and trending routes take it as `?lang=` (read-only, caller-trusted).

### Frontend / pages

**Next 16 requires `useSearchParams()` behind a `<Suspense>` boundary or the production build fails** ("Missing Suspense boundary with useSearchParams"). Dev mode never surfaces this — only `npm run build` does. `app/dashboard/page.tsx` and `app/(app)/projects/new/page.tsx` are both thin Suspense wrappers for this reason. Apply the same pattern to any future page that adds `useSearchParams`.

`app/dashboard/DashboardContent.tsx` — filters/sort live in the URL (`?q=`, `?clientId=`, `?tag=`, `?sort=`, `?order=`). "Todos os projetos" / "Por cliente" toggle (`?view=byClient`); grouping is client-side `Map`-building over the already-fetched array. Always sends `clientId=<filter>||"all"` explicitly to `GET /api/projects`.

`app/(app)/projects/new/page.tsx` (wrapped in `NewProjectContent.tsx`) — 6-option platform grid (all enum-valid and selectable); `PLATFORM_OPTIONS[n].enabled` kept for future gating. Required client `<select>` first field, preselected from `?clientId=`. Content type 3-option grid (`CONTENT_TYPE_OPTIONS` local to this file).

`app/(app)/clients/[id]/page.tsx` — "Indexar canal" button only when `client.channelUrl` is truthy. Loops `POST /api/connectors/youtube/index` until `remaining === 0`. Guards infinite loop: if `indexed: 0` with `failed.length > 0`, throws immediately (every video in that batch failed — retrying would loop forever).

`components/dashboard/ProjectCard.tsx` — **not wrapped in a single `<Link>`**: `ProjectActionsMenu`'s `<button>` can't legally nest inside `<a>`. Card is a `<div>` with `onClick → router.push()`, title is a real `<Link>` (keyboard/screen-reader/open-in-new-tab), menu stops propagation internally.

`components/dashboard/Avatar.tsx` — `className` carries **both** size and text-size utilities (default `"h-6 w-6 text-[10px]"`). Don't hardcode text size inside the component — which class wins between an internal and external one is CSS source-order, not reliable.

`components/dashboard/navItems.tsx` — icons are hand-drawn SVGs. **`lucide-react` is not installed** (verified — not in `package.json`). Never import from it.

`app/(app)/projects/[id]/page.tsx` — vertical pipeline stepper. `ScriptStage` (stage 1) and `SeoStage` (stage 2) are functional; stages 3–4 (`LockedStageContent`) stay locked until Thumbnail Studio / Checklist agents exist.

**`ScriptStage.tsx`** — 4 states: no script → draft (split view) → approved. Draft: desktop shows transcript + script side by side (`grid-cols-[2fr_3fr]`, `-mx-6` to bleed to card edges); below 768px collapses to a tab switcher. `onSplitViewActive` prop widens page container from `max-w-3xl` to `max-w-6xl` while in draft. Keyword state re-seeded from `script.keywordsContext` **during render** (not `useEffect`) — calling `setState` inside an effect trips `eslint-plugin-react-hooks`'s `set-state-in-effect` rule. This is React's documented pattern for "adjust state when a prop/id changes."

"Vídeos referenciados" rendered in the output panel, only when `script.referencedVideos` is non-null and non-empty. YouTube thumbnail via plain `<img src="https://img.youtube.com/vi/{videoId}/mqdefault.jpg">` with `// eslint-disable-next-line @next/next/no-img-element` (same pattern as `Avatar.tsx`, avoids adding `img.youtube.com` to `next.config.ts`).

**`SeoStage.tsx`** — 3 states: none → draft (title cards with CTR estimate + reasoning, plus description/tags/hashtags) → approved. Gated: only renders when `script.status` has passed `kelly_review`.

**i18n** (`lib/i18n/`) — `useSyncExternalStore` for localStorage (not `useEffect + setState` — trips the same eslint rule). Same-tab re-renders via `window.dispatchEvent(new Event("halo-locale-change"))` — `storage` event only fires in other tabs. **`LocaleProvider`/`LocaleToggle` must be in `app/layout.tsx`, not `app/(app)/layout.tsx`** — `/dashboard` is a sibling top-level segment, not nested in `(app)`, so `(app)/layout.tsx` changes never appear on `/dashboard`.

### `lib/dashboard/types.ts`
`ClientProfile` and all row types are `type` aliases (see Type gotchas). `toClientProfile()` maps `contact_email` → `email` (never add a second `clients.email` column). `checklist` maps to `projects.status` — no dedicated checklist table.

`ContentType` defined here and in `lib/agents/types.ts` (deliberate duplication); `lib/supabase/database.types.ts` uses bare `string` for `content_type` (app-layer-only constraint, no Postgres enum). Cast with `as ContentType` at read sites.

`Project`/`ProjectDetail` embed the full `ClientProfile` as `client`.

### DEV_CLIENT_ID
`GET /api/projects` — **`DEV_CLIENT_ID` is no longer the default** (pass `clientId=all` or a specific id). `POST /api/projects` still falls back to it if caller omits `clientId` (vestigial — `/projects/new` always sends a real one now). Agent routes derive `clientId` from the project row; no fallback anywhere in agent code.

## Type gotchas (already hit these once — don't reintroduce them)

- Row types in `lib/supabase/database.types.ts` **must be `type` aliases, not `interface`s**. supabase-js 2.108.2 checks `Row extends Record<string, unknown>` structurally — `interface` declarations don't get an implicit index signature for this check, so `.insert()`/`.upsert()` silently resolve to `never`. Same for `ScriptChapter` in `lib/agents/types.ts` (used in a jsonb insert).
- The `openai` SDK types `tool_calls[]` as a union discriminated by `type: "function" | "custom"`. **Narrow with `toolCall.type !== "function"` before accessing `.function`** — direct access on the union doesn't compile.

## Env vars

`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `YOUTUBE_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`. `YOUTUBE_CLIENT_ID`/`SECRET`/`REDIRECT_URI` are placeholders for future OAuth — nothing reads them yet. `DEV_CLIENT_ID` must point at a real `clients` row.

## Git conventions

- Conventional Commits.
- Never commit `.env`/`.env.local` — only `.env.example` with placeholders. `.gitignore` has `!.env.example` carved out; don't remove it.
- Check `git status --short` for stray `.env*`/`node_modules`/`.next` before every commit.
- `README.md` is the authoritative product pitch — don't overwrite without checking it first.

## Not built yet

- Auth (2-level: admin + client approver) and RLS policies — full design with ready-to-apply SQL in `docs/rls-policies.md`. Implement Fase A from that doc; don't redesign from scratch.
- `/projects`, `/analytics`, `/settings` top-level routes — still "Em construção" placeholders.
- Thumbnail Studio, Post-Production Assistant, Publish Checklist (stages 3–4 are locked-forever UI by design).
- Multi-provider LLM selector UI (SEO Engine already accepts `llmProvider` per-call; nothing in the UI exposes it yet).
- vidIQ MCP integration.
- YouTube OAuth + caption/transcript fetching.

## Verifying changes

Run `npx tsc --noEmit`, `npm run lint`, `npm run build` after any change to `lib/` or `app/api/`. These won't catch retired model ids — only live API calls will.

**If every route 404s after `npm run build`**: `.next` cache drift. Fix: `rm -rf .next` before restarting `npm run dev`.

E2E verification sequence in `docs/DECISIONS.md`.
