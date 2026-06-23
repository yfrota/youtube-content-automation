# YouTube Content Automation Platform — Project Context

@AGENTS.md

Read this before starting work in a new session — it has the architecture decisions, schema, and gotchas that aren't obvious from the code alone. Full product pitch/status table lives in `README.md`; this file is the engineering context.

## What this is

Multi-tenant SaaS that automates YouTube content production (script rewriting, SEO, thumbnails) with AI agents and a RAG pipeline over the channel's existing video catalog. Built to expand to Instagram/Facebook/LinkedIn later — every tenant-scoped table already carries `client_id` and every content table carries `platform`, even though only YouTube is implemented today.

Built as part of a boutique AI automation consultancy (see README footer).

## Status

The full slice — index a real YouTube channel's catalog into RAG → generate a script with Script Forge → confirm it's genuinely cross-referenced against that catalog — has been run end-to-end against the live Supabase project, live Gemini, and live OpenRouter (not mocked). It passed, after fixing two real bugs that only showed up by actually calling the live APIs (see "Provider history" and the type gotchas below). If you're picking this up fresh, the pipeline works; you don't need to re-derive that from the code.

## Stack

Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind + Supabase (Postgres + pgvector) + OpenRouter (agents) + Gemini embeddings. No test framework is set up — verification is manual (`npm run build` / `tsc --noEmit` + curl against the API routes).

