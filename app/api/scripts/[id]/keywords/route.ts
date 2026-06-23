import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Language } from "@/lib/agents/types";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const MODEL = "google/gemini-2.5-flash";
const TOOL_NAME = "extract_keywords";
const MAX_OUTPUT_TOKENS = 300;

const PROMPTS: Record<Language, string> = {
  "pt-BR": "Extraia 10 keywords SEO em português do texto abaixo.",
  "en-US": "Extract 10 SEO keywords in English from the text below.",
};

// Same pattern as script-forge.ts/seo-engine.ts: forced tool-use instead of
// a free-text completion. The model would otherwise routinely wrap JSON in
// ```json fences (or add stray text) even when told not to, which is what
// caused intermittent JSON.parse failures here.
const KEYWORDS_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: TOOL_NAME,
    description: "Return the SEO keywords extracted from the text.",
    parameters: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          items: { type: "string" },
          description: "10 SEO keywords extracted from the text.",
        },
      },
      required: ["keywords"],
    },
  },
};

let openrouter: OpenAI | null = null;
function getOpenRouter(): OpenAI {
  if (openrouter) return openrouter;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");
  openrouter = new OpenAI({ baseURL: OPENROUTER_BASE_URL, apiKey });
  return openrouter;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

// TODO(auth): protect this route once Supabase Auth + tenant membership
// exists (see docs/rls-policies.md).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const langParam = new URL(request.url).searchParams.get("lang");
  const lang: Language = langParam === "en-US" ? "en-US" : "pt-BR";

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
      tools: [KEYWORDS_TOOL],
      tool_choice: "required",
      messages: [
        {
          role: "user",
          content: `${PROMPTS[lang]}\n\n${script.content}`,
        },
      ],
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.type !== "function" || toolCall.function.name !== TOOL_NAME) {
      throw new Error("model did not return the expected tool call");
    }

    let parsed: { keywords: unknown };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      throw new Error("model returned malformed tool call arguments");
    }

    if (!isStringArray(parsed.keywords)) {
      throw new Error("model returned malformed keywords");
    }

    return NextResponse.json({ keywords: parsed.keywords });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
