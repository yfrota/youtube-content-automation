import { NextResponse } from "next/server";
import { resolveChannelId, youtubeConnector } from "@/lib/connectors/youtube";
import { indexCatalog } from "@/lib/rag/indexer";

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

  try {
    // Resolved once here so the canonical Channel ID (not whatever format
    // the caller sent — @handle, full URL, or already a Channel ID) is what
    // gets passed to fetchCatalog and stored in projects.external_channel_id.
    // Otherwise re-indexing the same channel under a different input format
    // would silently store a different external_channel_id each time.
    const channelId = await resolveChannelId(body.externalChannelId);

    const videos = await youtubeConnector.fetchCatalog({ externalChannelId: channelId });

    if (videos.length === 0) {
      return NextResponse.json({ totalVideos: 0, indexed: 0, failed: [] });
    }

    const result = await indexCatalog({
      clientId: body.clientId,
      platform: "youtube",
      externalChannelId: channelId,
      videos,
    });

    const status = result.indexed === 0 && result.failed.length > 0 ? 502 : 200;
    return NextResponse.json(result, { status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
