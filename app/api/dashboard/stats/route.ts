import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Small aggregate for StatsRow's "Vídeos indexados" KPI (Soft Studio
// redesign). GET /api/projects deliberately excludes catalog-imported rows
// (`.is("external_video_id", null)`), so that count isn't derivable from
// the dashboard's already-loaded project list — this is a dedicated
// head-count query instead, same "one aggregate query, not N+1" precedent
// as GET /api/clients' projectsCount.
//
// TODO(auth): protect this route once Supabase Auth + tenant membership
// exists (see docs/rls-policies.md).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientIdParam = url.searchParams.get("clientId");
  // "all"/omitted both mean the consolidated (all-clients) count — same
  // "all" sentinel GET /api/projects already uses for its own clientId.
  const clientId = clientIdParam && clientIdParam !== "all" ? clientIdParam : null;

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .not("external_video_id", "is", null);
  if (clientId) query = query.eq("client_id", clientId);

  const { count, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ indexedVideos: count ?? 0 });
}
