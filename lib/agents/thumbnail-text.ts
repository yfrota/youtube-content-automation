import OpenAI from "openai";
import { DEFAULT_LLM } from "@/lib/llm/providers";
import type { ThumbnailTextInput, ThumbnailTextOutput, ThumbnailVariation } from "./types";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const TOOL_NAME = "emit_thumbnail_text";
// Three short variations (headline/subtitle/support_text/visual_style each)
// — same "never omit max_tokens" precedent as script-forge.ts/seo-engine.ts,
// generous enough that a detailed visual_style description per variation
// never gets starved.
const MAX_OUTPUT_TOKENS = 2048;

const THUMBNAIL_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: TOOL_NAME,
    description: "Return 3 distinct thumbnail text + visual-concept variations for the video.",
    parameters: {
      type: "object",
      properties: {
        variations: {
          type: "array",
          description:
            "Exactly 3 variations, each a distinct angle: transformation/result, pain/problem, " +
            "curiosity/mystery — in that order.",
          items: {
            type: "object",
            properties: {
              headline: {
                type: "string",
                description: "Max 6 words. High visual impact — this is the biggest text on the thumbnail.",
              },
              subtitle: {
                type: "string",
                description: "Max 8 words. Complements the headline, doesn't repeat it.",
              },
              support_text: {
                type: "string",
                description: "Max 4 words. Optional smaller supporting text.",
              },
              visual_style: {
                type: "string",
                description:
                  "Specific mood/colors/elements/photographic style a designer or generative-image " +
                  "model would need to actually produce the image — never generic.",
              },
            },
            required: ["headline", "subtitle", "visual_style"],
          },
        },
      },
      required: ["variations"],
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

function isValidVariations(value: unknown): value is Array<{
  headline: string;
  subtitle: string;
  support_text?: string;
  visual_style: string;
}> {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (typeof item !== "object" || item === null) return false;
      const r = item as Record<string, unknown>;
      return (
        typeof r.headline === "string" &&
        typeof r.subtitle === "string" &&
        typeof r.visual_style === "string" &&
        (r.support_text === undefined || typeof r.support_text === "string")
      );
    })
  );
}

// Audience-profile calibration block (0014, lib/agents/icp-context.ts) —
// same source as script-forge.ts/seo-engine.ts's own versions, closing
// instruction tuned for visual/text concept work.
function buildIcpBlock(icpContext: string | undefined): string {
  if (!icpContext) return "";
  return `\n\n${icpContext}\n\nCalibre para o público descrito acima.\n`;
}

export async function generateThumbnailText(
  input: ThumbnailTextInput
): Promise<ThumbnailTextOutput> {
  const { projectTitle, scriptContent, hook, icpContext, llmProvider } = input;
  const model = llmProvider ?? DEFAULT_LLM;

  const prompt =
    "Gere 3 variações de texto para thumbnail YouTube.\n" +
    "Cada variação deve ser distinta em abordagem:\n" +
    "- Variação 1: foco na transformação/resultado\n" +
    "- Variação 2: foco na dor/problema\n" +
    "- Variação 3: curiosidade/mistério\n\n" +
    "O visual_style deve descrever especificamente o que um designer ou IA generativa " +
    "precisaria saber para criar a imagem — não seja genérico.\n" +
    buildIcpBlock(icpContext) +
    `\nTÍTULO DO PROJETO: ${projectTitle}\n` +
    `HOOK: ${hook}\n\n` +
    `SCRIPT:\n${scriptContent}`;

  const response = await getOpenRouter().chat.completions.create({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    tools: [THUMBNAIL_TOOL],
    tool_choice: "required",
    messages: [{ role: "user", content: prompt }],
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function" || toolCall.function.name !== TOOL_NAME) {
    throw new Error("Thumbnail Text: model did not return the expected tool call");
  }

  let parsed: { variations: unknown };
  try {
    parsed = JSON.parse(toolCall.function.arguments);
  } catch {
    throw new Error("Thumbnail Text: model returned malformed tool call arguments");
  }

  if (!isValidVariations(parsed.variations)) {
    throw new Error("Thumbnail Text: model returned malformed variations");
  }

  const variations: ThumbnailVariation[] = parsed.variations.map((v) => ({
    headline: v.headline,
    subtitle: v.subtitle,
    supportText: v.support_text ?? "",
    visualStyle: v.visual_style,
  }));

  return { variations, llmProvider: model };
}
