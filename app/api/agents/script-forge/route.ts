import { NextResponse } from "next/server";
import { runScriptForge } from "@/lib/agents/script-forge";

// TODO(auth): protect this route once Supabase Auth + tenant membership
// exists (see the RLS comment in 0001_initial_schema.sql).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.clientId || !body?.projectId || !body?.platform || !body?.rawTranscript) {
    return NextResponse.json(
      { error: "clientId, projectId, platform, and rawTranscript are required" },
      { status: 400 }
    );
  }

  try {
    const result = await runScriptForge(body);
    return NextResponse.json({ script: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
