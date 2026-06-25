# Architecture Decisions & Debug History

Historical decisions, investigation logs, and rationale removed from CLAUDE.md to keep it lean.
The rules/conclusions are in CLAUDE.md; the *why we got there* is here.

---

## Provider migration

Started on Anthropic Claude (direct SDK) + OpenAI embeddings (`text-embedding-ada-002`, 1536 dims).
Migrated to OpenRouter + Gemini (`gemini-embedding-001`, 768 dims) — see `0003_update_embedding_dimension.sql` and the `feat: migrate embeddings to Gemini and agents to OpenRouter` commit.

`text-embedding-004` was used briefly before Google retired it; `gemini-embedding-001` is current.
Script Forge originally used `gemini-flash-1.5` via OpenRouter; retired ("No endpoints found") → `google/gemini-2.5-flash`.

**Lesson**: model ids silently go stale. Neither `tsc`/`lint`/`build` nor any test catches a retired id. First sign is a runtime 404. When that happens, check the provider's live `/models` list before assuming a code bug.

---

## `service_role` BYPASSRLS ≠ table grants (migration 0004)

Migrations `0001`–`0003` never granted ordinary table privileges. `service_role`'s `BYPASSRLS` only bypasses row-level security policies — it does not imply `SELECT`/`INSERT`/`UPDATE`/`DELETE`. Every API route returned "permission denied for table X" until `0004_grant_service_role_privileges.sql` was applied. The `0001` comments and `docs/rls-policies.md` discuss policies, not base grants — don't conflate the two layers.

---

## Why `match_scripts` always uses drop-then-recreate

`CREATE OR REPLACE FUNCTION` cannot change a function's parameter typmod (e.g., `vector(1536)` → `vector(768)`) or its return columns. Postgres treats these as different function signatures. A `DROP FUNCTION` before each redefinition is the safe path. Migrations 0003, 0007, and 0011 all use this pattern for exactly this reason.

---

## `match_scripts` evolution

**0002**: initial — returns `project_id`, `content`, `similarity`. No join to `projects`.

**0007** (two bugs fixed together because both needed the same join):
1. Agents were interpolating the raw `project_id` uuid into the context block. Model sometimes echoed the uuid literally into generated script content (one pre-fix script in the DB still has a literal project_id in its `content`). Fixed by joining `projects` and returning `title`. Prompt now says "use the TITLE, never an id."
2. Manually-created in-production projects (`external_video_id IS NULL`) were appearing as RAG candidates. Filtering in SQL (before `ORDER BY`/`LIMIT`) matters: post-filtering in app code could silently return fewer than `match_count` results even when enough eligible catalog entries exist further down the similarity ranking. Pre-fix, a same-topic Script Forge call with only manual-project scripts embedded returned matches when it shouldn't have.

**0011**: added `p.external_video_id` to the return set. Without it, `RagMatch` had no YouTube video id at all — only `title`/`projectId` — making the `referencedVideos` cross-reference impossible.

---

## Vercel indexing timeout — root cause and fix

Indexing 76 videos in one call was 502-ing on Vercel (serverless function timeout). Investigation with `console.time`:

- `embedBatch(76)` — one batched Gemini call for the whole input — took **1.7s**. Not the bottleneck.
- The per-video loop (upsert `projects` → select `scripts` → insert-or-update `scripts`, fully sequential): **44s total, ~550ms/video** — 3 sequential Supabase round-trips × 76 videos, zero concurrency.

