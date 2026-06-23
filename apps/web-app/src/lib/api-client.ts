export const API_BASE_URL = (
  import.meta.env.VITE_WEB_APP_API_BASE_URL
  || (import.meta.env.DEV ? "https://dev.orviko.net" : window.location.origin)
).replace(/\/$/, "");

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function apiRequest<T = unknown>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (import.meta.env.DEV) {
    headers.set("X-Orviko-Local-Testing", "web-app");
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      ...init,
      headers
    });
  } catch {
    throw new ApiRequestError("Backend belum dapat dihubungi.", 0);
  }
  const payload = await response.json().catch(() => null) as (T & { message?: string }) | null;
  if (!response.ok) {
    throw new ApiRequestError(payload?.message || `Request gagal dengan status ${response.status}.`, response.status);
  }
  return payload as T;
}
