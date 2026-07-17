import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ApprovalStatus } from "@/lib/dashboard/types";

const VALID_STATUSES: ApprovalStatus[] = [
  "draft",
  "kelly_review",
  "client_review",
  "approved",
  "published",
];

// TODO(auth): protect this route once Supabase Auth + tenant membership
// exists (see docs/rls-policies.md).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const status = body?.status as ApprovalStatus | undefined;
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const selectedVariation = body?.selectedVariation as unknown;
  if (selectedVariation !== undefined && typeof selectedVariation !== "number") {
    return NextResponse.json({ error: "selectedVariation must be a number" }, { status: 400 });
  }

  // Both independently optional — "Selecionar esta variação" (client-side
  // only, no PATCH) vs. "Aprovar Thumbnail" (patches both status and
  // selectedVariation at once), same split as PATCH /api/scripts/[id].
  const update: { status?: ApprovalStatus; selected_variation?: number } = {};
  if (status !== undefined) update.status = status;
  if (selectedVariation !== undefined) update.selected_variation = selectedVariation as number;

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "at least one of status or selectedVariation is required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("thumbnails")
    .update(update)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Thumbnail not found" }, { status: 404 });
  return NextResponse.json({ thumbnail: data });
}
