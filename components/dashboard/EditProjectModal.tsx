"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { useToast } from "./toast";
import type { Priority, Project } from "@/lib/dashboard/types";
import { PRIORITY_LABELS } from "@/lib/dashboard/types";

const PRIORITIES: Priority[] = ["low", "normal", "high", "urgent"];

export function EditProjectModal({
  project,
  onClose,
  onSaved,
}: {
  project: Project;
  onClose: () => void;
  onSaved: (patch: {
    title: string;
    priority: Priority;
    deadline: string | null;
    tags: string[];
    updatedAt: string;
  }) => void;
}) {
  const { showToast } = useToast();
  const [title, setTitle] = useState(project.title);
  const [priority, setPriority] = useState<Priority>(project.priority);
  const [deadline, setDeadline] = useState(project.deadline ?? "");
  const [tags, setTags] = useState<string[]>(project.tags);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleSave() {
    if (saving || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          priority,
          deadline: deadline || null,
          tags,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Falha ao salvar projeto");
      onSaved({
        title: body.project.title,
        priority: body.project.priority,
        deadline: body.project.deadline,
        tags: Array.isArray(body.project.tags) ? body.project.tags : [],
        updatedAt: body.project.updated_at,
      });
      showToast("Projeto atualizado");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar projeto");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Editar projeto" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Título
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-10 rounded-lg border border-gray-200 bg-background px-3 text-sm text-foreground outline-none transition-colors duration-200 focus:border-accent dark:border-gray-700"
          />
        </label>

        <label className="flex flex-col gap-1.5">
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

        <label className="flex flex-col gap-1.5">
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

        <label className="flex flex-col gap-1.5">
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

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-2 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-gray-500 transition-colors duration-200 hover:bg-gray-50 hover:text-foreground dark:text-gray-400 dark:hover:bg-gray-800/50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="inline-flex h-9 items-center rounded-lg bg-accent px-3 text-sm font-medium text-white transition-colors duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>
    </Modal>
  );
}
