import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { toClientProfile } from "@/lib/dashboard/types";

const CLIENT_SELECT = "id, name, image_url, description, contact_email, phone, created_at, updated_at";

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents (combining marks, post-NFD)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "client";
}

// TODO(auth): protect this route once Supabase Auth + tenant membership
// exists (see docs/rls-policies.md).
export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("clients")
    .select(CLIENT_SELECT)
    .order("name", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ clients: (data ?? []).map(toClientProfile) });
}

// TODO(auth): protect this route once Supabase Auth + tenant membership
// exists (see docs/rls-policies.md).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.name || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const baseSlug = slugify(body.name);
  const insert = {
    name: body.name.trim(),
    slug: baseSlug,
    description: body.description ?? null,
    contact_email: body.email ?? null,
    phone: body.phone ?? null,
    image_url: body.imageUrl ?? null,
  };

  let { data, error } = await supabase.from("clients").insert(insert).select(CLIENT_SELECT).single();
  // slug is unique — on a collision (two clients with the same/similar
  // name), retry once with a random suffix rather than 500ing on something
  // the caller has no way to control (they never see/set slug directly).
  if (error?.code === "23505") {
    const retrySlug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    ({ data, error } = await supabase
      .from("clients")
      .insert({ ...insert, slug: retrySlug })
      .select(CLIENT_SELECT)
      .single());
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Failed to create client" }, { status: 500 });
  }

  return NextResponse.json({ client: toClientProfile(data) }, { status: 201 });
}