**Provider history**: this started on Anthropic Claude (direct SDK) + OpenAI embeddings, then migrated to OpenRouter + Gemini (see `0003_update_embedding_dimension.sql` and the `feat: migrate embeddings to Gemini and agents to OpenRouter` commit). If you see stray mentions of Anthropic/OpenAI elsewhere (old commit messages, README's stack table), that's expected drift from before the migration, not a sign the migration is incomplete.

**Current model ids (verified live, not just "should work"):** embeddings use `gemini-embedding-001` (not `text-embedding-004` — Google retired it; the migration to `gemini-embedding-001` happened in code only, no new SQL migration needed since the schema only cares about the 768-dim output, not the model name). Script Forge uses `google/gemini-2.5-flash` via OpenRouter (not `gemini-flash-1.5` — OpenRouter retired it, "No endpoints found"). **Both of these are exactly the kind of thing that silently goes stale** — the provider can rename/retire a model id at any time, `tsc`/`lint`/`build` will never catch it, and the first sign is a runtime 404 from the live API. If something that used to work now 404s with "model not found" or "no endpoints found," check the provider's live `/models` list before assuming it's a code bug.

**Next.js 16 has real breaking changes vs. training data.** Check `node_modules/next/dist/docs/` before writing App Router code that looks "off."

## Architecture principles (don't violate these)

- **Multi-tenant**: every tenant-scoped table has `client_id` directly (denormalized, not just reachable via a join) — `clients` itself is the tenant root and has no `client_id`.
- **Multi-platform**: `projects`/`scripts`/`seo`/`thumbnails` carry `platform` (`youtube | instagram | facebook | linkedin`) directly, so the connector layer can dispatch without joining back to `projects`.
- **Connectors are adapters**: `lib/connectors/types.ts` defines `PlatformConnector` (`fetchCatalog`); each platform implements it (`lib/connectors/youtube.ts` today). No platform-specific branching outside the connector files.
- **Agents are platform-agnostic**: `lib/agents/` takes content/metadata + a `platform` tag and never branches on it. Platform-specific output formatting is the connector's job, not the agent's.

## Database (`supabase/migrations/`)

- `0001_initial_schema.sql` — `clients`, `projects`, `scripts`, `seo`, `thumbnails`, `approval_events`. Enums: `platform_type`, `approval_status` (`draft → kelly_review → client_review → approved → published`, matches README's approval flow — `kelly_review` is an internal review step, not a typo). `scripts.embedding` is `vector(1536)` with an HNSW index. **RLS is enabled on every table with no policies yet** — there's no auth/tenant-membership model, so the only way to read/write right now is `lib/supabase/admin.ts` (service-role key, bypasses RLS).
- `0002_catalog_indexing_support.sql` — adds:
  - `unique index on projects (client_id, external_video_id)` — **not partial**. NULLs never collide for uniqueness, so manually-created in-production projects (no video id yet) coexist fine; only real catalog video ids dedupe. Makes catalog re-indexing an idempotent upsert.
  - `unique index on scripts (project_id) where raw_transcript is null` — **partial**, catalog entries only. Real Script Forge drafts always set `raw_transcript`, so multi-version script generation per project is never blocked by this.
  - `match_scripts(query_embedding, match_client_id, match_platform, match_count)` — Postgres function exposed as an RPC, because supabase-js's query builder can't express `order by embedding <=> $param`. This is the only way RAG search works.
- `0003_update_embedding_dimension.sql` — drops/recreates `scripts.embedding` as `vector(768)` (was `vector(1536)`, OpenAI-sized) since the embedding provider moved to Gemini. Also redefines `match_scripts` with a `vector(768)` parameter — **if you ever change the embedding dimension again, you must update both the column and this function in the same migration**, or RAG search breaks with a dimension mismatch on the `<=>` operator. Includes a defensive `drop function` before the `create or replace`, since changing a function's parameter typmod is borderline enough behavior in Postgres that it's not worth relying on.
- `0004_grant_service_role_privileges.sql` — grants `service_role` `select/insert/update/delete` on all six tables, plus an `alter default privileges` rule so future tables auto-grant too. **This was a real production-blocking bug**, not a precaution: `service_role`'s `BYPASSRLS` only skips row-level policies — it does not imply ordinary table grants, and none of `0001`–`0003` ever granted any. Every API route was returning "permission denied for table X" until this was applied, discovered by actually running the app against the live database (RLS-focused reasoning in `0001`'s comments and `docs/rls-policies.md` talks about policies, not base grants — don't conflate the two layers again).
- Next migration should be `0005_*.sql` — don't renumber existing ones.

## What's implemented

- `lib/connectors/youtube.ts` — **metadata-only via `YOUTUBE_API_KEY`**, plain `fetch` (no `googleapis`). Pulls title/description/tags via `channels.list` → `playlistItems.list` (paginated) → `videos.list` (batched 50). **Deliberately no OAuth, no caption/transcript fetching** — explicit decision to avoid standing up an OAuth consent flow + token-storage table before it's needed (e.g. for publishing or private-video access later).
- `lib/rag/embeddings.ts` — Gemini `gemini-embedding-001`, 768 dims via `outputDimensionality` (matches the schema; don't change one without the other — and remember `match_scripts` needs updating too, see the `0003` note above). Plain `fetch` against `generativelanguage.googleapis.com`, same lightweight-no-SDK pattern as the YouTube connector. Uses `GEMINI_API_KEY`.
- `lib/rag/indexer.ts` — `indexCatalog()`. Upserts `projects` via `.upsert(..., {onConflict: "client_id,external_video_id"})` (safe, non-partial index). For `scripts`, **does NOT use `.upsert()`** — does an explicit select (`project_id` + `raw_transcript is null`) then insert/update, because PostgREST's upsert can't target a partial unique index (no way to attach the `WHERE` clause). If you're tempted to "simplify" this to `.upsert()`, don't — it'll fail at runtime with "no unique or exclusion constraint matching the ON CONFLICT specification."
- `lib/rag/search.ts` — `searchCatalog()`, wraps the `match_scripts` RPC.
- `lib/agents/script-forge.ts` — OpenRouter (`https://openrouter.ai/api/v1`, `OPENROUTER_API_KEY`), model `google/gemini-2.5-flash` by default, `max_tokens: 4096` set explicitly. **That `max_tokens` is load-bearing, don't drop it**: omit it and OpenRouter defaults to the model's max output (65535 for this one), which fails with a `402` "requires more credits, upgrade to a paid account" if the account's balance can't cover it — reads like a billing problem, not a missing-parameter bug, and cost real debugging time to trace back. Uses the `openai` npm package pointed at OpenRouter's base URL (the standard OpenRouter integration pattern — its API mirrors OpenAI's regardless of which underlying model it proxies to). **Forced tool-use** via `tool_choice: "required"` (not a named-function force — "required" is more broadly supported across the models OpenRouter can route to, and equivalent here since `emit_script` is the only tool defined) to get structured `{content, hook, chapters}` back. Pulls RAG context from `searchCatalog` before generating. `llm_provider` on the saved row stores the actual model id (e.g. `"google/gemini-2.5-flash"`), not the gateway name.
- API routes: `GET /api/projects` (real dashboard data), `POST /api/projects` (create), `POST /api/connectors/youtube/index`, `POST /api/agents/script-forge`. **None have auth/session checks** — each has a `// TODO(auth):` comment; this is accepted for now since they're server-only and there's no real tenant-membership model to check against yet.
- `app/dashboard/page.tsx` + `app/(app)/{projects,analytics,settings}/page.tsx` — basic dashboard UI (Apple-minimalist style: Inter, generous whitespace, desaturated status pills, `#0071e3` accent). Dashboard fetches `GET /api/projects` client-side (skeleton while loading, distinct error state vs. empty state — don't conflate "fetch failed" with "no projects yet", they need different UI). The other three routes are static "Em construção" placeholders sharing the same sidebar shell via the `app/(app)/` route group.
- `lib/dashboard/types.ts` — the `Project`/`PipelineModule`/`ApprovalStatus` shape both the API route and the UI components share. **`checklist` has no backing table** — there's no dedicated checklist/publish-gate table in the schema, so `GET /api/projects` maps it to the project's own `projects.status` column (the closest real equivalent to an overall publish gate). If a real `checklist` concept gets its own table later, update both the route and this mapping note.
- `GET /api/projects` reads `DEV_CLIENT_ID` (env var) as a stand-in for the authenticated user's client — **temporary, remove when real auth lands**. It also filters `projects` to `external_video_id IS NULL`: rows with that set are catalog imports from `/api/connectors/youtube/index` (already-published existing videos), not content actually in production, and the dashboard is for the latter only.

## Type gotchas (already hit these once — don't reintroduce them)

- `lib/supabase/database.types.ts` row types **must be `type` aliases, not `interface`s**. supabase-js 2.108.2 checks `Database['public']['Tables'][x]['Row'] extends Record<string, unknown>` structurally, and TypeScript only grants object type literals (and `type` aliases of them) an implicit index signature for that check — `interface` declarations are excluded from it and silently resolve every `.insert()`/`.upsert()` call to `never`. Same applies to `lib/agents/types.ts`'s `ScriptChapter` (used in a `jsonb` insert).
- The `openai` SDK types `ChatCompletion.choices[].message.tool_calls[]` as a union (`ChatCompletionMessageFunctionToolCall | ChatCompletionMessageCustomToolCall`, discriminated by `type: "function" | "custom"`). Narrow with `toolCall.type !== "function"` before accessing `.function` — accessing it directly on the union doesn't compile. See `script-forge.ts`'s tool-call handling.

## Env vars

See `.env.example` — `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `YOUTUBE_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY` are the ones currently used. `YOUTUBE_CLIENT_ID`/`SECRET` and `YOUTUBE_REDIRECT_URI` are placeholders for if/when OAuth gets added later — nothing reads them yet. `DEV_CLIENT_ID` is the dashboard's temporary stand-in for an authenticated client_id (see "What's implemented" above) — must point at a real row in `clients` or `GET /api/projects` just returns an empty list.

## Git conventions (apply to every future commit, not just past ones)

- Conventional Commits.
- Never commit `.env`/`.env.local` or real secrets — only `.env.example` with placeholders. `.gitignore` already has `!.env.example` carved out of the `.env*` ignore rule; don't remove that.
- Check `git status --short` for stray `.env*`/`node_modules`/`.next` before every commit.
- This repo's `main` branch already had a `LICENSE` + a more detailed product-pitch `README.md` pushed directly on GitHub before local scaffolding started — that history was merged in (`--allow-unrelated-histories`) early on. `README.md` is the authoritative product pitch; don't overwrite it without checking it first.

## Not built yet (from README's status table + follow-ups flagged during implementation)

- Auth (2-level: admin + client approver) and the tenant-membership model that RLS policies depend on — this is the actual blocker for enabling RLS policies and for protecting the API routes. The full design (`client_members` table, `is_client_admin()` helper, per-table policies, and why the client-review flow is recommended to stay server-mediated via tokenized links rather than RLS) is already written up in `docs/rls-policies.md`, including ready-to-apply SQL — implement Fase A by following that doc, don't redesign from scratch.
- Dashboard "Novo projeto" button is still a placeholder (shows a toast, doesn't create anything) — needs a create-project form/modal wired to the existing `POST /api/projects`.
- The `/projects`, `/analytics`, `/settings` routes are static "Em construção" placeholders, not real pages.
- SEO Engine, Thumbnail Studio, Post-Production Assistant, Publish Checklist agents.
- Multi-provider LLM selector (today Script Forge is hardcoded to one OpenRouter model, `google/gemini-2.5-flash`).
- vidIQ MCP integration.
- YouTube OAuth + caption/transcript fetching (only needed if/when transcripts or publish actions are required).

## Verifying changes

No test framework — run `npx tsc --noEmit`, `npm run lint`, `npm run build` after any change to `lib/` or `app/api/`. None of those three would have caught either bug fixed above — both were live-API drift (retired model ids), invisible until something actually called the real endpoint.

**If every route suddenly 404s after running `npm run build`, that's `.next` cache drift, not a code bug**: `next build` and `next dev` share the `.next` directory, and a prod manifest left over from a build confuses the dev server's routing. Fix: `rm -rf .next` before restarting `npm run dev`.

For end-to-end behavior, this exact sequence has been run successfully against the live stack: `npm run dev` → create a `clients` row directly via the Supabase REST API (no client-creation route exists) → `POST /api/connectors/youtube/index` with a real channel → re-run it to confirm idempotency (counts shouldn't move) → `POST /api/projects` → `POST /api/agents/script-forge` with a transcript topically related to the indexed channel, confirm `crossReferencedProjectIds` is non-empty → run it again with an unrelated-topic transcript, confirm the ids differ. If you want quantitative proof RAG is real and not coincidental, call the `match_scripts` RPC directly with both query embeddings and compare `similarity` — expect ~0.78–0.84 for on-topic vs. ~0.48 for off-topic. Clean up test data afterward (`DELETE` the test `clients` row — cascades to everything).
