import { apiFetch } from "@/lib/services/api-client";

const AUTH_TOKEN_STORAGE_KEY = "infinarena:admin-token";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  username: string;
}

export function getStoredAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

function setStoredAuthToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
}

export function clearStoredAuthToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

function withAuthHeaders(headers?: HeadersInit): Headers {
  const token = getStoredAuthToken();
  const nextHeaders = new Headers(headers || {});
  if (token) {
    nextHeaders.set("Authorization", `Bearer ${token}`);
  }
  return nextHeaders;
}

export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await apiFetch(path, {
    ...init,
    headers: withAuthHeaders(init.headers),
  });

  if (response.status === 401) {
    clearStoredAuthToken();
    if (
      typeof window !== "undefined" &&
      (window.location.pathname.startsWith("/infinarenapanel") ||
        window.location.pathname.startsWith("/admin"))
    ) {
      const target = window.location.pathname.startsWith("/admin")
        ? "/admin/login"
        : "/infinarenapanel/login";
      window.location.replace(target);
    }
  }

  return response;
}

export async function loginWithPassword(
  username: string,
  password: string
): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  const response = await apiFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = typeof body?.error === "string" ? body.error : "Login failed";
    return { ok: false, error };
  }

  const token = typeof body?.token === "string" ? body.token : "";
  const user = body?.user as AuthUser | undefined;

  if (!token || !user) {
    return { ok: false, error: "Invalid login response" };
  }

  setStoredAuthToken(token);
  return { ok: true, user };
}

export async function fetchCurrentAdmin(): Promise<AuthUser | null> {
  const token = getStoredAuthToken();
  if (!token) return null;

  const response = await authedFetch("/api/auth/me", {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const body = await response.json().catch(() => null);
  return (body?.user as AuthUser | undefined) || null;
}

export async function logoutAdmin(): Promise<void> {
  const token = getStoredAuthToken();
  if (token) {
    try {
      await authedFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // No-op: local logout should still proceed.
    }
  }

  clearStoredAuthToken();
}

export async function downloadAuthedFile(path: string, filename?: string): Promise<void> {
  const response = await authedFetch(path, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}`);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;

  const headerFilename = response.headers
    .get("content-disposition")
    ?.match(/filename=\"?([^\";]+)\"?/i)?.[1];

  link.download = filename || headerFilename || "download";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
