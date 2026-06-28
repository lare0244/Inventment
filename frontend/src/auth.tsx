import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, setToken, clearToken, getToken } from "@/src/api";

type Company = { company_name?: string; street1?: string; street2?: string; postcode?: string; city?: string; state?: string; county?: string };
type User = { id: string; email: string; name?: string; currency?: string; plan?: string; low_stock_alert_email?: string | null; company?: Company | null };
type SettingsPatch = { currency?: string; low_stock_alert_email?: string; company?: Company };
type AuthCtx = {
  user: User | null;
  loading: boolean;
  currency: string;
  plan: string;
  alertEmail: string;
  company: Company;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
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
