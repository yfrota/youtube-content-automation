"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { useToast } from "./toast";
import type { ClientProfile } from "@/lib/dashboard/types";

export function EditClientModal({
  client,
  onClose,
  onSaved,
}: {
  client: ClientProfile;
  onClose: () => void;
  onSaved: (client: ClientProfile) => void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState(client.name);
  const [email, setEmail] = useState(client.email ?? "");
  const [phone, setPhone] = useState(client.phone ?? "");
  const [description, setDescription] = useState(client.description ?? "");
  const [imageUrl, setImageUrl] = useState(client.imageUrl ?? "");
  const [channelUrl, setChannelUrl] = useState(client.channelUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (saving || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          description: description.trim() || null,
          imageUrl: imageUrl.trim() || null,
          channelUrl: channelUrl.trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Falha ao salvar cliente");
      onSaved(body.client);
      showToast("Cliente atualizado");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar cliente");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Editar cliente" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Nome
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 rounded-lg border border-gray-200 bg-background px-3 text-sm text-foreground outline-none transition-colors duration-200 focus:border-accent dark:border-gray-700"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 rounded-lg border border-gray-200 bg-background px-3 text-sm text-foreground outline-none transition-colors duration-200 focus:border-accent dark:border-gray-700"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Telefone
          </span>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-10 rounded-lg border border-gray-200 bg-background px-3 text-sm text-foreground outline-none transition-colors duration-200 focus:border-accent dark:border-gray-700"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Descrição
          </span>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-lg border border-gray-200 bg-background p-3 text-sm text-foreground outline-none transition-colors duration-200 focus:border-accent dark:border-gray-700"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            URL da imagem
          </span>
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
            className="h-10 rounded-lg border border-gray-200 bg-background px-3 text-sm text-foreground outline-none transition-colors duration-200 placeholder:text-gray-400 focus:border-accent dark:border-gray-700"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            URL do Canal YouTube
          </span>
          <input
            type="text"
            value={channelUrl}
            onChange={(e) => setChannelUrl(e.target.value)}
            placeholder="https://www.youtube.com/@seucanal"
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
            disabled={saving || !name.trim()}
            className="inline-flex h-9 items-center rounded-lg bg-accent px-3 text-sm font-medium text-white transition-colors duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>
    </Modal>
  );
}
