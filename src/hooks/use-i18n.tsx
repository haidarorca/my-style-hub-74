import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LANG, LANG_META, SUPPORTED_LANGS, translations, type Lang } from "@/lib/i18n/translations";

const STORAGE_KEY = "kawzone.lang.v1";

function detectLang(): Lang {
  if (typeof window === "undefined") return DEFAULT_LANG;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved && SUPPORTED_LANGS.includes(saved)) return saved;
  } catch { /* noop */ }
  const candidates = (navigator.languages?.length ? navigator.languages : [navigator.language]) ?? [];
  for (const c of candidates) {
    const code = (c || "").toLowerCase().split("-")[0] as Lang;
    if (SUPPORTED_LANGS.includes(code)) return code;
  }
  return DEFAULT_LANG;
}

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, fallback?: string) => string;
  dir: "ltr" | "rtl";
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  // Detect on mount (client only - keeps SSR output stable in default lang)
  useEffect(() => {
    const l = detectLang();
    setLangState(l);
  }, []);

  // Apply to <html> for accessibility + RTL
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
    document.documentElement.dir = LANG_META[lang].dir;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { window.localStorage.setItem(STORAGE_KEY, l); } catch { /* noop */ }
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) =>
      translations[lang]?.[key] ?? translations[DEFAULT_LANG][key] ?? fallback ?? key,
    [lang],
  );

  // CORRECTION: Extraire dir dans un useMemo separe pour eviter le recalcul a chaque render
  const dir = useMemo(() => LANG_META[lang].dir, [lang]);
  const value = useMemo<I18nCtx>(() => ({ lang, setLang, t, dir }), [lang, setLang, t, dir]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Safe fallback so calls never crash if used above the provider
    return {
      lang: DEFAULT_LANG,
      setLang: () => {},
      t: (k: string, f?: string) => translations[DEFAULT_LANG][k] ?? f ?? k,
      dir: "ltr" as const,
    };
  }
  return ctx;
}
