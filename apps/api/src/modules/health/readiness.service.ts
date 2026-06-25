import { access, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { sql } from "../../db/client.js";
import { env } from "../../env.js";
import { ensureProfileDocumentStorageDir, profileDocumentStorageDir } from "../../lib/storage.js";

export type ReadinessCheck = {
  ok: boolean;
  latencyMs: number;
  message?: string;
};

export async function collectReadiness() {
  const [database, storage] = await Promise.all([
    checkDatabase(),
    checkStorage()
  ]);
  const configuration: ReadinessCheck = env.OPENAI_API_KEY
    ? { ok: true, latencyMs: 0 }
    : { ok: false, latencyMs: 0, message: "OpenAI API key is not configured" };

  return {
    ok: database.ok && storage.ok && configuration.ok,
    service: "orviko-api" as const,
    timestamp: new Date().toISOString(),
    checks: {
      database,
      storage,
      configuration
    }
  };
}

async function checkDatabase(): Promise<ReadinessCheck> {
  const startedAt = performance.now();
  try {
    await sql`SELECT 1 AS "ok"`;
    return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
  } catch {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - startedAt),
      message: "Database unavailable"
    };
  }
}

async function checkStorage(): Promise<ReadinessCheck> {
  const startedAt = performance.now();
  const probePath = path.join(profileDocumentStorageDir, `.readiness-${process.pid}-${Date.now()}`);
  try {
    await ensureProfileDocumentStorageDir();
    await access(profileDocumentStorageDir);
    await writeFile(probePath, "ready", { flag: "wx" });
    await unlink(probePath);
    return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
  } catch {
    await unlink(probePath).catch(() => undefined);
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - startedAt),
      message: "Profile document storage unavailable"
    };
  }
}
