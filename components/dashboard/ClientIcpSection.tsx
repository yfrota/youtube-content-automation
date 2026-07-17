"use client";

import { useState } from "react";
import { useToast } from "./toast";
import { ChevronDownIcon } from "@/components/icons";
import type { BrandColor, ClientProfile } from "@/lib/dashboard/types";

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

function fieldLabelClass() {
  return "text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500";
}

function textareaClass() {
  return "resize-y rounded-lg border border-gray-200 bg-background p-3 text-sm text-foreground outline-none transition-colors duration-200 placeholder:text-gray-400 focus:border-accent dark:border-gray-700";
}

type Tab = "freeText" | "structured";

interface ClientIcpSectionProps {
  client: ClientProfile;
  onSaved: (client: ClientProfile) => void;
}

// "Perfil do Público (ICP)" section on /clients/[id] (0014) — hybrid mode
// (opção C from the spec): a free-text tab for pasting a PDF/AI-generated
// profile, and a structured tab mirroring Kelly's own document sections.
// Both PATCH the same /api/clients/[id] route, just different field subsets
// — kept deliberately out of EditClientModal (too much content for a modal,
// per explicit instruction), lives only here.
export function ClientIcpSection({ client, onSaved }: ClientIcpSectionProps) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>(client.icpText ? "freeText" : "structured");
  const [previewOpen, setPreviewOpen] = useState(false);

  // Free text
  const [icpText, setIcpText] = useState(client.icpText ?? "");
  const [savingText, setSavingText] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);

  // Structured fields
  const [demographics, setDemographics] = useState(client.icpDemographics ?? "");
  const [psychographics, setPsychographics] = useState(client.icpPsychographics ?? "");
  const [motivations, setMotivations] = useState(client.icpMotivations ?? "");
  const [fears, setFears] = useState(client.icpFears ?? "");
  const [desires, setDesires] = useState(client.icpDesires ?? "");
  const [objections, setObjections] = useState(client.icpObjections ?? "");
  const [stories, setStories] = useState(client.icpStories ?? "");
  const [savingFields, setSavingFields] = useState(false);
  const [fieldsError, setFieldsError] = useState<string | null>(null);

  // Brand identity
  const [brandNotes, setBrandNotes] = useState(client.brandNotes ?? "");
  const [brandColors, setBrandColors] = useState<BrandColor[]>(client.brandColors ?? []);
  const [colorHex, setColorHex] = useState("");
  const [colorName, setColorName] = useState("");
  const [colorRole, setColorRole] = useState("primary");
  const [savingBrand, setSavingBrand] = useState(false);
  const [brandError, setBrandError] = useState<string | null>(null);

  async function patchClient(body: Record<string, unknown>): Promise<ClientProfile> {
    const res = await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const responseBody = await res.json();
    if (!res.ok) throw new Error(responseBody?.error ?? "Falha ao salvar");
    return responseBody.client as ClientProfile;
  }

  async function handleSaveText() {
    if (savingText) return;
    setSavingText(true);
    setTextError(null);
    try {
      const updated = await patchClient({ icpText: icpText.trim() || null });
      onSaved(updated);
      showToast("ICP salvo");
    } catch (err) {
      setTextError(err instanceof Error ? err.message : "Falha ao salvar ICP");
    } finally {
      setSavingText(false);
    }
  }

  async function handleSaveFields() {
    if (savingFields) return;
    setSavingFields(true);
    setFieldsError(null);
    try {
      const updated = await patchClient({
        icpDemographics: demographics.trim() || null,
        icpPsychographics: psychographics.trim() || null,
        icpMotivations: motivations.trim() || null,
        icpFears: fears.trim() || null,
        icpDesires: desires.trim() || null,
        icpObjections: objections.trim() || null,
        icpStories: stories.trim() || null,
      });
      onSaved(updated);
      showToast("Campos salvos");
    } catch (err) {
      setFieldsError(err instanceof Error ? err.message : "Falha ao salvar campos");
    } finally {
      setSavingFields(false);
    }
  }

  function handleAddColor() {
    const hex = colorHex.trim();
    const name = colorName.trim();
    if (!hex || !name) return;
    setBrandColors((prev) => [...prev, { hex, name, role: colorRole }]);
    setColorHex("");
    setColorName("");
  }

  function handleRemoveColor(index: number) {
    setBrandColors((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSaveBrand() {
    if (savingBrand) return;
    setSavingBrand(true);
    setBrandError(null);
    try {
      const updated = await patchClient({
        brandNotes: brandNotes.trim() || null,
        brandColors,
      });
      onSaved(updated);
      showToast("Identidade visual salva");
    } catch (err) {
      setBrandError(err instanceof Error ? err.message : "Falha ao salvar identidade visual");
    } finally {
      setSavingBrand(false);
    }
  }

  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-light text-foreground">Perfil do Público (ICP)</h2>
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setTab("freeText")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
              tab === "freeText" ? "bg-accent text-white" : "text-gray-500 dark:text-gray-400"
            }`}
          >
            📝 Texto livre
          </button>
          <button
            type="button"
            onClick={() => setTab("structured")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
              tab === "structured" ? "bg-accent text-white" : "text-gray-500 dark:text-gray-400"
            }`}
          >
            📋 Campos estruturados
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 p-6 dark:border-gray-800">
        {tab === "freeText" ? (
          <div className="flex flex-col gap-4">
            {client.icpText && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setPreviewOpen((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400"
                >
                  ICP salvo atualmente
                  <ChevronDownIcon
                    className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
                      previewOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {previewOpen && (
                  <div className="animate-fade-in border-t border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-800/20">
                    <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">
                      {client.icpText}
                    </p>
                  </div>
                )}
              </div>
            )}

            <label className="flex flex-col gap-2">
              <span className={fieldLabelClass()}>ICP (texto livre)</span>
              <textarea
                rows={12}
                value={icpText}
                onChange={(e) => setIcpText(e.target.value)}
                placeholder="Cole aqui o PDF do ICP ou um texto gerado pela IA..."
                className={textareaClass()}
              />
            </label>

            {textError && <p className="text-sm text-red-600 dark:text-red-400">{textError}</p>}

            <div>
              <button
                type="button"
                onClick={handleSaveText}
                disabled={savingText}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-white transition-colors duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingText && <Spinner />}
                Salvar ICP
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className={fieldLabelClass()}>Demographics</span>
              <textarea
                rows={3}
                value={demographics}
                onChange={(e) => setDemographics(e.target.value)}
                placeholder="Idade, localização, renda, estado civil..."
                className={textareaClass()}
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className={fieldLabelClass()}>Psychographics</span>
              <textarea
                rows={3}
                value={psychographics}
                onChange={(e) => setPsychographics(e.target.value)}
                placeholder="Valores, estilo de vida, personalidade..."
                className={textareaClass()}
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className={fieldLabelClass()}>Core Motivations</span>
              <textarea
                rows={3}
                value={motivations}
                onChange={(e) => setMotivations(e.target.value)}
                placeholder="O que motiva essa pessoa profundamente..."
                className={textareaClass()}
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className={fieldLabelClass()}>Fears</span>
              <textarea
                rows={3}
                value={fears}
                onChange={(e) => setFears(e.target.value)}
                placeholder="Medos e inseguranças do público..."
                className={textareaClass()}
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className={fieldLabelClass()}>Desires</span>
              <textarea
                rows={3}
                value={desires}
                onChange={(e) => setDesires(e.target.value)}
                placeholder="O que essa pessoa mais deseja..."
                className={textareaClass()}
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className={fieldLabelClass()}>Objections</span>
              <textarea
                rows={3}
                value={objections}
                onChange={(e) => setObjections(e.target.value)}
                placeholder="Por que pode hesitar em consumir..."
                className={textareaClass()}
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className={fieldLabelClass()}>Vulnerable Stories</span>
              <textarea
                rows={3}
                value={stories}
                onChange={(e) => setStories(e.target.value)}
                placeholder="Histórias e pensamentos do dia a dia..."
                className={textareaClass()}
              />
            </label>

            {fieldsError && (
              <p className="text-sm text-red-600 dark:text-red-400">{fieldsError}</p>
            )}

            <div>
              <button
                type="button"
                onClick={handleSaveFields}
                disabled={savingFields}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-white transition-colors duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingFields && <Spinner />}
                Salvar campos
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Brand identity — separate from the ICP tabs above, always visible
          regardless of which ICP tab is active. Color upload is a manual
          hex/name/role form for now; file upload waits on Storage. */}
      <div className="mt-8 rounded-xl border border-gray-200 p-6 dark:border-gray-800">
        <h3 className="text-sm font-medium text-foreground">Identidade Visual</h3>

        <label className="mt-4 flex flex-col gap-2">
          <span className={fieldLabelClass()}>Notas de marca</span>
          <textarea
            rows={3}
            value={brandNotes}
            onChange={(e) => setBrandNotes(e.target.value)}
            placeholder="Estilo, mood, referências visuais da marca..."
            className={textareaClass()}
          />
        </label>

        <div className="mt-4 flex flex-col gap-2">
          <span className={fieldLabelClass()}>Cores da marca</span>
          {brandColors.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {brandColors.map((color, i) => (
                <span
                  key={`${color.hex}-${i}`}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 py-1 pl-1 pr-2.5 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300"
                >
                  <span
                    className="h-4 w-4 shrink-0 rounded-full border border-black/10"
                    style={{ backgroundColor: color.hex }}
                    aria-hidden="true"
                  />
                  {color.name}
                  <span className="text-gray-400 dark:text-gray-500">· {color.role}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveColor(i)}
                    aria-label={`Remover cor ${color.name}`}
                    className="text-gray-400 hover:text-foreground"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={colorHex}
              onChange={(e) => setColorHex(e.target.value)}
              placeholder="#f9a8d4"
              className="h-9 w-24 rounded-lg border border-gray-200 bg-background px-2.5 text-sm text-foreground outline-none transition-colors duration-200 placeholder:text-gray-400 focus:border-accent dark:border-gray-700"
            />
            <input
              type="text"
              value={colorName}
              onChange={(e) => setColorName(e.target.value)}
              placeholder="Nome (ex: Rosa)"
              className="h-9 flex-1 min-w-[140px] rounded-lg border border-gray-200 bg-background px-2.5 text-sm text-foreground outline-none transition-colors duration-200 placeholder:text-gray-400 focus:border-accent dark:border-gray-700"
            />
            <select
              value={colorRole}
              onChange={(e) => setColorRole(e.target.value)}
              className="h-9 rounded-lg border border-gray-200 bg-background px-2.5 text-sm text-foreground outline-none transition-colors duration-200 focus:border-accent dark:border-gray-700"
            >
              <option value="primary">primary</option>
              <option value="secondary">secondary</option>
              <option value="accent">accent</option>
            </select>
            <button
              type="button"
              onClick={handleAddColor}
              disabled={!colorHex.trim() || !colorName.trim()}
              className="inline-flex h-9 items-center rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-600 transition-colors duration-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50"
            >
              + Adicionar
            </button>
          </div>
        </div>

        {brandError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{brandError}</p>}

        <div className="mt-4">
          <button
            type="button"
            onClick={handleSaveBrand}
            disabled={savingBrand}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-white transition-colors duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingBrand && <Spinner />}
            Salvar identidade visual
          </button>
        </div>
      </div>
    </section>
  );
}
