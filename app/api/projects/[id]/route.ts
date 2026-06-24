import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Priority, ProjectDetail, ScriptChapter, SeoTitleOption } from "@/lib/dashboard/types";
import { toClientProfile } from "@/lib/dashboard/types";

const CLIENT_SELECT = "id, name, image_url, description, contact_email, phone, created_at, updated_at";

// TODO(auth): protect this route once Supabase Auth + tenant membership
// exists (see docs/rls-policies.md).
//
// No client_id scoping here (GET/PATCH/DELETE all dropped their old `.eq
// ("client_id", DEV_CLIENT_ID)` filter) — id is already a unique, sufficient
// key for a single-resource lookup, and that filter actively broke any
// project belonging to a client other than DEV_CLIENT_ID once the clients
// pages made that a real, reachable case (e.g. /clients/[id] linking into
// one of that client's own projects 404'd with "Project not found" until
// this was fixed — caught live while verifying the clients feature).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select(
      "id, title, platform, language, status, client_id, external_channel_id, priority, deadline, tags, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: clientRow, error: clientError } = await supabase
    .from("clients")
    .select(CLIENT_SELECT)
    .eq("id", project.client_id)
    .maybeSingle();
  if (clientError) {
    return NextResponse.json({ error: clientError.message }, { status: 500 });
  }
  if (!clientRow) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Real Script Forge drafts only — catalog-imported rows (raw_transcript
  // is null) are a different concept, see lib/rag/indexer.ts.
  const { data: scripts, error: scriptsError } = await supabase
    .from("scripts")
    .select("id, raw_transcript, content, hook, chapters, keywords_context, status, version, created_at")
    .eq("project_id", id)
    .not("raw_transcript", "is", null)
    .order("version", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  if (scriptsError) {
    return NextResponse.json({ error: scriptsError.message }, { status: 500 });
  }

  const { data: seoRows, error: seoError } = await supabase
    .from("seo")
    .select(
      "id, titles, description, tags, hashtags, selected_title, llm_provider, status, created_at"
    )
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (seoError) {
    return NextResponse.json({ error: seoError.message }, { status: 500 });
  }

  const { data: thumbnailRows, error: thumbnailError } = await supabase
    .from("thumbnails")
    .select("status, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (thumbnailError) {
    return NextResponse.json({ error: thumbnailError.message }, { status: 500 });
  }

  const latestScript = scripts?.[0] ?? null;
  const latestSeo = seoRows?.[0] ?? null;

  const result: ProjectDetail = {
    id: project.id,
    title: project.title,
    platform: project.platform,
    language: project.language,
    status: project.status,
    client: toClientProfile(clientRow),
    channelUrl: project.external_channel_id,
    priority: (project.priority ?? "normal") as Priority,
    deadline: project.deadline,
    tags: Array.isArray(project.tags) ? (project.tags as string[]) : [],
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    script: latestScript
      ? {
          id: latestScript.id,
          rawTranscript: latestScript.raw_transcript,
          content: latestScript.content,
          hook: latestScript.hook,
          chapters: (latestScript.chapters as unknown as ScriptChapter[] | null) ?? [],
          keywordsContext:
            (latestScript.keywords_context as unknown as string[] | null) ?? null,
          status: latestScript.status,
          createdAt: latestScript.created_at,
        }
      : null,
    seo: latestSeo
      ? {
          id: latestSeo.id,
          status: latestSeo.status,
          titles: (latestSeo.titles as unknown as SeoTitleOption[] | null) ?? [],
          description: latestSeo.description,
          tags: (latestSeo.tags as unknown as string[] | null) ?? [],
          hashtags: (latestSeo.hashtags as unknown as string[] | null) ?? [],
          selectedTitle: latestSeo.selected_title,
          llmProvider: latestSeo.llm_provider,
          createdAt: latestSeo.created_at,
        }
      : null,
    seoStatus: latestSeo?.status ?? null,
    thumbnailStatus: thumbnailRows?.[0]?.status ?? null,
  };

  return NextResponse.json({ project: result });
}

const VALID_PRIORITIES = ["low", "normal", "high", "urgent"];

// Card editing (title/priority/deadline/tags) — no client_id scoping, same
// reasoning as GET above.
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
  // type, it needs something structurally assignable to Partial<ProjectsRow>.
  const update: {
    title?: string;
    priority?: string;
    deadline?: string | null;
    tags?: string[];
  } = {};
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ error: "title must be a non-empty string" }, { status: 400 });
    }
    update.title = body.title.trim();
  }
  if (body.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(body.priority)) {
      return NextResponse.json(
        { error: `priority must be one of: ${VALID_PRIORITIES.join(", ")}` },
        { status: 400 }
      );
    }
    update.priority = body.priority;
  }
  if (body.deadline !== undefined) update.deadline = body.deadline;
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || !body.tags.every((t: unknown) => typeof t === "string")) {
      return NextResponse.json({ error: "tags must be an array of strings" }, { status: 400 });
    }
    update.tags = body.tags;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("projects")
    .update(update)
    .eq("id", id)
    .select("id, title, priority, deadline, tags, updated_at")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ project: data });
}

// TODO(auth): protect this route once Supabase Auth + tenant membership
// exists (see docs/rls-policies.md).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  // projects -> scripts/seo/thumbnails/approval_events is `on delete
  // cascade` (0001) — deleting a project is meant to take its own pipeline
  // history with it, unlike client deletion (which is blocked instead).
  const { data, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
