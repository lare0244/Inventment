import { storage } from "@/src/utils/storage";
import { Platform } from "react-native";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;
const TOKEN_KEY = "sm_token";

export async function getToken() {
  return storage.secureGet<string>(TOKEN_KEY, "");
}
export async function setToken(t: string) {
  return storage.secureSet(TOKEN_KEY, t);
}
export async function clearToken() {
  return storage.secureRemove(TOKEN_KEY);
}

export async function api<T = any>(
  path: string,
  options: { method?: string; body?: any; auth?: boolean } = {}
): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch {}
    throw new Error(typeof detail === "string" ? detail : "Request failed");
  }
  if (res.status === 204) return {} as T;
  return res.json();
}

// Upload an image (from camera/gallery uri) to Object Storage via backend. Returns the storage path.
export async function uploadImage(uri: string, name = "photo.jpg"): Promise<string> {
  const token = await getToken();
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, name);
  } else {
    form.append("file", { uri, name, type: "image/jpeg" } as any);
  }
  const res = await fetch(`${BASE}/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    let detail = `Upload failed (${res.status})`;
    try { const j = await res.json(); detail = j.detail || detail; } catch {}
    throw new Error(typeof detail === "string" ? detail : "Upload failed");
  }
  const j = await res.json();
  return j.path as string;
}

// Build a displayable URI for a stored image path (or pass through http URLs).
export function fileUri(pathOrUrl?: string | null, token?: string | null): string | null {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  return `${BASE}/files/${pathOrUrl}${token ? `?token=${token}` : ""}`;
}