Fix: run up to `PER_VIDEO_CONCURRENCY` (10) per-video chains concurrently via a hand-rolled `runWithConcurrency`. `indexed++`/`failed.push()` are safe to mutate from concurrent workers (Node's single-threaded event loop, no true parallel write).

Result: same 76 videos → **9.6s** (~130ms/video). Real improvement, but still close to a 10s serverless ceiling for large channels.

Second fix (independent): pagination via `?limit=` (default 10). Each call checks the DB for already-indexed video ids, indexes only the next batch. Returns `{totalVideos, indexed, remaining, failed}`. Callers loop until `remaining === 0`. DB-based resume means failed/retried calls pick up correctly with no manual offset bookkeeping.

Live-verified across 3 sequential calls against a real 171-video channel:
- Call 1: `{indexed:10, remaining:161}` in 4.6s
- Call 2 (same body): `{indexed:10, remaining:151}`, no duplicate work
- Call 3 (`?limit=76`): `{indexed:76, remaining:75}` in 9.6s

**Vercel plan was not confirmed** at the time of this fix (no `.vercel/`/`vercel.json`, CLI not installed/authenticated, user didn't know the plan). Pagination was chosen specifically because it's correct regardless of plan or `maxDuration` support. `export const maxDuration = 60` was deliberately not added speculatively — it's only meaningful on Pro+, unverified — but is low-risk to add later once the plan is confirmed.

---

## Script Forge `max_tokens` — history and investigation

The value was a series of hand-tuned constants: `4096` → `8192` → `12000` → `11000` → `10000` → `16000` → `20000`, before being replaced with a dynamic formula.

### Why dynamic

At `4096`, the formula `transcriptWords × 1.872` gave only ~5228 tokens for a real 2793-word transcript. That run truncated mid-sentence at 79 words (far below what a fixed 20000 had separately completed fully).

Current formula:
```
max_tokens = min(max(transcriptWords × 1.872, 10000), 30000)
```
- `× 1.872` = ~1.3 tokens/word (English) × 120% prompt ceiling × 20% buffer
- Floor 10000 (below this, the formula under-provisions real transcripts)
- Cap 30000 (~10k output words, the product's own upper bound)

### Why `max_tokens` turned out not to be the real lever

Even after raising the floor to 10000, live-testing the dynamic formula still produced incomplete-looking output — 45, then 297 (cut off mid-sentence), then 742 words for the *same* 192-word transcript, same prompt, same `max_tokens`. Checking `response.choices[0].finish_reason`:

- All runs returned `"tool_calls"` (clean voluntary stop)
- `completion_tokens` used nowhere near the budget (1047–1642 of 10000)
- `reasoning_tokens: 0`

The model was choosing how much to write via sampling, not hitting a budget ceiling.

### Temperature fix

`temperature: 0.4` on the main script-generation call. Previously unset (defaulting to ~1.0). After setting:
- 4 runs of the same short transcript: tight 760–854 word range, all complete
- 3 runs of the real 2793-word transcript: all completed fully (1715–2836 words, zero truncation)

Some residual length variance relative to the 80%-120% target remains (not eliminated, just no longer *incomplete*). Not chased further.

### OpenRouter 402 on missing `max_tokens`

If `max_tokens` is omitted, OpenRouter defaults to the model's max output (65535) and returns 402 if account credit can't cover it. The error reads like a billing problem, not a missing-parameter bug. Actual affordable ceiling varies by account balance (observed: ~11988 at low balance, 20000+ after top-up). Re-verify against current balance before raising the formula cap past 30000.

---

## `referencedVideos` — why extracted in a separate call

`0011` originally put `referenced_video_ids`/`referenced_video_reasons` as extra optional properties on the `emit_script` tool call. Live test against a real 2793-word transcript: script came back truncated mid-sentence at ~553 words, far under the 80%-120% target. The model was spending budget describing references *before* finishing the script body.

Fix: `identifyReferencedVideoIds()` — a second, separate call after the script exists. `max_tokens: 200` (`VIDEO_ID_EXTRACTION_MAX_TOKENS`). Prompts with the script's first 2000 chars (`SCRIPT_EXCERPT_CHAR_LIMIT`) + each RAG match's title+id. Plain free-text completion (not forced tool-use — cheap/optional enough that a defensive markdown-fence strip + empty-array-on-failure was simpler). Only asks for ids, not reasons map, to minimize the extra round-trip's latency/cost. `reason` is always `""` on the output; `ScriptStage` simply doesn't render the reason line for empty string.

After fix: real 2793-word transcript → 3692 words (no truncation, ends on complete sentence), `referencedVideos` came back with 4 real ids.

---

## `podcast_vodcast` prompt calibration

The prompt computes `transcriptWordCount` and tells the model to land within 80%-120% of that count. It also appends "desenvolva completamente — não use placeholder ou resumo" to each of the 7 structure sections.

**Unresolved tension for short transcripts**: against a 332-word synthetic test, the model produced 948 words (nearly 3× the 266–398 target). The mandatory 7-section full-episode structure (teaser hook + formal intro + roadmap + 2–3 development parts + mid-episode CTA + closing questions + sign-off, each told to "develop completely") structurally requires more raw content than a tight word ceiling allows for short inputs. The two instructions are genuinely in tension for short inputs; not re-tuned since both were the user's explicit spec.

**Action**: re-test with a real, full-length podcast transcript (thousands of words) before concluding this calibration doesn't work. The original truncation/over-summarization bug was observed on long real transcripts, where structural floor and 80%–120% ceiling may not conflict.

---

## Why `indexer.ts` can't use `.upsert()` for scripts

`scripts` has a *partial* unique index (`project_id WHERE raw_transcript IS NULL`). PostgREST's upsert can't target a partial index — there's no way to attach the `WHERE` clause. Attempting `.upsert()` fails at runtime: "no unique or exclusion constraint matching the ON CONFLICT specification." The indexer does an explicit `SELECT` then `INSERT` or `UPDATE` instead.

---

## Why no YouTube OAuth

Deliberate decision to avoid standing up an OAuth consent flow + token-storage table before it's needed. The connector is metadata-only (`YOUTUBE_API_KEY`). OAuth only becomes necessary for publishing actions or private-video transcript access.

---

## RAG client isolation bug

`POST /api/agents/script-forge` and `POST /api/agents/seo-engine` used to take `clientId` from the request body (falling back to `DEV_CLIENT_ID`). A caller could send a `projectId` from one client with a different `clientId` in the body — the RAG search would run against the wrong client's catalog, and the new `scripts`/`seo` row would be inserted under the wrong client too.

Fix: both routes select `client_id` off the project row (same query that already fetches `language`) and use that as `clientId`. No `clientId` accepted from the body, no fallback.

---

## Why `GET /api/projects` stopped defaulting to `DEV_CLIENT_ID`

Before `/clients` pages existed, every project belonged to `DEV_CLIENT_ID` and scoping the list to it was silently correct. Once clients are a real concept and projects can belong to any client, a list endpoint quietly scoping to one hidden tenant stopped making sense. `"all"` sentinel (vs. just omitting the param) exists because the dashboard always sends *something* and needs to distinguish "user picked all clients" from "param absent."

## Why `GET/PATCH/DELETE /api/projects/[id]` no longer filter by `client_id`

Caught live while verifying `/clients/[id]`: clicking into a project belonging to a freshly-created non-`DEV_CLIENT_ID` client returned 404 "Project not found" even though the project existed. `id` is a unique key; no client scoping is needed for a single-resource lookup once projects can belong to any client.

---

## i18n: why `useSyncExternalStore` instead of `useEffect + setState`

The obvious "hydrate from localStorage after mount" pattern (`useEffect(() => { setState(localStorage.getItem(...)) }, [])`) trips `eslint-plugin-react-hooks`'s `set-state-in-effect` rule even though it's textbook-correct. `useSyncExternalStore` with a `getServerSnapshot`/`getSnapshot` pair handles the SSR-default-then-reconcile dance without triggering the rule.

Same-tab re-renders: `setLocale` dispatches `window.dispatchEvent(new Event("halo-locale-change"))` because the native `storage` event only fires in *other* tabs.

`LocaleProvider`/`LocaleToggle` go in `app/layout.tsx` (the true root), not `app/(app)/layout.tsx`. `/dashboard` is a sibling top-level segment, not nested inside `(app)` — anything in `(app)/layout.tsx` silently never appears on `/dashboard`.

---

## i18n: `ScriptStage` keyword state re-seed pattern

Selection state is re-seeded from `script.keywordsContext` **during render** (`if (scriptId !== seededForScriptId) { ...; setSelectedKeywords(...) }`), not inside a `useEffect`. Calling `setState` synchronously inside an effect body trips `eslint-plugin-react-hooks`'s `set-state-in-effect` rule. This is React's own documented pattern for "adjust state when a prop/id changes."

---

## E2E verification sequence (last known good)

Run against the live stack (Supabase + Gemini + OpenRouter, not mocked):

1. `npm run dev`
2. Create a `clients` row (Supabase REST API direct, or now via `/clients/new`)
3. `POST /api/connectors/youtube/index` with a real channel
4. Re-run with same body → counts shouldn't move (idempotency check)
5. `POST /api/projects`
6. `POST /api/agents/script-forge` with a transcript topically related to the indexed channel → confirm `crossReferencedProjectIds` non-empty
7. Repeat with an unrelated-topic transcript → confirm different ids

For quantitative RAG proof: call `match_scripts` RPC directly with both query embeddings and compare `similarity`. Expected: ~0.78–0.84 for on-topic vs. ~0.48 for off-topic.

Clean up: `DELETE` the test `clients` row — cascades to all projects/scripts/seo/thumbnails/approval_events.
