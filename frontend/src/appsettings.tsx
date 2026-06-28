import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { getLocales } from "expo-localization";
import { storage } from "@/src/utils/storage";
import { DARK, LIGHT, Palette } from "@/src/theme";
import { Lang, translate } from "@/src/i18n";

const SUPPORTED: Lang[] = ["en", "sv", "da", "nl", "fr", "de", "es", "it", "pl"];

function detectDeviceLang(): Lang {
  try {
    const code = getLocales()?.[0]?.languageCode?.toLowerCase();
    return (SUPPORTED as string[]).includes(code || "") ? (code as Lang) : "en";
  } catch {
    return "en";
  }
}

type Ctx = {
  themeName: "dark" | "light";
  lang: Lang;
  colors: Palette;
  t: (key: string) => string;
  setThemeName: (n: "dark" | "light") => void;
  setLang: (l: Lang) => void;
};

const AppCtx = createContext<Ctx | undefined>(undefined);
const THEME_KEY = "app_theme";
const LANG_KEY = "app_lang";

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeNameState] = useState<"dark" | "light">("dark");
  const [lang, setLangState] = useState<Lang>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const th = await storage.secureGet<string>(THEME_KEY, "dark");
      const lg = await storage.secureGet<string>(LANG_KEY, "");
      if (th === "light" || th === "dark") setThemeNameState(th);
      if (SUPPORTED.includes(lg as Lang)) {
        setLangState(lg as Lang);
      } else {
        // First launch: auto-detect from device locale (user can change in Settings)
        const detected = detectDeviceLang();
        setLangState(detected);
        storage.secureSet(LANG_KEY, detected);
      }
      setReady(true);
    })();
  }, []);

  function setThemeName(n: "dark" | "light") {
    setThemeNameState(n);
    storage.secureSet(THEME_KEY, n);
  }
  function setLang(l: Lang) {
    setLangState(l);
    storage.secureSet(LANG_KEY, l);
  }

  const value = useMemo<Ctx>(() => ({
    themeName,
    lang,
    colors: themeName === "light" ? LIGHT : DARK,
    t: (key: string) => translate(lang, key),
    setThemeName,
    setLang,
  }), [themeName, lang]);

  if (!ready) return null;
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp must be used within AppSettingsProvider");
  return c;
}
export function useColors() {
  return useApp().colors;
}
export function useT() {
  return useApp().t;
}
