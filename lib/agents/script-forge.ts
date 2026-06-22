import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { searchCatalog } from "@/lib/rag/search";
import { embedText } from "@/lib/rag/embeddings";
import type { ScriptChapter, ScriptForgeInput, ScriptForgeOutput } from "./types";

const MODEL = "claude-sonnet-4-6";
const TOOL_NAME = "emit_script";
const RAG_QUERY_CHAR_LIMIT = 4000;
const CONTEXT_SNIPPET_CHAR_LIMIT = 500;

const SCRIPT_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description:
    "Return the finalized YouTube-optimized script, including a hook and chapter markers.",
  input_schema: {
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
};

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (anthropic) return anthropic;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  anthropic = new Anthropic({ apiKey });
  return anthropic;
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

  const response = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [SCRIPT_TOOL],
    tool_choice: { type: "tool", name: TOOL_NAME },
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

  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === TOOL_NAME
  );
  if (!toolUseBlock) {
    throw new Error("Script Forge: model did not return the expected tool call");
  }

  const parsed = toolUseBlock.input as { content: string; hook: string; chapters: unknown };
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
    llm_provider: "anthropic",
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
