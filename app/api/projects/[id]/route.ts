import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ProjectDetail, ScriptChapter, SeoTitleOption } from "@/lib/dashboard/types";

// TODO(auth): replace with the authenticated user's client_id once Supabase
// Auth + tenant membership exists (see docs/rls-policies.md).
const DEV_CLIENT_ID = process.env.DEV_CLIENT_ID;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!DEV_CLIENT_ID) {
    return NextResponse.json({ error: "Missing DEV_CLIENT_ID" }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, title, platform, language, status, created_at, updated_at")
    .eq("id", id)
    .eq("client_id", DEV_CLIENT_ID)
    .maybeSingle();
  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
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
