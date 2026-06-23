import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runScriptForge } from "@/lib/agents/script-forge";

// TODO(auth): protect this route once Supabase Auth + tenant membership
// exists (see the RLS comment in 0001_initial_schema.sql).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.projectId || !body?.platform || !body?.rawTranscript) {
    return NextResponse.json(
      { error: "projectId, platform, and rawTranscript are required" },
      { status: 400 }
    );
  }

  // Read language AND client_id from the project row rather than trust the
  // client — language is a per-project setting, and client_id is the tenant
  // boundary for the RAG search inside runScriptForge: trusting a
  // caller-supplied clientId instead would let a mismatched projectId/
  // clientId pair search a different client's catalog.
  const supabase = getSupabaseAdmin();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("client_id, language")
    .eq("id", body.projectId)
    .maybeSingle();
  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const result = await runScriptForge({
      ...body,
      clientId: project.client_id,
      language: project.language,
    });
    return NextResponse.json({ script: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
