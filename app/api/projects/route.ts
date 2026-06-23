import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ApprovalStatus, PipelineModule, Project } from "@/lib/dashboard/types";

// TODO(auth): replace with the authenticated user's client_id once Supabase
// Auth + tenant membership exists (see docs/rls-policies.md). Until then
// every dashboard request reads this one fixed client.
const DEV_CLIENT_ID = process.env.DEV_CLIENT_ID;

interface ScriptStatusRow {
  project_id: string;
  version: number;
  created_at: string;
  status: ApprovalStatus;
}

interface DatedStatusRow {
  project_id: string;
  created_at: string;
  status: ApprovalStatus;
}

// Scripts can have multiple versions per project (real drafts) — pick the
// highest version, tie-broken by most recent. Catalog-imported rows
// (raw_transcript is null) are excluded by the caller's query, not here.
function latestScriptStatusByProject(rows: ScriptStatusRow[]): Map<string, ApprovalStatus> {
  const best = new Map<string, ScriptStatusRow>();
  for (const row of rows) {
    const current = best.get(row.project_id);
    if (
      !current ||
      row.version > current.version ||
      (row.version === current.version && row.created_at > current.created_at)
    ) {
      best.set(row.project_id, row);
    }
  }
  return new Map([...best].map(([id, row]) => [id, row.status]));
}

// seo/thumbnails have no version column — most recent by created_at wins.
function latestStatusByProject(rows: DatedStatusRow[]): Map<string, ApprovalStatus> {
  const best = new Map<string, DatedStatusRow>();
  for (const row of rows) {
    const current = best.get(row.project_id);
    if (!current || row.created_at > current.created_at) {
      best.set(row.project_id, row);
    }
  }
  return new Map([...best].map(([id, row]) => [id, row.status]));
}

// TODO(auth): protect this route once Supabase Auth + tenant membership
// exists (see docs/rls-policies.md).
export async function GET() {
  if (!DEV_CLIENT_ID) {
    return NextResponse.json({ error: "Missing DEV_CLIENT_ID" }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("name")
    .eq("id", DEV_CLIENT_ID)
    .maybeSingle();
  if (clientError) {
    return NextResponse.json({ error: clientError.message }, { status: 500 });
  }
  if (!client) {
    // No client row for DEV_CLIENT_ID yet — same end state as "no projects".
    return NextResponse.json({ projects: [] satisfies Project[] });
  }

  // Only projects actually in production — catalog rows imported by
  // /api/connectors/youtube/index always have external_video_id set.
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, title, platform, status, updated_at")
    .eq("client_id", DEV_CLIENT_ID)
    .is("external_video_id", null)
    .order("updated_at", { ascending: false });
  if (projectsError) {
    return NextResponse.json({ error: projectsError.message }, { status: 500 });
  }
  if (!projects || projects.length === 0) {
    return NextResponse.json({ projects: [] satisfies Project[] });
  }

  const projectIds = projects.map((p) => p.id);

  const [scriptsRes, seoRes, thumbnailsRes] = await Promise.all([
    supabase
      .from("scripts")
      .select("project_id, version, created_at, status")
      .eq("client_id", DEV_CLIENT_ID)
      .not("raw_transcript", "is", null)
      .in("project_id", projectIds),
    supabase
      .from("seo")
      .select("project_id, created_at, status")
      .eq("client_id", DEV_CLIENT_ID)
      .in("project_id", projectIds),
    supabase
      .from("thumbnails")
      .select("project_id, created_at, status")
      .eq("client_id", DEV_CLIENT_ID)
      .in("project_id", projectIds),
  ]);
  if (scriptsRes.error) {
    return NextResponse.json({ error: scriptsRes.error.message }, { status: 500 });
  }
  if (seoRes.error) {
    return NextResponse.json({ error: seoRes.error.message }, { status: 500 });
  }
  if (thumbnailsRes.error) {
    return NextResponse.json({ error: thumbnailsRes.error.message }, { status: 500 });
  }

  const scriptStatus = latestScriptStatusByProject(scriptsRes.data ?? []);
  const seoStatus = latestStatusByProject(seoRes.data ?? []);
  const thumbnailStatus = latestStatusByProject(thumbnailsRes.data ?? []);

  const result: Project[] = projects.map((project) => {
    const modules: PipelineModule[] = [
      { key: "script", status: scriptStatus.get(project.id) ?? "draft" },
      { key: "seo", status: seoStatus.get(project.id) ?? "draft" },
      { key: "thumbnail", status: thumbnailStatus.get(project.id) ?? "draft" },
      // No dedicated checklist table yet — the project's own status column
      // is the closest real equivalent to the overall publish gate.
      { key: "checklist", status: project.status },
    ];

    return {
      id: project.id,
      title: project.title,
      platform: project.platform,
      channelName: client.name,
      updatedAt: project.updated_at,
      modules,
    };
  });

  return NextResponse.json({ projects: result });
}

const VALID_LANGUAGES = ["pt-BR", "en-US"];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  // clientId falls back to DEV_CLIENT_ID so callers (e.g. the new-project
  // form, a client component) never need that env var sent to the browser.
  const clientId = body?.clientId ?? DEV_CLIENT_ID;
  if (!clientId || !body?.platform || !body?.title) {
    return NextResponse.json(
      { error: "clientId, platform, and title are required" },
      { status: 400 }
    );
  }
  if (body?.language !== undefined && !VALID_LANGUAGES.includes(body.language)) {
    return NextResponse.json(
      { error: `language must be one of: ${VALID_LANGUAGES.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      client_id: clientId,
      platform: body.platform,
      title: body.title,
      external_channel_id: body.externalChannelId ?? null,
      external_video_id: body.externalVideoId ?? null,
      ...(body.language !== undefined ? { language: body.language } : {}),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data }, { status: 201 });
}
