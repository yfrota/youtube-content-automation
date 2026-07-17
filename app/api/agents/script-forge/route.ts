import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runScriptForge } from "@/lib/agents/script-forge";
import { buildIcpContext } from "@/lib/agents/icp-context";
import { toClientProfile } from "@/lib/dashboard/types";
import type { ContentType, OutputMode } from "@/lib/agents/types";

// Single string literal, not `+`-concatenated — see the same note on
// app/api/clients/[id]/route.ts's CLIENT_SELECT (concatenation widens the
// type and breaks supabase-js's column inference).
const CLIENT_ICP_SELECT =
  "id, name, image_url, description, contact_email, phone, channel_url, icp_text, icp_demographics, icp_psychographics, icp_motivations, icp_fears, icp_desires, icp_objections, icp_stories, icp_llm_provider, brand_colors, brand_notes, created_at, updated_at";

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

  // Read language, content_type, output_mode, AND client_id from the project
  // row rather than trust the client — all are per-project settings
  // (content_type since 0010, output_mode since 0013, same reasoning as
  // language: they select which prompt/tool Script Forge uses, not
  // something an individual call should override), and client_id is the
  // tenant boundary for the RAG search inside runScriptForge: trusting a
  // caller-supplied clientId instead would let a mismatched
  // projectId/clientId pair search a different client's catalog.
  const supabase = getSupabaseAdmin();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("client_id, language, content_type, output_mode, llm_script")
    .eq("id", body.projectId)
    .maybeSingle();
  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // ICP context (0014) — best-effort: a missing/failed client lookup
  // shouldn't block script generation, it just means the prompt goes out
  // without audience calibration (buildIcpContext already returns "" for a
  // client with no ICP configured, same fallback shape).
  const { data: clientRow } = await supabase
    .from("clients")
    .select(CLIENT_ICP_SELECT)
    .eq("id", project.client_id)
    .maybeSingle();
  const icpContext = clientRow ? buildIcpContext(toClientProfile(clientRow)) : "";

  try {
    const result = await runScriptForge({
      ...body,
      clientId: project.client_id,
      language: project.language,
      contentType: project.content_type as ContentType,
      outputMode: project.output_mode as OutputMode,
      contextNote: typeof body.contextNote === "string" ? body.contextNote : undefined,
      llmProvider: project.llm_script,
      icpContext,
    });
    return NextResponse.json({ script: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
