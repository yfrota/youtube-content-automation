import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { toClientProfile } from "@/lib/dashboard/types";

// This is the one route that actually renders ICP/brand (the /clients/[id]
// page's "Perfil do Público" section, 0014) — every other CLIENT_SELECT in
// this codebase deliberately stays narrow (see ClientProfile's own comment
// in lib/dashboard/types.ts).
//
// Single string literal, not `+`-concatenated — supabase-js's typed
// .select() overloads pattern-match on the literal string type to infer
// which columns come back; concatenation widens it to plain `string` and
// the return type degrades to an unhelpful GenericStringError.
const CLIENT_SELECT =
  "id, name, image_url, description, contact_email, phone, channel_url, icp_text, icp_demographics, icp_psychographics, icp_motivations, icp_fears, icp_desires, icp_objections, icp_stories, icp_llm_provider, brand_colors, brand_notes, created_at, updated_at";

// TODO(auth): protect this route once Supabase Auth + tenant membership
// exists (see docs/rls-policies.md).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select(CLIENT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (clientError) {
    return NextResponse.json({ error: clientError.message }, { status: 500 });
  }
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const { count, error: countError } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("client_id", id);
  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  return NextResponse.json({
    client: toClientProfile(client),
    projectsCount: count ?? 0,
  });
}

// TODO(auth): protect this route once Supabase Auth + tenant membership
// exists (see docs/rls-policies.md).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Typed as the exact subset of columns updatable here (rather than
  // Record<string, unknown>) — supabase-js's .update() rejects an indexed
  // type, it needs something structurally assignable to Partial<ClientsRow>.
  const update: {
    name?: string;
    description?: string | null;
    contact_email?: string | null;
    phone?: string | null;
    image_url?: string | null;
    channel_url?: string | null;
    icp_text?: string | null;
    icp_demographics?: string | null;
    icp_psychographics?: string | null;
    icp_motivations?: string | null;
    icp_fears?: string | null;
    icp_desires?: string | null;
    icp_objections?: string | null;
    icp_stories?: string | null;
    icp_llm_provider?: string | null;
    brand_colors?: { hex: string; name: string; role: string }[] | null;
    brand_notes?: string | null;
  } = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
    }
    update.name = body.name.trim();
  }
  if (body.description !== undefined) update.description = body.description;
  if (body.email !== undefined) update.contact_email = body.email;
  if (body.phone !== undefined) update.phone = body.phone;
  if (body.imageUrl !== undefined) update.image_url = body.imageUrl;
  if (body.channelUrl !== undefined) update.channel_url = body.channelUrl;
  // ICP (0014) — free-text tab and structured tab both PATCH here, either
  // one field at a time (icpText alone) or the whole structured set at once,
  // so every field is independently optional. icpLlmProvider is set
  // separately by whatever flow generates the ICP via AI (not built in this
  // pass) — accepted here too so that future caller has somewhere to persist it.
  if (body.icpText !== undefined) update.icp_text = body.icpText;
  if (body.icpDemographics !== undefined) update.icp_demographics = body.icpDemographics;
  if (body.icpPsychographics !== undefined) update.icp_psychographics = body.icpPsychographics;
  if (body.icpMotivations !== undefined) update.icp_motivations = body.icpMotivations;
  if (body.icpFears !== undefined) update.icp_fears = body.icpFears;
  if (body.icpDesires !== undefined) update.icp_desires = body.icpDesires;
  if (body.icpObjections !== undefined) update.icp_objections = body.icpObjections;
  if (body.icpStories !== undefined) update.icp_stories = body.icpStories;
  if (body.icpLlmProvider !== undefined) update.icp_llm_provider = body.icpLlmProvider;
  if (body.brandColors !== undefined) {
    if (
      body.brandColors !== null &&
      (!Array.isArray(body.brandColors) ||
        !body.brandColors.every(
          (c: unknown) =>
            typeof c === "object" &&
            c !== null &&
            typeof (c as Record<string, unknown>).hex === "string" &&
            typeof (c as Record<string, unknown>).name === "string" &&
            typeof (c as Record<string, unknown>).role === "string"
        ))
    ) {
      return NextResponse.json(
        { error: "brandColors must be an array of { hex, name, role }" },
        { status: 400 }
      );
    }
    update.brand_colors = body.brandColors;
  }
  if (body.brandNotes !== undefined) update.brand_notes = body.brandNotes;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("clients")
    .update(update)
    .eq("id", id)
    .select(CLIENT_SELECT)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  return NextResponse.json({ client: toClientProfile(data) });
}

// TODO(auth): protect this route once Supabase Auth + tenant membership
// exists (see docs/rls-policies.md).
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";
  const supabase = getSupabaseAdmin();

  const { count, error: countError } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("client_id", id);
  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  if (count && count > 0) {
    if (!force) {
      // clients -> projects is `on delete cascade` (0001) — without this guard
      // a plain delete would silently wipe every project/script/seo/thumbnail/
      // approval_event the client owns. Require explicit ?force=true.
      return NextResponse.json(
        {
          error: `Cannot delete client: ${count} project(s) still linked to it. Remove or reassign them first.`,
        },
        { status: 400 }
      );
    }
    // Cascade manually: delete projects first (scripts/seo/thumbnails/
    // approval_events cascade from projects via on delete cascade since 0001).
    const { error: projectsDeleteError } = await supabase
      .from("projects")
      .delete()
      .eq("client_id", id);
    if (projectsDeleteError) {
      return NextResponse.json({ error: projectsDeleteError.message }, { status: 500 });
    }
  }

  const { error: deleteError } = await supabase.from("clients").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
