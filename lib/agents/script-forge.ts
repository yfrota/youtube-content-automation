import OpenAI from "openai";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { searchCatalog, type RagMatch } from "@/lib/rag/search";
import { embedText } from "@/lib/rag/embeddings";
import type {
  ContentType,
  Language,
  ReferencedVideo,
  ScriptChapter,
  ScriptForgeInput,
  ScriptForgeOutput,
} from "./types";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
// gemini-flash-1.5 was retired from OpenRouter's catalog ("No endpoints
// found"); 2.5 is the current stable Flash tier, verified against this
// account with forced tool_choice during manual testing.
const MODEL = "google/gemini-2.5-flash";
const TOOL_NAME = "emit_script";
const RAG_QUERY_CHAR_LIMIT = 4000;
const CONTEXT_SNIPPET_CHAR_LIMIT = 500;
// Separate, much smaller budget for identifyReferencedVideoIds' own call
// below — it only ever needs to return a JSON array of ids, never a script.
const VIDEO_ID_EXTRACTION_MAX_TOKENS = 200;
const SCRIPT_EXCERPT_CHAR_LIMIT = 2000;

const LANGUAGE_INSTRUCTIONS: Record<Language, string> = {
  "pt-BR": "Escreva o roteiro em português brasileiro.",
  "en-US": "Write the script in American English.",
};

