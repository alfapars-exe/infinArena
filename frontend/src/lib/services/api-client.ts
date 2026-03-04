const configuredBackendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL?.trim().replace(/\/+$/, "") || "";

export function getBackendBaseUrl(): string {
  return configuredBackendUrl;
}

export function buildApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (!path.startsWith("/")) {
    throw new Error(`API path must start with '/' but got '${path}'`);
  }

  if (!configuredBackendUrl) {
    return path;
  }

  return `${configuredBackendUrl}${path}`;
}

export function getSocketBaseUrl(): string | undefined {
  return configuredBackendUrl || undefined;
}

export async function apiFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(buildApiUrl(path), init);
}
