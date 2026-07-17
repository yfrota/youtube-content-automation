import { Breadcrumb } from "./Breadcrumb";
import { HaloLogo } from "@/components/logo";

// Keyed by the exact `title` each placeholder page passes in
// (app/(app)/projects|analytics|settings/page.tsx) — a plain lookup rather
// than a prop per page, since PlaceholderPage only ever takes `title`.
const PAGE_SUBTITLES: Record<string, string> = {
  Projetos: "Visão consolidada de todos os projetos",
  Análises: "Métricas de produção e desempenho",
  Configurações: "Preferências e configurações da conta",
};

export function PlaceholderPage({ title }: { title: string }) {
  const subtitle = PAGE_SUBTITLES[title] ?? "Esta seção ainda está sendo desenvolvida.";

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 sm:px-8 sm:py-16">
      <Breadcrumb items={[{ label: "Início" }, { label: title }]} />

      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-halo-text">{title}</h1>

      <div
        className="mt-10 flex flex-col items-center justify-center rounded-[16px] border border-halo-border px-8 py-24 text-center"
        style={{
          background:
            "linear-gradient(135deg, rgba(196,181,253,0.05), rgba(249,168,212,0.05), rgba(147,197,253,0.05))",
        }}
      >
        <div className="opacity-40">
          <HaloLogo size={60} />
        </div>
        <p className="mt-6 text-lg font-medium text-halo-text">Em breve</p>
        <p className="mt-2 max-w-sm text-sm text-halo-text-muted">{subtitle}</p>
      </div>
    </div>
  );
}
