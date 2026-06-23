"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Breadcrumb } from "@/components/dashboard/Breadcrumb";

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

export default function NewProjectPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [language, setLanguage] = useState<"pt-BR" | "en-US">("pt-BR");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "youtube",
          title,
          externalChannelId: channelUrl.trim() || undefined,
          language,
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
      <Breadcrumb items={[{ label: "Início" }, { label: "Dashboard" }, { label: "Novo projeto" }]} />

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
              Nome do vídeo
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

          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Plataforma
            </span>
            <select
              disabled
              value="youtube"
              className="h-11 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-500 outline-none dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400"
            >
              <option value="youtube">YouTube</option>
            </select>
          </label>

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
            disabled={saving || !title.trim()}
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
