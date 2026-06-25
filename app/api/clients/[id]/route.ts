import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { toClientProfile } from "@/lib/dashboard/types";

const CLIENT_SELECT =
  "id, name, image_url, description, contact_email, phone, channel_url, created_at, updated_at";

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
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  // clients -> projects is `on delete cascade` (0001) — without this guard,
  // deleting a client would silently wipe every project/script/seo/
  // thumbnail/approval_event it owns. Block instead of cascading.
  const { count, error: countError } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("client_id", id);
  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }
  if (count && count > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete client: ${count} project(s) still linked to it. Remove or reassign them first.`,
      },
      { status: 400 }
    );
  }

  const { error: deleteError } = await supabase.from("clients").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
