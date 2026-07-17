import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { generateThumbnailText } from "@/lib/agents/thumbnail-text";
import { buildIcpContext } from "@/lib/agents/icp-context";
import { toClientProfile } from "@/lib/dashboard/types";

// Single string literal, not `+`-concatenated — see the same note on
// app/api/clients/[id]/route.ts's CLIENT_SELECT.
const CLIENT_ICP_SELECT =
  "id, name, image_url, description, contact_email, phone, channel_url, icp_text, icp_demographics, icp_psychographics, icp_motivations, icp_fears, icp_desires, icp_objections, icp_stories, icp_llm_provider, brand_colors, brand_notes, created_at, updated_at";

// Same eligibility gate as SEO Engine's route — thumbnail text is generated
// off the approved script's own content/hook, regenerating it the moment an
// unreviewed draft script changes would be wasted work.
const ELIGIBLE_SCRIPT_STATUSES = ["kelly_review", "client_review", "approved"];

// TODO(auth): protect this route once Supabase Auth + tenant membership
// exists (see docs/rls-policies.md).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("client_id, title, platform, llm_thumbnail")
    .eq("id", body.projectId)
    .maybeSingle();
  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const clientId = project.client_id;

  // Latest real script for this project — same "version desc, then
  // created_at desc, raw_transcript not null" precedent as GET
  // /api/projects/[id] (catalog-imported rows never apply here).
  const { data: scripts, error: scriptError } = await supabase
    .from("scripts")
    .select("id, content, hook, status")
    .eq("project_id", body.projectId)
    .not("raw_transcript", "is", null)
    .order("version", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  if (scriptError) {
    return NextResponse.json({ error: scriptError.message }, { status: 500 });
  }
  const script = scripts?.[0];
  if (!script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }
  if (!ELIGIBLE_SCRIPT_STATUSES.includes(script.status)) {
    return NextResponse.json(
      {
        error: `script.status must be one of: ${ELIGIBLE_SCRIPT_STATUSES.join(", ")} (got "${script.status}")`,
      },
      { status: 409 }
    );
  }

  // ICP context (0014) — best-effort, same reasoning as script-forge's and
  // seo-engine's routes: a missing client lookup just means no audience
  // calibration, never a blocked generation.
  const { data: clientRow } = await supabase
    .from("clients")
    .select(CLIENT_ICP_SELECT)
    .eq("id", clientId)
    .maybeSingle();
  const icpContext = clientRow ? buildIcpContext(toClientProfile(clientRow)) : "";

  try {
    const result = await generateThumbnailText({
      platform: project.platform,
      projectTitle: project.title,
      scriptContent: script.content,
      hook: script.hook ?? "",
      icpContext,
      llmProvider: project.llm_thumbnail,
    });

    const { data: thumbnail, error: upsertError } = await supabase
      .from("thumbnails")
      .upsert(
        {
          client_id: clientId,
          project_id: body.projectId,
          script_id: script.id,
          platform: project.platform,
          variations: result.variations,
          llm_provider: result.llmProvider,
          status: "draft",
        },
        { onConflict: "project_id" }
      )
      .select()
      .single();
    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ thumbnail }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
