"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/dashboard/toast";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { ChevronDownIcon, ExternalLinkIcon, SparklesIcon } from "@/components/icons";
import { useT } from "@/lib/i18n/context";
import type { Language, Platform, ScriptDetail } from "@/lib/dashboard/types";

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M12 3a9 9 0 0 1 9 9h-3a6 6 0 0 0-6-6V3Z"
      />
    </svg>
  );
}

function KeywordChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200 ${
        selected
          ? "bg-accent text-white"
          : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
      }`}
    >
      {label}
    </button>
  );
}

// Used for the word counts in the split-view panel headers (0010) — a
// simple whitespace split is plenty for a rough "how long is this" signal,
// no need for real tokenization here.
function wordCount(text: string | null | undefined): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// The three podcast_vodcast-only deliverables (clip_script/cta_line/
// pod_description, 0010) share this exact collapsed-by-default shell —
// same visual pattern the old "Ver transcript original ↕" toggle used.
function CollapsibleDeliverable({ title, content }: { title: string; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400"
      >
        {title}
        <ChevronDownIcon
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="animate-fade-in border-t border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-800/20">
          <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">{content}</p>
        </div>
      )}
    </div>
  );
}

const TRENDING_DEBOUNCE_MS = 500;
const SAVE_KEYWORDS_SUCCESS_MS = 2000;

type SaveState = "idle" | "saving" | "saved" | "error";

interface ScriptStageProps {
  projectId: string;
  platform: Platform;
  language: Language;
  script: ScriptDetail | null;
  onScriptChange: (script: ScriptDetail) => void;
  onGeneratingChange?: (generating: boolean) => void;
  /** Notifies the parent page when the Estado 2 split view is on screen, so
   * it can widen its own max-width container — negative margin alone only
   * reclaims this stage's own padding, it can't escape an ancestor's
   * max-width. */
  onSplitViewActive?: (active: boolean) => void;
}

export function ScriptStage({
  projectId,
  platform,
  language,
  script,
  onScriptChange,
  onGeneratingChange,
  onSplitViewActive,
}: ScriptStageProps) {
  const { showToast } = useToast();
  const t = useT();

  // Estado 1 — generation
  const [transcript, setTranscript] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Estado 2 — regenerate (split-view right panel header)
  const [regenerating, setRegenerating] = useState(false);

  // Estado 2/3 — approve / unapprove
  const [approving, setApproving] = useState(false);
  const [unapproving, setUnapproving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Estado 2 — which panel mobile shows (< 768px only; desktop always
  // shows both side by side, this state is irrelevant there).
  const [mobileTab, setMobileTab] = useState<"transcript" | "script">("script");

  // Seção C1 — keywords extracted from the script
  const [extractedKeywords, setExtractedKeywords] = useState<string[]>([]);
  const [extractingKeywords, setExtractingKeywords] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  // Seção C2 — YouTube trending search
  const [trendingQuery, setTrendingQuery] = useState("");
  const [trendingSuggestions, setTrendingSuggestions] = useState<string[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const trendingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seção C3 — manual keyword
  const [manualKeyword, setManualKeyword] = useState("");

  // Selected set, shared across C1/C2/C3 — lazily seeded from whatever
  // script is current on first mount.
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(
    () => new Set(script?.keywordsContext ?? [])
  );
  // idle -> saving -> saved (auto-reverts after SAVE_KEYWORDS_SUCCESS_MS) or
  // error (stays until the user interacts with the keywords panel again —
  // toggleKeyword/handleAddManualKeyword below reset it back to idle).
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const scriptId = script?.id;

  // Re-seed selection whenever a different script row becomes current
  // (fresh generation, or switching projects) — not on every keystroke.
  // Adjusted during render (React's documented pattern for "reset state
  // when a prop changes"), not inside an effect, so it doesn't cause an
  // extra commit-then-cascade render.
  const [seededForScriptId, setSeededForScriptId] = useState(scriptId);
  if (scriptId !== seededForScriptId) {
    setSeededForScriptId(scriptId);
    setSelectedKeywords(new Set(script?.keywordsContext ?? []));
  }

  useEffect(() => {
    onSplitViewActive?.(script?.status === "draft");
    // onSplitViewActive intentionally omitted — it's an inline callback from
    // the parent, including it would re-run this effect (and notify the
    // parent redundantly) on every unrelated parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script?.status]);

  // Auto-load extracted keywords the moment a draft script is on screen.
  useEffect(() => {
    if (!scriptId || script?.status !== "draft") return;
    let cancelled = false;

    async function load() {
      setExtractingKeywords(true);
      setExtractError(null);
      try {
        const res = await fetch(
          `/api/scripts/${scriptId}/keywords?lang=${encodeURIComponent(language)}`
        );
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? "Falha ao extrair keywords");
        if (!cancelled) setExtractedKeywords(body.keywords ?? []);
      } catch (err) {
        if (!cancelled) {
          setExtractError(err instanceof Error ? err.message : "Falha ao extrair keywords");
        }
      } finally {
        if (!cancelled) setExtractingKeywords(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // script?.status intentionally omitted — only re-run when the script
    // row itself changes, not when its status flips to kelly_review (the
    // extracted candidates don't need to disappear once approved).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptId]);

  // Debounced YouTube trending search. Stale suggestions are masked at
  // render time (visibleTrendingSuggestions below) when the query is
  // cleared, rather than cleared here — avoids a setState call that does
  // nothing but trigger an extra render on every keystroke-to-empty.
  useEffect(() => {
    if (!trendingQuery.trim()) return;
    if (trendingDebounceRef.current) clearTimeout(trendingDebounceRef.current);
    trendingDebounceRef.current = setTimeout(async () => {
      setTrendingLoading(true);
      try {
        const res = await fetch(
          `/api/youtube/trending?q=${encodeURIComponent(trendingQuery)}&lang=${encodeURIComponent(language)}`
        );
        const body = await res.json();
        if (res.ok) setTrendingSuggestions(body.suggestions ?? []);
      } catch {
        // Non-fatal — trending search is a nice-to-have, fail quiet.
      } finally {
        setTrendingLoading(false);
      }
    }, TRENDING_DEBOUNCE_MS);
    return () => {
      if (trendingDebounceRef.current) clearTimeout(trendingDebounceRef.current);
    };
  }, [trendingQuery, language]);

  const visibleTrendingSuggestions = trendingQuery.trim() ? trendingSuggestions : [];

  function toggleKeyword(keyword: string) {
    if (saveState === "error") setSaveState("idle");
    setSelectedKeywords((prev) => {
      const next = new Set(prev);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });
  }

  function handleAddManualKeyword() {
    const keyword = manualKeyword.trim();
    if (!keyword) return;
    if (saveState === "error") setSaveState("idle");
    setSelectedKeywords((prev) => new Set(prev).add(keyword));
    setManualKeyword("");
  }

  async function handleGenerate() {
    if (!transcript.trim() || generating) return;
    setGenerating(true);
    onGeneratingChange?.(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/agents/script-forge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, platform, rawTranscript: transcript }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Falha ao gerar roteiro");

      const result = body.script as {
        id: string;
        status: ScriptDetail["status"];
        content: string;
        hook: string;
        chapters: ScriptDetail["chapters"];
        contentType: ScriptDetail["contentType"];
        clipScript: string | null;
        ctaLine: string | null;
        podDescription: string | null;
        referencedVideos: ScriptDetail["referencedVideos"];
      };
      onScriptChange({
        id: result.id,
        rawTranscript: transcript,
        status: result.status,
        content: result.content,
        hook: result.hook,
        chapters: result.chapters,
        contentType: result.contentType,
        clipScript: result.clipScript,
        ctaLine: result.ctaLine,
        podDescription: result.podDescription,
        referencedVideos: result.referencedVideos,
        keywordsContext: null,
        createdAt: new Date().toISOString(),
      });
      showToast("Roteiro gerado com sucesso");
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Falha ao gerar roteiro");
    } finally {
      setGenerating(false);
      onGeneratingChange?.(false);
    }
  }

  // "Regenerar" in the split-view's right panel — re-runs Script Forge off
  // the already-persisted rawTranscript (read-only in this state, there's
  // no editable transcript input once a script exists), same "just call
  // the generate endpoint again" pattern SeoStage's own Regenerar uses.
  async function handleRegenerate() {
    if (!script || regenerating) return;
    setRegenerating(true);
    onGeneratingChange?.(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/agents/script-forge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          platform,
          rawTranscript: script.rawTranscript ?? "",
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Falha ao regenerar roteiro");

      const result = body.script as {
        id: string;
        status: ScriptDetail["status"];
        content: string;
        hook: string;
        chapters: ScriptDetail["chapters"];
        contentType: ScriptDetail["contentType"];
        clipScript: string | null;
        ctaLine: string | null;
        podDescription: string | null;
        referencedVideos: ScriptDetail["referencedVideos"];
      };
      onScriptChange({
        id: result.id,
        rawTranscript: script.rawTranscript,
        status: result.status,
        content: result.content,
        hook: result.hook,
        chapters: result.chapters,
        contentType: result.contentType,
        clipScript: result.clipScript,
        ctaLine: result.ctaLine,
        podDescription: result.podDescription,
        referencedVideos: result.referencedVideos,
        keywordsContext: null,
        createdAt: new Date().toISOString(),
      });
      showToast("Roteiro regenerado");
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Falha ao regenerar roteiro");
    } finally {
      setRegenerating(false);
      onGeneratingChange?.(false);
    }
  }

  async function handleSaveKeywords() {
    if (!script || saveState === "saving") return;
    setSaveState("saving");
    setActionError(null);
    try {
      const res = await fetch(`/api/scripts/${script.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywordsContext: [...selectedKeywords] }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Falha ao salvar keywords");
      onScriptChange({ ...script, keywordsContext: [...selectedKeywords] });
      showToast("Keywords salvas");
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), SAVE_KEYWORDS_SUCCESS_MS);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Falha ao salvar keywords");
      setSaveState("error");
    }
  }

  async function handleApprove() {
    if (!script || approving) return;
    setApproving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/scripts/${script.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "kelly_review",
          keywordsContext: [...selectedKeywords],
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Falha ao aprovar roteiro");
      onScriptChange({
        ...script,
        status: "kelly_review",
        keywordsContext: [...selectedKeywords],
      });
      showToast("Roteiro aprovado e enviado para revisão");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Falha ao aprovar roteiro");
    } finally {
      setApproving(false);
    }
  }

  async function handleUnapprove() {
    if (!script || unapproving) return;
    setUnapproving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/scripts/${script.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Falha ao desfazer aprovação");
      onScriptChange({ ...script, status: "draft" });
      showToast("Aprovação desfeita", "info");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Falha ao desfazer aprovação");
    } finally {
      setUnapproving(false);
    }
  }

  // ESTADO 1 — no script generated yet.
  if (!script) {
    return (
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Transcript bruto
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            Cole o conteúdo bruto — o Script Forge vai reescrever para o formato YouTube com
            hook, capítulos e linguagem otimizada.
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            Suporte a textos longos — episódios completos de podcast, múltiplos segmentos,
            rascunhos extensos.
          </span>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Cole aqui a transcrição bruta do vídeo..."
            className="min-h-[300px] resize-y rounded-lg border border-gray-200 bg-background p-3 text-sm text-foreground outline-none transition-colors duration-200 placeholder:text-gray-400 focus:border-accent dark:border-gray-700"
          />
        </label>

        {generateError && (
          <p className="text-sm text-red-600 dark:text-red-400">{generateError}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || !transcript.trim()}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-all duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? <Spinner /> : <SparklesIcon className="h-4 w-4" />}
            {t("scriptStage.generateScript")}
          </button>
          {generating && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t("status.generating")}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ESTADO 3 — approved (kelly_review or beyond). Unchanged — compact
  // summary, no split view.
  if (script.status !== "draft") {
    const keywordCount = script.keywordsContext?.length ?? 0;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <StatusBadge status={script.status} />
        </div>

        <div className="rounded-lg bg-accent/5 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-accent">Hook</p>
          <p className="mt-1 line-clamp-2 text-sm text-foreground">{script.hook}</p>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400">
          {script.chapters.length} capítulo{script.chapters.length === 1 ? "" : "s"} ·{" "}
          {keywordCount} keyword{keywordCount === 1 ? "" : "s"} selecionada
          {keywordCount === 1 ? "" : "s"}
        </p>

        {actionError && <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}

        <div>
          <button
            type="button"
            onClick={handleUnapprove}
            disabled={unapproving}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-600 transition-colors duration-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50"
          >
            {unapproving && <Spinner />}← {t("scriptStage.undoApproval")}
          </button>
        </div>
      </div>
    );
  }

  // ESTADO 2 — generated, awaiting review (status: draft). Split view:
  // transcript (read-only, left/first tab) + Script Forge output
  // (right/second tab). Built once as JSX consts so the exact same panels
  // back both the desktop side-by-side grid and the mobile single-tab slot.
  const transcriptWords = wordCount(script.rawTranscript);
  const scriptWords = wordCount(script.content);

  const transcriptPanel = (
    <div className="flex min-h-[400px] flex-col rounded-lg border border-gray-200 dark:border-gray-800 md:min-h-[500px] md:max-h-[70vh]">
      <div className="shrink-0 border-b border-gray-200 px-3 py-2 dark:border-gray-800">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {t("scriptStage.originalTranscript")}
        </p>
        <p className="text-[11px] text-gray-400 dark:text-gray-500">
          {transcriptWords} {t("scriptStage.wordCount")}
          {transcriptWords === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto bg-gray-50 p-3 dark:bg-gray-800/20">
        <p className="whitespace-pre-wrap font-mono text-sm text-gray-600 dark:text-gray-300">
          {script.rawTranscript || "—"}
        </p>
      </div>
    </div>
  );

  const scriptPanel = (
    <div className="flex min-h-[400px] flex-col rounded-lg border border-gray-200 dark:border-gray-800 md:min-h-[500px] md:max-h-[70vh]">
      <div className="shrink-0 border-b border-gray-200 px-3 py-2 dark:border-gray-800">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/50 dark:text-green-300">
          ✓ {t("scriptStage.rewrittenByScriptForge")}
        </span>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-3 py-1.5 dark:border-gray-800">
        <p className="text-[11px] text-gray-400 dark:text-gray-500">
          {scriptWords} {t("scriptStage.wordCount")}
          {scriptWords === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={regenerating}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 transition-colors duration-200 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400"
        >
          {regenerating && <Spinner />}
          {t("scriptStage.regenerate")} ↺
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-5">
          <div className="rounded-lg bg-accent/5 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-accent">Hook</p>
            <p className="mt-1 text-sm text-foreground">{script.hook}</p>
          </div>

          {script.chapters.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Capítulos
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {script.chapters.map((chapter, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"
                  >
                    <span className="font-mono text-xs text-gray-400 dark:text-gray-500">
                      {chapter.startTime}
                    </span>
                    {chapter.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Roteiro completo
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-300">
              {script.content}
            </p>
          </div>

          {script.referencedVideos && script.referencedVideos.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                📺 {t("scriptStage.referencedVideos")}
              </p>
              <div className="mt-2 flex flex-col gap-2">
                {script.referencedVideos.map((video) => (
                  <div
                    key={video.videoId}
                    className="flex gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`}
                      alt={video.title}
                      width={60}
                      height={45}
                      className="h-[45px] w-[60px] shrink-0 rounded object-cover"
                    />
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="line-clamp-2 text-sm font-medium text-foreground">
                        {video.title}
                      </p>
                      {video.reason && (
                        <p className="text-xs text-gray-400 dark:text-gray-500">{video.reason}</p>
                      )}
                      <a
                        href={video.youtubeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                      >
                        <ExternalLinkIcon className="h-3 w-3" />
                        {t("scriptStage.viewOnYoutube")}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {script.clipScript && (
            <CollapsibleDeliverable
              title={`📱 ${t("scriptStage.clipScript")}`}
              content={script.clipScript}
            />
          )}
          {script.ctaLine && (
            <CollapsibleDeliverable
              title={`📢 ${t("scriptStage.ctaFinal")}`}
              content={script.ctaLine}
            />
          )}
          {script.podDescription && (
            <CollapsibleDeliverable
              title={`🎙️ ${t("scriptStage.podDescription")}`}
              content={script.podDescription}
            />
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Desktop split view — 40/60, independent scroll per panel.
          -mx-6 reclaims PipelineStage's own p-6 horizontal padding (its
          exact value, not a generic scale) so the panels reach the stage
          card's edges instead of sitting inset within it. */}
      <div className="-mx-6 hidden gap-4 md:grid md:grid-cols-[2fr_3fr]">
        {transcriptPanel}
        {scriptPanel}
      </div>

      {/* Mobile — one panel at a time via tabs. Only the panel itself
          bleeds via -mx-6 (matching the desktop grid above) — the tab
          switcher stays inset so it lines up with the rest of the page. */}
      <div className="md:hidden">
        <div className="mb-3 inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setMobileTab("transcript")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
              mobileTab === "transcript"
                ? "bg-accent text-white"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {t("scriptStage.originalTranscript")}
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("script")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
              mobileTab === "script" ? "bg-accent text-white" : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {t("scriptStage.stageTitle")}
          </button>
        </div>
        <div className="-mx-6">{mobileTab === "transcript" ? transcriptPanel : scriptPanel}</div>
      </div>

      {/* Seção C — Keywords panel, below the split view/tabs either way */}
      <div className="flex flex-col gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        {selectedKeywords.size > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Selecionadas: {selectedKeywords.size} keyword{selectedKeywords.size === 1 ? "" : "s"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[...selectedKeywords].map((kw) => (
                <KeywordChip key={kw} label={kw} selected onClick={() => toggleKeyword(kw)} />
              ))}
            </div>
          </div>
        )}

        {/* C1 — extracted from script */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {t("scriptStage.keywordsIdentified")}
          </p>
          {extractingKeywords ? (
            <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">Analisando roteiro...</p>
          ) : extractError ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{extractError}</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {extractedKeywords.map((kw) => (
                <KeywordChip
                  key={kw}
                  label={kw}
                  selected={selectedKeywords.has(kw)}
                  onClick={() => toggleKeyword(kw)}
                />
              ))}
            </div>
          )}
        </div>

        {/* C2 — YouTube trending */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {t("scriptStage.youtubeTrends")}
          </p>
          <input
            type="text"
            value={trendingQuery}
            onChange={(e) => setTrendingQuery(e.target.value)}
            placeholder="Ex: podcast, edição de vídeo..."
            className="mt-2 h-9 w-full rounded-lg border border-gray-200 bg-background px-3 text-sm text-foreground outline-none transition-colors duration-200 placeholder:text-gray-400 focus:border-accent dark:border-gray-700"
          />
          {trendingLoading ? (
            <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">Buscando...</p>
          ) : visibleTrendingSuggestions.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {visibleTrendingSuggestions.map((kw) => (
                <KeywordChip
                  key={kw}
                  label={kw}
                  selected={selectedKeywords.has(kw)}
                  onClick={() => toggleKeyword(kw)}
                />
              ))}
            </div>
          ) : null}
        </div>

        {/* C3 — manual */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {t("scriptStage.addKeyword")}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={manualKeyword}
              onChange={(e) => setManualKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddManualKeyword();
                }
              }}
              placeholder="Digite uma keyword..."
              className="h-9 flex-1 rounded-lg border border-gray-200 bg-background px-3 text-sm text-foreground outline-none transition-colors duration-200 placeholder:text-gray-400 focus:border-accent dark:border-gray-700"
            />
            <button
              type="button"
              onClick={handleAddManualKeyword}
              disabled={!manualKeyword.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white transition-colors duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Adicionar keyword"
            >
              +
            </button>
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={handleSaveKeywords}
            disabled={saveState === "saving"}
            className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
              saveState === "saved"
                ? "border-green-200 text-green-700 dark:border-green-900 dark:text-green-300"
                : saveState === "error"
                  ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50"
            }`}
          >
            {saveState === "saving" && <Spinner />}
            {saveState === "saving"
              ? t("scriptStage.savingKeywords")
              : saveState === "saved"
                ? t("scriptStage.keywordsSaved")
                : saveState === "error"
                  ? t("scriptStage.keywordsError")
                  : t("scriptStage.saveKeywords")}
          </button>
        </div>
      </div>

      {(generateError || actionError) && (
        <p className="text-sm text-red-600 dark:text-red-400">{generateError ?? actionError}</p>
      )}

      <div>
        <button
          type="button"
          onClick={handleApprove}
          disabled={approving}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-all duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {approving && <Spinner />}
          {t("scriptStage.approveScript")}
        </button>
      </div>
    </div>
  );
}
