import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ApprovalStatus, PipelineModule, Priority, Project } from "@/lib/dashboard/types";
import { toClientProfile } from "@/lib/dashboard/types";

// TODO(auth): replace with the authenticated user's client_id once Supabase
// Auth + tenant membership exists (see docs/rls-policies.md). Only used as
// POST's fallback now — GET (the list) has no single-client default, see
// its own comment below.
const DEV_CLIENT_ID = process.env.DEV_CLIENT_ID;

const CLIENT_SELECT = "id, name, image_url, description, contact_email, phone, created_at, updated_at";

const SORT_COLUMNS = ["name", "created_at", "updated_at", "deadline", "priority"] as const;
type SortKey = (typeof SORT_COLUMNS)[number];

// priority is a free-text column (low/normal/high/urgent, see 0008) — sorted
// by severity rank in application code rather than relying on alphabetical
// DB ordering, which would put "high" before "low" before "normal".
const PRIORITY_RANK: Record<string, number> = { low: 1, normal: 2, high: 3, urgent: 4 };
function priorityRank(value: string | null): number {
  return value ? PRIORITY_RANK[value] ?? 0 : 0;
}

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
//
// clientId semantics: a specific id scopes to that one client (unchanged).
// Omitted or the literal "all" lists across every client — the clients
// pages and the dashboard's "Por cliente" grouping both need this, and
// "all" disambiguates an explicit choice from "caller didn't pass the
// param" (DashboardContent always sends one or the other, never omits it).
// DEV_CLIENT_ID is NOT used as the default here — that's a behavior change:
// previously omitting clientId silently meant DEV_CLIENT_ID. Single-resource
// routes (POST here, GET/PATCH/DELETE on /[id]) still default to it; a list
// endpoint defaulting to "show one hidden tenant's data" never made sense
// once real client management existed.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientIdParam = url.searchParams.get("clientId");
  const allClients = !clientIdParam || clientIdParam === "all";
  const clientId = allClients ? null : clientIdParam;

  const sortParam = url.searchParams.get("sort");
  const sort: SortKey = (SORT_COLUMNS as readonly string[]).includes(sortParam ?? "")
    ? (sortParam as SortKey)
    : "updated_at";
  const ascending = url.searchParams.get("order") === "asc";
  const q = url.searchParams.get("q");
  const tag = url.searchParams.get("tag");

  const supabase = getSupabaseAdmin();

  // Only projects actually in production — catalog rows imported by
  // /api/connectors/youtube/index always have external_video_id set.
  let projectsQuery = supabase
    .from("projects")
    .select(
      "id, title, platform, status, client_id, external_channel_id, priority, deadline, tags, created_at, updated_at"
    )
    .is("external_video_id", null);
  if (clientId) projectsQuery = projectsQuery.eq("client_id", clientId);
  if (q) projectsQuery = projectsQuery.ilike("title", `%${q}%`);
  // supabase-js's .contains() serializes a plain array as a Postgres array
  // literal ({tag}), which is for native array columns — tags is jsonb, so
  // it needs JSON containment syntax ([tag]) instead, passed as a string so
  // .contains() uses it verbatim rather than re-serializing it.
  if (tag) projectsQuery = projectsQuery.contains("tags", JSON.stringify([tag]));
  // priority has no sane DB-column ordering (see PRIORITY_RANK) — sorted in
  // JS below instead, after fetching.
  if (sort !== "priority") {
    projectsQuery = projectsQuery.order(sort === "name" ? "title" : sort, { ascending });
  }

  const { data: projects, error: projectsError } = await projectsQuery;
  if (projectsError) {
    return NextResponse.json({ error: projectsError.message }, { status: 500 });
  }
  if (!projects || projects.length === 0) {
    return NextResponse.json({ projects: [] satisfies Project[] });
  }
  if (sort === "priority") {
    projects.sort((a, b) => {
      const diff = priorityRank(a.priority) - priorityRank(b.priority);
      return ascending ? diff : -diff;
    });
  }

  // Each project carries its own client now (not one shared profile) — the
  // single-client early-return-on-missing-client check this route used to
  // have is gone; a client lookup miss here just means that project's
  // `client` falls back to a minimal placeholder (see clientById.get below),
  // it doesn't blank the whole response.
  const distinctClientIds = [...new Set(projects.map((p) => p.client_id))];
  const { data: clientRows, error: clientsError } = await supabase
    .from("clients")
    .select(CLIENT_SELECT)
    .in("id", distinctClientIds);
  if (clientsError) {
    return NextResponse.json({ error: clientsError.message }, { status: 500 });
  }
  const clientById = new Map((clientRows ?? []).map((c) => [c.id, toClientProfile(c)]));

  const projectIds = projects.map((p) => p.id);

  // project_id already scopes these uniquely — no need to also filter by
  // client_id (which wouldn't even have a single value in all-clients mode).
  const [scriptsRes, seoRes, thumbnailsRes] = await Promise.all([
    supabase
      .from("scripts")
      .select("project_id, version, created_at, status")
      .not("raw_transcript", "is", null)
      .in("project_id", projectIds),
    supabase
      .from("seo")
      .select("project_id, created_at, status")
      .in("project_id", projectIds),
    supabase
      .from("thumbnails")
      .select("project_id, created_at, status")
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
      // Non-null: client_id is `references clients(id) on delete cascade`,
      // so every project row here has a real client, and distinctClientIds
      // (built straight from these same rows) is exactly what clientById
      // was populated from.
      client: clientById.get(project.client_id)!,
      channelUrl: project.external_channel_id,
      priority: (project.priority ?? "normal") as Priority,
      deadline: project.deadline,
      tags: Array.isArray(project.tags) ? (project.tags as string[]) : [],
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      modules,
    };
  });

  return NextResponse.json({ projects: result });
}

const VALID_LANGUAGES = ["pt-BR", "en-US"];
const VALID_PRIORITIES = ["low", "normal", "high", "urgent"];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  // clientId falls back to DEV_CLIENT_ID so callers (e.g. the new-project
  // form, a client component) never need that env var sent to the browser.
  // Callers that DO send clientId (e.g. once the form gets a client picker)
  // get that client persisted instead — this already isn't DEV_CLIENT_ID
  // when the caller passes its own.
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
  if (body?.priority !== undefined && !VALID_PRIORITIES.includes(body.priority)) {
    return NextResponse.json(
      { error: `priority must be one of: ${VALID_PRIORITIES.join(", ")}` },
      { status: 400 }
    );
  }
  if (
    body?.tags !== undefined &&
    (!Array.isArray(body.tags) || !body.tags.every((t: unknown) => typeof t === "string"))
  ) {
    return NextResponse.json({ error: "tags must be an array of strings" }, { status: 400 });
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
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
      ...(body.deadline !== undefined ? { deadline: body.deadline } : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data }, { status: 201 });
}
