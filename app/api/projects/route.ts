import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// TODO(auth): protect this route once Supabase Auth + tenant membership
// exists (see the RLS comment in 0001_initial_schema.sql).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.clientId || !body?.platform || !body?.title) {
    return NextResponse.json(
      { error: "clientId, platform, and title are required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      client_id: body.clientId,
      platform: body.platform,
      title: body.title,
      external_channel_id: body.externalChannelId ?? null,
      external_video_id: body.externalVideoId ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data }, { status: 201 });
}
