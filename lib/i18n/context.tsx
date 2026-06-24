"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { translations, type Locale } from "./translations";

const STORAGE_KEY = "halo-locale";
const DEFAULT_LOCALE: Locale = "pt-BR";
// Native "storage" events only fire in *other* tabs, never the tab that
// made the write — this custom event lets setLocale below notify its own
// tab too, both funnel into the same useSyncExternalStore subscription.
const LOCALE_CHANGE_EVENT = "halo-locale-change";

function isLocale(value: string | null): value is Locale {
  return value === "pt-BR" || value === "en-US";
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(LOCALE_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(LOCALE_CHANGE_EVENT, callback);
  };
}

function getSnapshot(): Locale {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isLocale(stored) ? stored : DEFAULT_LOCALE;
}

// localStorage isn't available during SSR — useSyncExternalStore uses this
// for the server-rendered/pre-hydration value, then reconciles against
// getSnapshot() once mounted, with no manual setState-in-effect needed.
function getServerSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}

function resolvePath(source: object, path: string): string | undefined {
  let current: unknown = source;
  for (const segment of path.split(".")) {
    if (typeof current !== "object" || current === null || !(segment in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" ? current : undefined;
}

/** t("scriptStage.saveKeywords") -> translated string for the active locale,
 * falling back to the key itself if the path doesn't resolve. */
export function useT(): (key: string) => string {
  const { locale } = useLocale();
  return useCallback((key: string) => resolvePath(translations[locale], key) ?? key, [locale]);
}
