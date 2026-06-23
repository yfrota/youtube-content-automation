import OpenAI from "openai";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { searchCatalog } from "@/lib/rag/search";
import { embedText } from "@/lib/rag/embeddings";
import type { ScriptChapter, ScriptForgeInput, ScriptForgeOutput } from "./types";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
// gemini-flash-1.5 was retired from OpenRouter's catalog ("No endpoints
// found"); 2.5 is the current stable Flash tier, verified against this
// account with forced tool_choice during manual testing.
const MODEL = "google/gemini-2.5-flash";
const TOOL_NAME = "emit_script";
// Without an explicit cap, OpenRouter defaults to the model's max output
// (65535 for this model) and the request gets rejected with a 402 if the
// account can't afford that many tokens — verified this fails silently
// otherwise (no warning, just a hard error) during manual testing.
const MAX_OUTPUT_TOKENS = 4096;
const RAG_QUERY_CHAR_LIMIT = 4000;
const CONTEXT_SNIPPET_CHAR_LIMIT = 500;

// OpenRouter mirrors the OpenAI chat-completions API regardless of which
// underlying model it proxies to, so tools use OpenAI's function-calling
// shape, not Anthropic's tool_use shape.
const SCRIPT_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: TOOL_NAME,
    description:
      "Return the finalized YouTube-optimized script, including a hook and chapter markers.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "Full rewritten script body." },
        hook: {
          type: "string",
          description: "Opening hook line(s), the first 5-15 seconds of the video.",
        },
        chapters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              startTime: { type: "string", description: "Timestamp label, e.g. '00:00'." },
            },
            required: ["title", "startTime"],
          },
        },
      },
      required: ["content", "hook", "chapters"],
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

function isValidChapters(value: unknown): value is ScriptChapter[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).title === "string" &&
        typeof (item as Record<string, unknown>).startTime === "string"
    )
  );
}

export async function runScriptForge(input: ScriptForgeInput): Promise<ScriptForgeOutput> {
  const { clientId, projectId, platform, rawTranscript } = input;

  const ragQuery = rawTranscript.slice(0, RAG_QUERY_CHAR_LIMIT);
  const matches = await searchCatalog({ clientId, queryText: ragQuery, platform, matchCount: 5 });

  const contextBlock =
    matches.length > 0
      ? matches
          .map(
            (m, i) =>
              `[${i + 1}] (similarity ${m.similarity.toFixed(3)}) project_id=${m.projectId}\n${m.content.slice(0, CONTEXT_SNIPPET_CHAR_LIMIT)}`
          )
          .join("\n\n")
      : "No related existing videos were found in the catalog.";

  const response = await getOpenRouter().chat.completions.create({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    tools: [SCRIPT_TOOL],
    // "required" rather than forcing this specific function by name: more
    // broadly supported across the different models OpenRouter proxies to,
    // and equivalent here since emit_script is the only tool defined.
    tool_choice: "required",
    messages: [
      {
        role: "user",
        content:
          "You are Script Forge, a YouTube script editor. Rewrite the raw transcript below " +
          "into a YouTube-optimized script with a strong opening hook and chapter markers.\n\n" +
          "RELATED EXISTING VIDEOS FROM THIS CHANNEL'S CATALOG (for cross-referencing — mention " +
          `or link to relevant ones in the script body where natural):\n${contextBlock}\n\n` +
          `RAW TRANSCRIPT:\n${rawTranscript}`,
      },
    ],
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function" || toolCall.function.name !== TOOL_NAME) {
    throw new Error("Script Forge: model did not return the expected tool call");
  }

  let parsed: { content: string; hook: string; chapters: unknown };
  try {
    parsed = JSON.parse(toolCall.function.arguments);
  } catch {
    throw new Error("Script Forge: model returned malformed tool call arguments");
  }

  if (!isValidChapters(parsed.chapters)) {
    throw new Error("Script Forge: model returned malformed chapters");
  }
  const chapters = parsed.chapters;

  const embedding = await embedText(`${parsed.hook}\n\n${parsed.content}`);

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("scripts").insert({
    client_id: clientId,
    project_id: projectId,
    platform,
    raw_transcript: rawTranscript,
    content: parsed.content,
    hook: parsed.hook,
    chapters,
    llm_provider: MODEL,
    status: "draft",
    embedding,
  });
  if (error) throw new Error(`Script Forge: failed to save script: ${error.message}`);

  return {
    content: parsed.content,
    hook: parsed.hook,
    chapters,
    crossReferencedProjectIds: matches.map((m) => m.projectId),
  };
}
