import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runScriptForge } from "@/lib/agents/script-forge";

// TODO(auth): replace with the authenticated user's client_id once Supabase
// Auth + tenant membership exists (see docs/rls-policies.md).
const DEV_CLIENT_ID = process.env.DEV_CLIENT_ID;

// TODO(auth): protect this route once Supabase Auth + tenant membership
// exists (see the RLS comment in 0001_initial_schema.sql).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  // clientId falls back to DEV_CLIENT_ID so callers (e.g. the project detail
  // page, a client component) never need that env var sent to the browser —
  // same pattern as app/api/projects/route.ts's POST handler.
  const clientId = body?.clientId ?? DEV_CLIENT_ID;
  if (!clientId || !body?.projectId || !body?.platform || !body?.rawTranscript) {
    return NextResponse.json(
      { error: "clientId, projectId, platform, and rawTranscript are required" },
      { status: 400 }
    );
  }

  // Read language from the project row rather than trust the client — it's
  // a per-project setting, not something each call should be able to
  // override, and the DB column is the single source of truth for it.
  const supabase = getSupabaseAdmin();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("language")
    .eq("id", body.projectId)
    .maybeSingle();
  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const result = await runScriptForge({ ...body, clientId, language: project.language });
    return NextResponse.json({ script: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
