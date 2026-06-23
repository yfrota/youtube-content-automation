import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { generateSeo } from "@/lib/agents/seo-engine";

// TODO(auth): replace with the authenticated user's client_id once Supabase
// Auth + tenant membership exists (see docs/rls-policies.md).
const DEV_CLIENT_ID = process.env.DEV_CLIENT_ID;

// Script must have at least cleared internal review before SEO can be
// generated from it — generating SEO off an unreviewed draft would mean
// redoing it the moment the script itself changes.
const ELIGIBLE_SCRIPT_STATUSES = ["kelly_review", "client_review", "approved"];

// TODO(auth): protect this route once Supabase Auth + tenant membership
// exists (see docs/rls-policies.md).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const clientId = body?.clientId ?? DEV_CLIENT_ID;
  if (!clientId || !body?.projectId || !body?.scriptId) {
    return NextResponse.json(
      { error: "clientId, projectId, and scriptId are required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("title, platform")
    .eq("id", body.projectId)
    .maybeSingle();
  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: script, error: scriptError } = await supabase
    .from("scripts")
    .select("content, hook, chapters, status, keywords_context")
    .eq("id", body.scriptId)
    .maybeSingle();
  if (scriptError) {
    return NextResponse.json({ error: scriptError.message }, { status: 500 });
  }
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

  const keywordsContext = Array.isArray(script.keywords_context)
    ? (script.keywords_context as unknown[]).filter((k): k is string => typeof k === "string")
    : [];

  try {
    const result = await generateSeo({
      clientId,
      projectId: body.projectId,
      scriptId: body.scriptId,
      platform: project.platform,
      projectTitle: project.title,
      scriptContent: script.content,
      hook: script.hook ?? "",
      chapters: (script.chapters as { title: string; startTime: string }[] | null) ?? [],
      keywordsContext,
      llmProvider: body.llmProvider,
    });

    const { data: seo, error: upsertError } = await supabase
      .from("seo")
      .upsert(
        {
          client_id: clientId,
          project_id: body.projectId,
          script_id: body.scriptId,
          platform: project.platform,
          titles: result.titles,
          description: result.description,
          tags: result.tags,
          hashtags: result.hashtags,
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

    return NextResponse.json({ seo }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
