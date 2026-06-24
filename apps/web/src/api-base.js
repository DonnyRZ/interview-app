function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

export function resolveApiBaseUrl() {
  const configuredBaseUrl = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL || "");
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const { protocol, hostname } = window.location;
  if (hostname === "127.0.0.1" || hostname === "localhost") {
    return `${protocol}//${hostname}:4000`;
  }

  return "";
}

export function buildApiUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const baseUrl = resolveApiBaseUrl();
  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
}
