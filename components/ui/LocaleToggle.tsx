"use client";

import { useLocale } from "@/lib/i18n/context";

// Lives at the opposite corner from the dashboard's HaloMark watermark
// (bottom-right) and mirrors its same discreet opacity-50/hover:opacity-100
// treatment — but unlike that watermark, this renders in the true root
// layout (app/layout.tsx) so it shows on every page, not just /dashboard.
export function LocaleToggle() {
  const { locale, setLocale } = useLocale();

  return (
    <button
      type="button"
      onClick={() => setLocale(locale === "pt-BR" ? "en-US" : "pt-BR")}
      aria-label="Alternar idioma / Toggle language"
      className="fixed bottom-4 left-4 z-50 inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-background px-3 py-1.5 text-xs shadow-sm opacity-50 transition-opacity duration-200 hover:opacity-100 dark:border-gray-800 dark:bg-gray-900"
    >
      <span
        className={`rounded-full px-1.5 py-0.5 transition-colors duration-200 ${
          locale === "pt-BR" ? "bg-accent text-white" : "text-gray-400 dark:text-gray-500"
        }`}
      >
        PT
      </span>
      <span className="text-gray-300 dark:text-gray-700">|</span>
      <span
        className={`rounded-full px-1.5 py-0.5 transition-colors duration-200 ${
          locale === "en-US" ? "bg-accent text-white" : "text-gray-400 dark:text-gray-500"
        }`}
      >
        EN
      </span>
    </button>
  );
}
