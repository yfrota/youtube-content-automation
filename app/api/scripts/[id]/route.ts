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

  const keywordsContext = body?.keywordsContext as unknown;
  if (
    keywordsContext !== undefined &&
    (!Array.isArray(keywordsContext) || !keywordsContext.every((k) => typeof k === "string"))
  ) {
    return NextResponse.json(
      { error: "keywordsContext must be an array of strings" },
      { status: 400 }
    );
  }

  const editedContent = body?.editedContent as unknown;
  if (editedContent !== undefined && typeof editedContent !== "string") {
    return NextResponse.json({ error: "editedContent must be a string" }, { status: 400 });
  }

  // All fields are optional independently — "Salvar keywords" patches only
  // keywords_context (status unchanged); "Aprovar roteiro" patches both
  // status and keywords_context at once; "Desfazer aprovação" patches only
  // status back to draft; the editable script panel's debounced autosave
  // (0013) patches only edited_content.
  const update: { status?: ApprovalStatus; keywords_context?: string[]; edited_content?: string } =
    {};
  if (status !== undefined) update.status = status;
  if (keywordsContext !== undefined) update.keywords_context = keywordsContext as string[];
  if (editedContent !== undefined) update.edited_content = editedContent as string;

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "at least one of status, keywordsContext, or editedContent is required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("scripts")
    .update(update)
    .eq("id", id)
    .select("id, status, keywords_context, edited_content")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ script: data });
}
