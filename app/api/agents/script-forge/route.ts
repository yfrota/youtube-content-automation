import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runScriptForge } from "@/lib/agents/script-forge";
import type { ContentType } from "@/lib/agents/types";

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

  // Read language, content_type, AND client_id from the project row rather
  // than trust the client — all three are per-project settings (content_type
  // since 0010, same reasoning as language: it selects which prompt
  // structure Script Forge uses, not something an individual call should
  // override), and client_id is the tenant boundary for the RAG search
  // inside runScriptForge: trusting a caller-supplied clientId instead would
  // let a mismatched projectId/clientId pair search a different client's
  // catalog.
  const supabase = getSupabaseAdmin();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("client_id, language, content_type")
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
      contentType: project.content_type as ContentType,
    });
    return NextResponse.json({ script: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
