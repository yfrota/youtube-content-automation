"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Breadcrumb } from "@/components/dashboard/Breadcrumb";
import {
  ChevronDownIcon,
  FacebookIcon,
  InstagramIcon,
  LinkedinIcon,
  PlayCircleIcon,
  SpotifyIcon,
  TiktokIcon,
} from "@/components/icons";
import { PRIORITY_LABELS } from "@/lib/dashboard/types";
import type { ClientProfile, ContentType, Priority } from "@/lib/dashboard/types";

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M12 3a9 9 0 0 1 9 9h-3a6 6 0 0 0-6-6V3Z"
      />
    </svg>
  );
}

// All six are enum-valid (instagram/facebook/linkedin since 0001, spotify/
// tiktok since 0009) and all six are selectable here — none has a connector
// or agent behind it yet besides YouTube, same pre-connector gap YouTube
// itself once had. `enabled` is kept (rather than dropped now that it's
// always true) so a future platform can be added to the enum without a UI
// connector/agent ready, same as these five, and land here disabled.
const PLATFORM_OPTIONS = [
  { value: "youtube", label: "YouTube", Icon: PlayCircleIcon, color: "#FF0000", enabled: true },
  { value: "instagram", label: "Instagram", Icon: InstagramIcon, color: "#C13584", enabled: true },
  { value: "linkedin", label: "LinkedIn", Icon: LinkedinIcon, color: "#0A66C2", enabled: true },
  { value: "facebook", label: "Facebook", Icon: FacebookIcon, color: "#1877F2", enabled: true },
  { value: "spotify", label: "Spotify", Icon: SpotifyIcon, color: "#1DB954", enabled: true },
  { value: "tiktok", label: "TikTok", Icon: TiktokIcon, color: "#000000", enabled: true },
] as const;

type PlatformOption = (typeof PLATFORM_OPTIONS)[number]["value"];

// Central to the pipeline (selects which Script Forge prompt/structure
// applies, 0010) — lives in the main form, not "Configurações avançadas".
const CONTENT_TYPE_OPTIONS: { value: ContentType; emoji: string; label: string }[] = [
  { value: "youtube_tutorial", emoji: "🎬", label: "YouTube Tutorial" },
  { value: "podcast_vodcast", emoji: "🎙️", label: "Podcast / Vodcast" },
  { value: "short_form", emoji: "📱", label: "Short-form / Reel" },
];

const PRIORITIES: Priority[] = ["normal", "high", "urgent", "low"];

