import { NextResponse } from "next/server";
import { resolveChannelId, youtubeConnector } from "@/lib/connectors/youtube";
import { indexCatalog } from "@/lib/rag/indexer";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Caps how many not-yet-indexed videos a single call processes — live-
// measured at ~550ms/video even with indexCatalog's internal concurrency
// limit applied, so a big channel (hundreds+ videos) can still run long
// enough to hit a serverless function timeout in one call. The caller
// (e.g. a "Reindexar" button) is expected to call this repeatedly with the
// same body until the response's `remaining` is 0 — see CLAUDE.md.
const DEFAULT_LIMIT = 10;

// TODO(auth): protect this route once Supabase Auth + tenant membership
// exists (see the RLS comment in 0001_initial_schema.sql).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.clientId || !body?.externalChannelId) {
    return NextResponse.json(
      { error: "clientId and externalChannelId are required" },
      { status: 400 }
    );
  }

  const limitParam = new URL(request.url).searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : DEFAULT_LIMIT;
  if (!Number.isFinite(limit) || limit <= 0) {
    return NextResponse.json({ error: "limit must be a positive number" }, { status: 400 });
  }

  try {
    // Resolved once here so the canonical Channel ID (not whatever format
    // the caller sent — @handle, full URL, or already a Channel ID) is what
    // gets passed to fetchCatalog and stored in projects.external_channel_id.
    // Otherwise re-indexing the same channel under a different input format
    // would silently store a different external_channel_id each time.
    const channelId = await resolveChannelId(body.externalChannelId);

    const videos = await youtubeConnector.fetchCatalog({ externalChannelId: channelId });

    if (videos.length === 0) {
      return NextResponse.json({ totalVideos: 0, indexed: 0, remaining: 0, failed: [] });
    }

    // Which of this channel's videos already have a `projects` row for
    // this client — checked against the DB rather than an `offset` the
    // caller would have to track, so a call that fails partway (or a
    // retry) is automatically picked up correctly by the next call instead
    // of needing manual resume bookkeeping.
    const supabase = getSupabaseAdmin();
    const { data: existingRows, error: existingError } = await supabase
      .from("projects")
      .select("external_video_id")
      .eq("client_id", body.clientId)
      .in(
        "external_video_id",
        videos.map((v) => v.externalVideoId)
      );
    if (existingError) throw new Error(existingError.message);

    const alreadyIndexed = new Set(existingRows?.map((row) => row.external_video_id) ?? []);
    const pending = videos.filter((v) => !alreadyIndexed.has(v.externalVideoId));
    const toIndex = pending.slice(0, limit);

    if (toIndex.length === 0) {
      return NextResponse.json({ totalVideos: videos.length, indexed: 0, remaining: 0, failed: [] });
    }

    const result = await indexCatalog({
      clientId: body.clientId,
      platform: "youtube",
      externalChannelId: channelId,
      videos: toIndex,
    });

    const remaining = pending.length - toIndex.length;
    const status = result.indexed === 0 && result.failed.length > 0 ? 502 : 200;
    return NextResponse.json(
      { totalVideos: videos.length, indexed: result.indexed, remaining, failed: result.failed },
      { status }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
