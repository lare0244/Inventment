import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { router } from "expo-router";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as AppleAuthentication from "expo-apple-authentication";
import { api, setToken, clearToken, getToken } from "@/src/api";

WebBrowser.maybeCompleteAuthSession();

const AUTH_BASE = "https://auth.emergentagent.com/?redirect=";
const processedSessionIds = new Set<string>();

function extractSessionId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

type Company = { company_name?: string; street1?: string; street2?: string; postcode?: string; city?: string; state?: string; county?: string };
type User = { id: string; email: string; name?: string; currency?: string; plan?: string; low_stock_alert_email?: string | null; company?: Company | null; company_code?: string | null; company_connected?: boolean; is_company_master?: boolean; is_company_owner?: boolean };
type SettingsPatch = { currency?: string; low_stock_alert_email?: string; company?: Company; so_field1_label?: string; so_field2_label?: string };
type AuthCtx = {
  user: User | null;
  loading: boolean;
  currency: string;
  plan: string;
  alertEmail: string;
  company: Company;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  setCurrency: (currency: string) => Promise<void>;
  saveSettings: (patch: SettingsPatch) => Promise<void>;
  refreshUser: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Handle Google OAuth redirect (session_id in URL) before anything else.
        if (Platform.OS === "web") {
          const raw = (window.location.hash || "") + (window.location.search || "");
          const sid = extractSessionId(raw);
          if (sid) {
            await exchangeSession(sid);
            try {
              const url = new URL(window.location.href);
              url.searchParams.delete("session_id");
              if (url.hash.includes("session_id")) url.hash = "";
              window.history.replaceState(window.history.state, "", url.toString());
            } catch {}
            setLoading(false);
            return;
          }
        } else {
          const initial = await Linking.getInitialURL();
          const sid = extractSessionId(initial);
          if (sid) {
            await exchangeSession(sid);
            setLoading(false);
            return;
          }
        }
        const t = await getToken();
        if (t) {
          const me = await api<User>("/auth/me");
          setUser(me);
        }
      } catch {
        await clearToken();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function exchangeSession(sessionId: string) {
    if (processedSessionIds.has(sessionId)) return;
    processedSessionIds.add(sessionId);
    const r = await api<{ access_token: string }>("/auth/session", {
      method: "POST",
      body: { session_id: sessionId },
      auth: false,
    });
    await setToken(r.access_token);
    const me = await api<User>("/auth/me");
    setUser(me);
  }

  async function signIn(email: string, password: string) {
    const r = await api<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
    await setToken(r.access_token);
    const me = await api<User>("/auth/me");
    setUser(me);
  }

  async function signUp(email: string, password: string, name: string) {
    const r = await api<{ access_token: string }>("/auth/register", {
      method: "POST",
      body: { email, password, name },
      auth: false,
    });
    await setToken(r.access_token);
    const me = await api<User>("/auth/me");
    setUser(me);
  }

  async function signOut() {
    await clearToken();
    setUser(null);
    router.replace("/(auth)/login");
  }

  async function signInWithGoogle() {
    if (Platform.OS === "web") {
      const redirectUrl = window.location.origin + "/";
      window.location.href = AUTH_BASE + encodeURIComponent(redirectUrl);
      return;
    }
    const redirectUrl = Linking.createURL("");
    const authUrl = AUTH_BASE + encodeURIComponent(redirectUrl);
    let captured: string | null = null;
    const sub = Linking.addEventListener("url", (e) => { captured = e.url; });
    try {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      let url: string | null = (result as any)?.url || null;
      if (!url) url = captured;
      if (!url) url = await Linking.getInitialURL();
      const sid = extractSessionId(url);
      if (sid) await exchangeSession(sid);
    } finally {
      sub.remove();
    }
  }

  async function signInWithApple() {
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    const name = cred.fullName
      ? [cred.fullName.givenName, cred.fullName.familyName].filter(Boolean).join(" ") || null
      : null;
    const r = await api<{ access_token: string }>("/auth/apple", {
      method: "POST",
      auth: false,
      body: { identity_token: cred.identityToken, email: cred.email, name },
    });
    await setToken(r.access_token);
    const me = await api<User>("/auth/me");
    setUser(me);
  }

  async function saveSettings(patch: SettingsPatch) {
    const updated = await api<User>("/settings", { method: "PUT", body: patch });
    setUser((u) => (u ? { ...u, ...updated } : u));
  }

  async function refreshUser() {
    try { const me = await api<User>("/auth/me"); setUser(me); } catch {}
  }

  async function setCurrency(currency: string) {
    await saveSettings({ currency });
  }

  return <Ctx.Provider value={{ user, loading, currency: user?.currency || "SEK", plan: user?.plan || "free", alertEmail: user?.low_stock_alert_email || "", company: user?.company || {}, signIn, signUp, signOut, setCurrency, saveSettings, refreshUser }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