export function NewProjectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedClientId = searchParams.get("clientId");

  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [clientId, setClientId] = useState(preselectedClientId ?? "");

  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState<ContentType>("youtube_tutorial");
  const [platform, setPlatform] = useState<PlatformOption>("youtube");
  const [channelUrl, setChannelUrl] = useState("");
  const [language, setLanguage] = useState<"pt-BR" | "en-US">("pt-BR");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [priority, setPriority] = useState<Priority>("normal");
  const [deadline, setDeadline] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/clients")
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        setClients(body.clients ?? []);
        // Only auto-pick the first client when nothing was preselected via
        // ?clientId= — otherwise this would override an explicit choice the
        // moment the list finishes loading.
        if (!preselectedClientId && body.clients?.length === 1) {
          setClientId(body.clients[0].id);
        }
      })
      .catch(() => setClientsError("Falha ao carregar clientes"));
    return () => {
      cancelled = true;
    };
  }, [preselectedClientId]);

  function addTag() {
    const value = tagInput.trim();
    if (!value || tags.includes(value)) {
      setTagInput("");
      return;
    }
    setTags((prev) => [...prev, value]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !clientId) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          platform,
          contentType,
          title,
          externalChannelId: channelUrl.trim() || undefined,
          language,
          priority,
          deadline: deadline || undefined,
          tags,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Falha ao criar projeto");
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar projeto");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 sm:px-8 sm:py-16">
      <Breadcrumb
        items={[
          { label: "Início", href: "/" },
          { label: "Clientes", href: "/clients" },
          { label: "Novo projeto" },
        ]}
      />

      <h1 className="mt-6 text-2xl font-light tracking-tight text-foreground">
        Novo projeto
      </h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Comece um novo vídeo em produção. Roteiro, SEO e thumbnail são gerados
        nas próximas etapas.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-10 rounded-xl border border-gray-200 p-6 dark:border-gray-800"
      >
        <div className="flex flex-col gap-6">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Cliente*
            </span>
            <select
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="h-11 rounded-lg border border-gray-200 bg-background px-3 text-sm text-foreground outline-none transition-colors duration-200 focus:border-accent dark:border-gray-700"
            >
              <option value="" disabled>
                Selecione um cliente...
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {clientsError && (
              <span className="text-xs text-red-600 dark:text-red-400">{clientsError}</span>
            )}
            {!clientsError && clients.length === 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Nenhum cliente cadastrado ainda —{" "}
                <Link href="/clients/new" className="text-accent hover:underline">
                  crie um cliente
                </Link>{" "}
                primeiro.
              </span>
            )}
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Nome do projeto
            </span>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Como a IA está mudando a edição de vídeo"
              className="h-11 rounded-lg border border-gray-200 bg-background px-3 text-sm text-foreground outline-none transition-colors duration-200 placeholder:text-gray-400 focus:border-accent dark:border-gray-700"
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Tipo de conteúdo
            </span>
            <div className="grid grid-cols-3 gap-2">
              {CONTENT_TYPE_OPTIONS.map(({ value, emoji, label }) => {
                const selected = value === contentType;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setContentType(value)}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-colors duration-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 ${
                      selected
                        ? "border-accent bg-accent/5"
                        : "border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    <span className="text-xl" aria-hidden="true">
                      {emoji}
                    </span>
                    <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Define a estrutura e o tamanho do script gerado pelo agente.
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Plataforma
            </span>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {PLATFORM_OPTIONS.map(({ value, label, Icon, color, enabled }) => {
                const selected = value === platform;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={!enabled}
                    onClick={() => setPlatform(value)}
                    title={enabled ? label : `${label} (em breve)`}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-colors duration-200 ${
                      selected
                        ? "border-accent bg-accent/5"
                        : "border-gray-200 dark:border-gray-700"
                    } ${enabled ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40" : "cursor-not-allowed opacity-40"}`}
                  >
                    <Icon className="h-5 w-5" style={{ color }} />
                    <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              URL do canal
            </span>
            <input
              type="url"
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
              placeholder="https://www.youtube.com/@seucanal"
              className="h-11 rounded-lg border border-gray-200 bg-background px-3 text-sm text-foreground outline-none transition-colors duration-200 placeholder:text-gray-400 focus:border-accent dark:border-gray-700"
            />
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Usado para indexar o catálogo de vídeos via RAG.
            </span>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Idioma do conteúdo
            </span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as "pt-BR" | "en-US")}
              className="h-11 rounded-lg border border-gray-200 bg-background px-3 text-sm text-foreground outline-none transition-colors duration-200 focus:border-accent dark:border-gray-700"
            >
              <option value="pt-BR">Português (Brasil)</option>
              <option value="en-US">English (US)</option>
            </select>
          </label>

          <div className="rounded-lg border border-gray-200 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-gray-600 dark:text-gray-300"
            >
              Configurações avançadas
              <ChevronDownIcon
                className={`h-4 w-4 transition-transform duration-200 ${advancedOpen ? "rotate-180" : ""}`}
              />
            </button>

            {advancedOpen && (
              <div className="animate-fade-in flex flex-col gap-5 border-t border-gray-200 p-4 dark:border-gray-800">
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    Prioridade
                  </span>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as Priority)}
                    className="h-10 rounded-lg border border-gray-200 bg-background px-3 text-sm text-foreground outline-none transition-colors duration-200 focus:border-accent dark:border-gray-700"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    Prazo
                  </span>
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="h-10 rounded-lg border border-gray-200 bg-background px-3 text-sm text-foreground outline-none transition-colors duration-200 focus:border-accent dark:border-gray-700"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    Tags
                  </span>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => removeTag(tag)}
                            aria-label={`Remover tag ${tag}`}
                            className="text-gray-400 hover:text-foreground"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    placeholder="Digite e pressione Enter..."
                    className="h-10 rounded-lg border border-gray-200 bg-background px-3 text-sm text-foreground outline-none transition-colors duration-200 placeholder:text-gray-400 focus:border-accent dark:border-gray-700"
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="mt-8 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-gray-500 transition-colors duration-200 hover:bg-gray-50 hover:text-foreground dark:text-gray-400 dark:hover:bg-gray-800/50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !title.trim() || !clientId}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-all duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Spinner />}
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
}
