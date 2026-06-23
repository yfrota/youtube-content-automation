import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const MODEL = "google/gemini-2.5-flash";
const MAX_OUTPUT_TOKENS = 300;

const PROMPTS: Record<"pt-BR" | "en-US", string> = {
  "pt-BR":
    "Extraia 10 keywords SEO em português do texto abaixo. " +
    "Retorne APENAS um JSON array de strings, sem explicação, sem markdown.",
  "en-US":
    "Extract 10 SEO keywords in English from the text below. " +
    "Return ONLY a JSON array of strings, no explanation, no markdown.",
};

let openrouter: OpenAI | null = null;
function getOpenRouter(): OpenAI {
  if (openrouter) return openrouter;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");
  openrouter = new OpenAI({ baseURL: OPENROUTER_BASE_URL, apiKey });
  return openrouter;
}

// Plain completion, not forced tool-use — this is a one-off extraction, not
// worth a tool schema. Models routinely wrap JSON in ```json fences even
// when told not to, so strip those before parsing rather than trust the
// instruction alone.
function parseKeywords(raw: string): string[] {
  const stripped = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const parsed = JSON.parse(stripped);
  if (!Array.isArray(parsed) || !parsed.every((k) => typeof k === "string")) {
    throw new Error("model did not return a JSON array of strings");
  }
  return parsed;
}

// TODO(auth): protect this route once Supabase Auth + tenant membership
// exists (see docs/rls-policies.md).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const langParam = new URL(request.url).searchParams.get("lang");
  const lang = langParam === "en-US" ? "en-US" : "pt-BR";

  const supabase = getSupabaseAdmin();

  const { data: script, error: scriptError } = await supabase
    .from("scripts")
    .select("content")
    .eq("id", id)
    .maybeSingle();
  if (scriptError) {
    return NextResponse.json({ error: scriptError.message }, { status: 500 });
  }
  if (!script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  try {
    const response = await getOpenRouter().chat.completions.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        {
          role: "user",
          content: `${PROMPTS[lang]}\n\n${script.content}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) throw new Error("model returned no content");

    const keywords = parseKeywords(raw);
    return NextResponse.json({ keywords });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