// OpenRouter mirrors the OpenAI chat-completions API regardless of which
// underlying model it proxies to, so tools use OpenAI's function-calling
// shape, not Anthropic's tool_use shape.
const SCRIPT_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: TOOL_NAME,
    description:
      "Return the finalized script, including a hook and chapter markers, plus the " +
      "podcast/vodcast-only deliverables when applicable.",
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
        // Optional, podcast_vodcast-only (0010) — the prompt itself tells
        // the model when to fill these; not in `required` below since
        // youtube_tutorial/short_form never populate them.
        clip_script: {
          type: "string",
          description:
            "Script de 30 segundos para clip/reel. Preencher apenas para podcast_vodcast.",
        },
        cta_line: {
          type: "string",
          description: "CTA final verbatim, 1 frase. Preencher apenas para podcast_vodcast.",
        },
        pod_description: {
          type: "string",
          description:
            "Descrição completa para podcast/YouTube (150-300 palavras) com sinopse, temas e " +
            "referências científicas se houver. Preencher apenas para podcast_vodcast.",
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

// Unchanged from before 0010 — youtube_tutorial and short_form both use
// this exact prompt, no structural difference between them yet (short_form
// is "futuro" per the new-project form's own option label).
function buildYoutubeTutorialPrompt(
  language: Language,
  contextBlock: string,
  rawTranscript: string
): string {
  // Same anchoring pattern as buildPodcastVodcastPrompt — without an
  // explicit word-count target the model summarizes freely, producing
  // ~218 words for a 2932-word input (observed live with empty RAG).
  const transcriptWordCount = rawTranscript.trim().split(/\s+/).length;
  const minWords = Math.round(transcriptWordCount * 0.8);
  const maxWords = Math.round(transcriptWordCount * 1.2);

  return (
    "You are Script Forge, a YouTube script editor. Rewrite the raw transcript below " +
    "into a YouTube-optimized script with a strong opening hook and chapter markers.\n\n" +
    `${LANGUAGE_INSTRUCTIONS[language]}\n\n` +
    "TAMANHO DO SCRIPT:\n" +
    `O transcript original tem aproximadamente ${transcriptWordCount} palavras.\n` +
    "O script final deve ter entre 80% e 120% dessa contagem\n" +
    `(entre ${minWords} e ${maxWords} palavras).\n` +
    "NÃO resuma nem condense — reescreva completamente mantendo " +
    "todo o conteúdo original.\n\n" +
    "RELATED EXISTING VIDEOS FROM THIS CHANNEL'S CATALOG (for cross-referencing — mention " +
    `or link to relevant ones in the script body where natural):\n${contextBlock}\n\n` +
    "When mentioning a previous video from the channel, always use its TITLE — never an " +
    "internal id or code.\n\n" +
    `RAW TRANSCRIPT:\n${rawTranscript}`
  );
}

// podcast_vodcast (0010) — full-episode verbatim script with a fixed show
// structure, plus three extra deliverables filled via the tool's optional
// properties. Voice is warm/philosophical by design, deliberately not the
// youtube_tutorial prompt's tone.
function buildPodcastVodcastPrompt(
  language: Language,
  contextBlock: string,
  rawTranscript: string
): string {
  // Anchors the model's output length to the input's, instead of leaving
  // length unconstrained — without this the model tends to summarize a
  // full episode down to a few paragraphs despite "NÃO resuma" (no schema
  // change involved, prompt-only fix — verified live: pre-fix outputs ran
  // well under the source transcript; see CLAUDE.md for the live-tested
  // caveat on short inputs vs. the "desenvolva completamente" sections).
  const transcriptWordCount = rawTranscript.trim().split(/\s+/).length;
  const minWords = Math.round(transcriptWordCount * 0.8);
  const maxWords = Math.round(transcriptWordCount * 1.2);
  const developFully =
    "   Desenvolva completamente — não use placeholder ou resumo. Escreva\n" +
    "   cada parágrafo como seria falado em voz alta.\n";

  return (
    // Must come before every other instruction — clip_script/cta_line/
    // pod_description previously had no explicit language mandate of their
    // own, only the main script did (mid-prompt). Verified live with an
    // en-US project that all four fields now come back in English.
    "IDIOMA OBRIGATÓRIO: Escreva TODO o conteúdo em\n" +
    `${language === "en-US" ? "American English" : "português brasileiro"}.\n` +
    "Isso inclui sem exceção: script principal, clip_script,\n" +
    "cta_line e pod_description.\n\n" +
    "Você é um roteirista especialista em podcasts e vodcasts.\n" +
    "Gere o SCRIPT COMPLETO VERBATIM — cada palavra que o apresentador\n" +
    "vai falar. NÃO resuma. NÃO encurte. Escreva o episódio inteiro.\n\n" +
    "TAMANHO DO SCRIPT:\n" +
    `O transcript original tem aproximadamente ${transcriptWordCount} palavras.\n` +
    "O script final deve ter entre 80% e 120% dessa contagem\n" +
    `(entre ${minWords} e ${maxWords} palavras).\n` +
    "NÃO resuma nem condense — desenvolva cada seção completamente.\n" +
    "Se uma seção estiver curta, adicione transições, ênfases e\n" +
    "elementos de engajamento para manter o ritmo natural de um podcast.\n\n" +
    "FIDELIDADE AO CONTEÚDO ORIGINAL — OBRIGATÓRIO:\n" +
    "Preserve TODOS os argumentos, histórias pessoais, exemplos,\n" +
    "pesquisas e pontos do transcript original sem exceção.\n" +
    "Sua função é melhorar a apresentação e o formato — não resumir,\n" +
    "não condensar, não omitir conteúdo substantivo.\n" +
    "Se o apresentador conta uma história pessoal específica,\n" +
    "ela deve aparecer integralmente no script.\n" +
    "Se menciona um autor ou pesquisa, mantenha a referência.\n" +
    "Cada argumento do transcript deve ter seu equivalente no script.\n\n" +
    "ESTRUTURA OBRIGATÓRIA (nesta ordem):\n" +
    "1. TEASER HOOK — 2-3 parágrafos antes do intro formal.\n" +
    "   Impactante, filosófico, começa com uma pergunta ou afirmação forte.\n" +
    developFully +
    "2. INTRO FORMAL — Ex: 'Hello beautiful souls.\n" +
    "   Welcome back to [nome do show].'\n" +
    developFully +
    "3. ROADMAP DO EPISÓDIO — 'Here's where we're going together:\n" +
    "   First... Then... And finally...'\n" +
    developFully +
    "4. DESENVOLVIMENTO em 2-3 partes longas com:\n" +
    "   - Parágrafos de 3-6 frases alternando com frases curtas de impacto\n" +
    "   - Pausas dramáticas com reticências (...)\n" +
    "   - Ênfases em **negrito** para conceitos-chave\n" +
    "   - *Itálico* para ênfase vocal\n" +
    "   - Perguntas diretas ao público ('What if...', 'Have you ever...')\n" +
    "   - Histórias pessoais do apresentador na primeira pessoa\n" +
    "   - Referências a pesquisas/autores quando o transcript mencionar\n" +
    developFully +
    "5. CTA MID-EPISÓDIO — natural, não interrompe o flow,\n" +
    "   pede inscrição/follow de forma calorosa\n" +
    developFully +
    "6. CLOSING QUESTIONS — 'For our ending tradition,\n" +
    "   here are questions to contemplate:' + 2-3 perguntas\n" +
    developFully +
    "7. SIGN-OFF — caloroso, com frase de encerramento característica\n" +
    "   do apresentador (extraia do transcript se houver padrão)\n" +
    developFully +
    "\n" +
    "VOZ: calorosa, filosófica, espiritual.\n" +
    "NÃO corporativa. NÃO de tutorial técnico.\n" +
    "Referências a episódios anteriores: use TÍTULO E NÚMERO do episódio,\n" +
    "nunca IDs internos ou códigos.\n\n" +
    `${LANGUAGE_INSTRUCTIONS[language]}\n\n` +
    "VÍDEOS RELACIONADOS DO CANAL (para cross-reference contextualizado):\n" +
    `${contextBlock}\n\n` +
    "Para cada vídeo acima:\n" +
    "- Avalie se o conteúdo complementa o tema deste episódio\n" +
    "- Se sim, mencione no momento exato do script onde o tema se conecta,\n" +
    "  não apenas no final\n" +
    "- Explique a conexão brevemente e naturalmente:\n" +
    "  ex: 'No episódio [TÍTULO] exploramos [TEMA], e hoje aprofundamos\n" +
    "  isso ao falar sobre [CONEXÃO COM O TEMA ATUAL]'\n" +
    "- Use sempre o título completo, nunca IDs ou códigos internos\n" +
    "- Se nenhum vídeo for relevante, não force referências artificiais\n\n" +
    "ENTREGÁVEIS ADICIONAIS (preencha nos campos extras da tool):\n" +
    "- clip_script: 30 segundos impactantes, pode ser trecho do episódio\n" +
    "- cta_line: 1 frase de CTA final para encerrar\n" +
    "- pod_description: descrição completa com sinopse,\n" +
    "  temas abordados e referências científicas mencionadas\n\n" +
    `RAW TRANSCRIPT:\n${rawTranscript}`
  );
}

function buildPrompt(
  contentType: ContentType,
  language: Language,
  contextBlock: string,
  rawTranscript: string
): string {
  return contentType === "podcast_vodcast"
    ? buildPodcastVodcastPrompt(language, contextBlock, rawTranscript)
    : buildYoutubeTutorialPrompt(language, contextBlock, rawTranscript);
}

// Moved out of emit_script's own tool schema (where referenced_video_ids/
// referenced_video_reasons used to live, 0011) into a separate, much
// cheaper call made *after* the script is already generated. Live-tested
// with a long real transcript (2793 words): the script came back truncated
// mid-sentence at ~553 words, well under its own 80%-120% target — the two
// extra tool properties were competing with the script itself for the same
// max_tokens budget, and the model was spending part of that budget
// describing references before it ever finished the script. This call has
// its own small, separate budget, so it can never eat into the script's.
async function identifyReferencedVideoIds(
  scriptContent: string,
  matches: RagMatch[]
): Promise<string[]> {
  if (matches.length === 0) return [];

  const videoList = matches
    .map((m) => `- "${m.title}" (id: ${m.externalVideoId})`)
    .join("\n");
  const prompt =
    `Given this script:\n${scriptContent.slice(0, SCRIPT_EXCERPT_CHAR_LIMIT)}\n\n` +
    `And these RAG videos:\n${videoList}\n\n` +
    "Which video IDs were referenced or would complement this episode? " +
    "Return ONLY a JSON array of video IDs. No explanation.";

  // Best-effort/non-fatal, same "fail quiet" precedent as the YouTube
  // trending search — a failure here (network error, malformed response)
  // should never take down an otherwise-successful script generation.
  try {
    const response = await getOpenRouter().chat.completions.create({
      model: MODEL,
      max_tokens: VIDEO_ID_EXTRACTION_MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = response.choices[0]?.message?.content ?? "";
    // Plain free-text completion, not forced tool-use — strip a markdown
    // code fence if present before parsing. This is the exact failure mode
    // that made GET /api/scripts/[id]/keywords flaky before it switched to
    // forced tool-use; not worth that switch here since this call is
    // already optional and cheap, a defensive strip + empty-array fallback
    // covers it.
    const cleaned = raw.replace(/```json\s*|```\s*/g, "").trim();
    const ids = JSON.parse(cleaned);
    return Array.isArray(ids) && ids.every((id) => typeof id === "string") ? ids : [];
  } catch {
    return [];
  }
}

export async function runScriptForge(input: ScriptForgeInput): Promise<ScriptForgeOutput> {
  const { clientId, projectId, platform, rawTranscript, language, contentType } = input;

  const ragQuery = rawTranscript.slice(0, RAG_QUERY_CHAR_LIMIT);
  const matches = await searchCatalog({ clientId, queryText: ragQuery, platform, matchCount: 5 });

  const contextBlock =
    matches.length > 0
      ? matches
          .map(
            (m, i) =>
              // externalVideoId must be printed here — referenced_video_ids
              // asks the model to copy "the exact id from the RAG context,"
              // but before this the context block never actually contained
              // one, only the bracketed list index. Verified live: the
              // model was echoing that index ("1", "2") back as if it were
              // the id, since it was the only id-shaped thing visible to it.
              `[${i + 1}] "${m.title}" (id: ${m.externalVideoId}, similarity ${m.similarity.toFixed(3)})\n${m.content.slice(0, CONTEXT_SNIPPET_CHAR_LIMIT)}`
          )
          .join("\n\n")
      : "No related existing videos were found in the catalog.";

  // Dynamic instead of a fixed constant — a fixed cap either wastes budget
  // on short transcripts or starves long ones (live-tested truncation on a
  // 2793-word transcript is what this replaces, see CLAUDE.md). ~1.3
  // tokens/word in English, times the prompt's own 120% size ceiling,
  // times a further 20% buffer for structure/emphasis/the extra
  // deliverables — BUT this multiplier alone (×1.872) badly under-budgets
  // in practice: live-tested at 5228 tokens for the 2793-word transcript
  // (the formula's own output for that input) and it truncated at 79
  // words, the exact failure this was supposed to fix. The model evidently
  // burns real budget on something not reflected in transcript word count
  // (plausibly hidden reasoning tokens, scaling with prompt complexity, not
  // linearly with word count) — a fixed 20000 had already been verified
  // live to fully complete this same transcript, so the floor is raised
  // to 10000 (not 4000) to get closer to that proven-safe number for any
  // transcript under ~5341 words, where the multiplier alone would still
  // land below the floor. Ceiling stays 30000 (~10000 output words — the
  // product's own upper bound, not an OpenRouter/account limit).
  const transcriptWordCount = rawTranscript.trim().split(/\s+/).length;
  const dynamicMaxTokens = Math.min(
    Math.max(Math.round(transcriptWordCount * 1.3 * 1.2 * 1.2), 10000),
    30000
  );

  const response = await getOpenRouter().chat.completions.create({
    model: MODEL,
    max_tokens: dynamicMaxTokens,
    // Live-tested: finish_reason was "tool_calls" (a clean, voluntary stop)
    // on every run regardless of max_tokens, with completion_tokens used
    // nowhere near the budget (e.g. 1047-1642 of a 10000 allowance) — the
    // model itself decides how much to write, with real run-to-run
    // variance on the *same* input/prompt (45 to 1642 completion tokens
    // observed across 3 identical calls). Default temperature (unset,
    // ~1.0) is the standard lever for that kind of sampling variance;
    // lowered to reduce how often the model undershoots the prompt's own
    // 80%-120% length target, while staying above 0 so the "calorosa,
    // filosófica" voice doesn't flatten out.
    temperature: 0.4,
    tools: [SCRIPT_TOOL],
    // "required" rather than forcing this specific function by name: more
    // broadly supported across the different models OpenRouter proxies to,
    // and equivalent here since emit_script is the only tool defined.
    tool_choice: "required",
    messages: [
      {
        role: "user",
        content: buildPrompt(contentType, language, contextBlock, rawTranscript),
      },
    ],
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function" || toolCall.function.name !== TOOL_NAME) {
    throw new Error("Script Forge: model did not return the expected tool call");
  }

  let parsed: {
    content: string;
    hook: string;
    chapters: unknown;
    clip_script?: string;
    cta_line?: string;
    pod_description?: string;
  };
  try {
    parsed = JSON.parse(toolCall.function.arguments);
  } catch {
    throw new Error("Script Forge: model returned malformed tool call arguments");
  }

  if (!isValidChapters(parsed.chapters)) {
    throw new Error("Script Forge: model returned malformed chapters");
  }
  const chapters = parsed.chapters;
  const clipScript = parsed.clip_script ?? null;
  const ctaLine = parsed.cta_line ?? null;
  const podDescription = parsed.pod_description ?? null;

  // Separate, lightweight call now that the script itself is done — see
  // identifyReferencedVideoIds' own comment for why this isn't two extra
  // emit_script tool properties anymore. Never trust an id verbatim, only
  // ids that genuinely came from this run's own context block resolve to
  // a real video.
  const referencedVideoIds = await identifyReferencedVideoIds(parsed.content, matches);
  const referencedVideos: ReferencedVideo[] = referencedVideoIds
    .map((id) => matches.find((m) => m.externalVideoId === id))
    .filter((m): m is (typeof matches)[number] => Boolean(m))
    .map((m) => ({
      videoId: m.externalVideoId,
      title: m.title,
      // Always empty now — identifyReferencedVideoIds only ever asks for
      // ids, not reasons, to keep that call's own output (and cost)
      // minimal. ScriptStage's reason line just doesn't render for "".
      reason: "",
      youtubeUrl: `https://youtube.com/watch?v=${m.externalVideoId}`,
    }));

  // TODO: remove after live-testing confirms content length
  const contentWords = parsed.content.trim().split(/\s+/).length;
  const hookWords = parsed.hook.trim().split(/\s+/).length;
  console.log(
    `[ScriptForge] finish_reason=${response.choices[0]?.finish_reason} ` +
      `usage=${JSON.stringify(response.usage)} ` +
      `transcript=${transcriptWordCount}w max_tokens=${dynamicMaxTokens} ` +
      `content=${contentWords}w (${parsed.content.length}ch) ` +
      `hook=${hookWords}w (${parsed.hook.length}ch)`
  );

  const embedding = await embedText(`${parsed.hook}\n\n${parsed.content}`);

  const supabase = getSupabaseAdmin();
  const { data: inserted, error } = await supabase
    .from("scripts")
    .insert({
      client_id: clientId,
      project_id: projectId,
      platform,
      raw_transcript: rawTranscript,
      content: parsed.content,
      hook: parsed.hook,
      chapters,
      content_type: contentType,
      clip_script: clipScript,
      cta_line: ctaLine,
      pod_description: podDescription,
      // Plain array, not JSON.stringify()'d — referenced_videos is jsonb,
      // and supabase-js/PostgREST serializes JS values for jsonb columns
      // itself (same pattern chapters/keywords_context already use).
      // Stringifying here would double-encode it as a JSON string sitting
      // inside the jsonb column instead of a proper JSON array.
      referenced_videos: referencedVideos,
      llm_provider: MODEL,
      status: "draft",
      embedding,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Script Forge: failed to save script: ${error.message}`);

  return {
    id: inserted.id,
    status: "draft",
    content: parsed.content,
    hook: parsed.hook,
    chapters,
    contentType,
    clipScript,
    ctaLine,
    podDescription,
    crossReferencedProjectIds: matches.map((m) => m.projectId),
    referencedVideos,
  };
}
