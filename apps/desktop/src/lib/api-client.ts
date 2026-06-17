const API_BASE_URL = (import.meta.env.VITE_DESKTOP_API_BASE_URL || "https://dev.orviko.net").replace(/\/$/, "");

async function serializeBody(body: BodyInit | null | undefined) {
  if (!body) {
    return undefined;
  }

  if (typeof body === "string") {
    return body;
  }

  if (body instanceof FormData) {
    const entries = await Promise.all(
      Array.from(body.entries()).map(async ([name, value]) => {
        if (typeof value === "string") {
          return { name, value } as const;
        }

        const buffer = await value.arrayBuffer();
        return {
          name,
          fileName: value.name,
          contentType: value.type || "application/octet-stream",
          buffer
        } as const;
      })
    );

    return {
      kind: "form-data" as const,
      entries
    };
  }

  throw new Error("Desktop API body type belum didukung.");
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (window.interviewDesktop?.apiRequest) {
    const response = await window.interviewDesktop.apiRequest({
      path,
      method: init?.method,
      headers: init?.headers ? Object.fromEntries(new Headers(init.headers).entries()) : undefined,
      body: await serializeBody(init?.body)
    });

    if (!response.ok) {
      const errorBody = response.json as { message?: string } | null;
      throw new Error(errorBody?.message || response.text || `Request failed with status ${response.status}`);
    }

    return response.json as T;
  }

  const response = await fetch(`${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    credentials: "include",
    ...init
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(errorBody?.message || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}
