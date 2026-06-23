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

  const selectedTitle = body?.selectedTitle as unknown;
  if (selectedTitle !== undefined && typeof selectedTitle !== "string") {
    return NextResponse.json({ error: "selectedTitle must be a string" }, { status: 400 });
  }

  const update: { status?: ApprovalStatus; selected_title?: string } = {};
  if (status !== undefined) update.status = status;
  if (selectedTitle !== undefined) update.selected_title = selectedTitle;

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "at least one of status or selectedTitle is required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("seo")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ seo: data });
}
