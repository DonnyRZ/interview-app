const PUBLIC_ERROR_PATTERNS = [
  /not found/i,
  /login diperlukan/i,
  /subscription/i,
  /profile document .* ready/i,
  /upload .* profile document/i,
  /still linked/i,
  /unsupported profile document/i,
  /file pdf tidak valid/i,
  /concurrent live meeting/i,
  /meeting duration/i,
  /limit/i,
  /batas penerbitan realtime client secret/i
];

export function safeClientError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback;
  }
  return PUBLIC_ERROR_PATTERNS.some((pattern) => pattern.test(error.message))
    ? error.message
    : fallback;
}
