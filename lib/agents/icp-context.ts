import type { ClientProfile } from "@/lib/dashboard/types";

// Audience-profile context block (0014) — threaded into Script Forge's and
// SEO Engine's prompts so generated content calibrates to the client's own
// ICP instead of a generic voice. `client.icpText` (the free-text tab) wins
// outright over the structured fields when both exist — it's meant to be
// the fuller, curated version (a pasted PDF or an AI-authored writeup), not
// something to merge field-by-field with the structured tab.
export function buildIcpContext(client: ClientProfile): string {
  if (client.icpText) {
    return `PERFIL DO PÚBLICO-ALVO:\n${client.icpText}`;
  }

  const fields: [string, string | null][] = [
    ["Demographics", client.icpDemographics],
    ["Psychographics", client.icpPsychographics],
    ["Motivações", client.icpMotivations],
    ["Medos", client.icpFears],
    ["Desejos", client.icpDesires],
    ["Objeções", client.icpObjections],
    ["Histórias reais", client.icpStories],
  ];
  const populated = fields.filter(([, value]) => value && value.trim());
  if (populated.length === 0) return "";

  const lines = populated.map(([label, value]) => `${label}: ${value}`);
  return `PERFIL DO PÚBLICO-ALVO:\n${lines.join("\n")}`;
}
