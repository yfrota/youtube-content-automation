import OpenAI from "openai";
import { searchCatalog } from "@/lib/rag/search";
import type { Language, SeoEngineInput, SeoOutput, SeoTitleOption } from "./types";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const MODEL = "google/gemini-2.5-flash";
const TOOL_NAME = "emit_seo";
const RAG_QUERY_CHAR_LIMIT = 4000;
const CONTEXT_SNIPPET_CHAR_LIMIT = 500;

const LANGUAGE_INSTRUCTIONS: Record<Language, string> = {
  "pt-BR": "Gere os metadados em português brasileiro.",
  "en-US": "Generate all metadata in American English.",
};
// Same reasoning as script-forge.ts: omitting this lets OpenRouter default
// to the model's max output (65535 for this one), which 402s if the
// account's credit balance can't cover it. Load-bearing, don't drop it.
const MAX_OUTPUT_TOKENS = 4096;

const SEO_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: TOOL_NAME,
    description: "Return the SEO package for the video: titles, description, tags, hashtags.",
    parameters: {
      type: "object",
      properties: {
        titles: {
          type: "array",
          description: "5 title options ranked by estimated click-through rate.",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              ctrScore: { type: "number", description: "Estimated CTR score, 1-10." },
              reasoning: { type: "string", description: "Why this title should perform well." },
            },
            required: ["text", "ctrScore", "reasoning"],
          },
        },
        description: {
          type: "string",
          description:
            "500-800 character YouTube description, in the language specified in the prompt, starting with the hook.",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "15-20 SEO tags.",
        },
        hashtags: {
          type: "array",
          items: { type: "string" },
          description: "3-5 hashtags.",
        },
      },
      required: ["titles", "description", "tags", "hashtags"],
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

function isValidTitles(value: unknown): value is SeoTitleOption[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).text === "string" &&
        typeof (item as Record<string, unknown>).ctrScore === "number" &&
        typeof (item as Record<string, unknown>).reasoning === "string"
    )
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export async function generateSeo(
  input: SeoEngineInput
): Promise<SeoOutput & { llmProvider: string }> {
  const {
    clientId,
    platform,
    projectTitle,
    scriptContent,
    hook,
    chapters,
    keywordsContext,
    language,
    llmProvider,
  } = input;
  const model = llmProvider ?? MODEL;

  const ragQuery = scriptContent.slice(0, RAG_QUERY_CHAR_LIMIT);
  const matches = await searchCatalog({ clientId, queryText: ragQuery, platform, matchCount: 5 });

  const contextBlock =
    matches.length > 0
      ? matches
          .map(
            (m, i) =>
              `[${i + 1}] "${m.title}" (similarity ${m.similarity.toFixed(3)})\n${m.content.slice(0, CONTEXT_SNIPPET_CHAR_LIMIT)}`
          )
          .join("\n\n")
      : "No related existing videos were found in the catalog.";

  const keywordsBlock =
    keywordsContext.length > 0
      ? `\n\nKEYWORDS PRIORITÁRIAS (usar obrigatoriamente nos títulos e descrição): ${keywordsContext.join(", ")}`
      : "";

  const chaptersBlock = chapters.map((c) => `${c.startTime} ${c.title}`).join("\n");

  const response = await getOpenRouter().chat.completions.create({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    tools: [SEO_TOOL],
    tool_choice: "required",
    messages: [
      {
        role: "user",
        content:
          "You are the SEO Engine, a YouTube SEO specialist. Generate an SEO package " +
          "(titles, description, tags, hashtags) for the video below.\n\n" +
          `${LANGUAGE_INSTRUCTIONS[language]}\n\n` +
          `PROJECT TITLE: ${projectTitle}\n` +
          `HOOK: ${hook}\n` +
          `CHAPTERS:\n${chaptersBlock}\n\n` +
          "RELATED EXISTING VIDEOS FROM THIS CHANNEL'S CATALOG (for context — when mentioning a " +
          "previous video, always use its TITLE, never an internal id or code):\n" +
          `${contextBlock}` +
          keywordsBlock +
          `\n\nSCRIPT:\n${scriptContent}`,
      },
    ],
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function" || toolCall.function.name !== TOOL_NAME) {
    throw new Error("SEO Engine: model did not return the expected tool call");
  }

  let parsed: { titles: unknown; description: string; tags: unknown; hashtags: unknown };
  try {
    parsed = JSON.parse(toolCall.function.arguments);
  } catch {
    throw new Error("SEO Engine: model returned malformed tool call arguments");
  }

  if (!isValidTitles(parsed.titles)) {
    throw new Error("SEO Engine: model returned malformed titles");
  }
  if (!isStringArray(parsed.tags)) {
    throw new Error("SEO Engine: model returned malformed tags");
  }
  if (!isStringArray(parsed.hashtags)) {
    throw new Error("SEO Engine: model returned malformed hashtags");
  }

  return {
    titles: parsed.titles,
    description: parsed.description,
    tags: parsed.tags,
    hashtags: parsed.hashtags,
    llmProvider: model,
  };
}
