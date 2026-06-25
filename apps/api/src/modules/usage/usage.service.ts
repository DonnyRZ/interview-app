import { sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { usageEvents, usageRollups } from "../../db/schema/index.js";
import { env } from "../../env.js";

export type UsageCapability =
  | "profile_preprocessing"
  | "meeting_context_preprocessing"
  | "realtime_client_secret"
  | "realtime_session"
  | "meeting_help";

export type UsageProvider = "openai";

export type RecordUsageEventInput = {
  userId: string;
  liveMeetingSessionId?: string | null;
  capability: UsageCapability;
  provider: UsageProvider;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  audioInputTokens?: number;
  audioOutputTokens?: number;
  totalTokens?: number;
  durationMs?: number;
  requestStatus?: "success" | "failed" | "blocked";
  metadata?: Record<string, unknown>;
};

export async function recordUsageEvent(input: RecordUsageEventInput) {
  const inputTokens = positiveInteger(input.inputTokens);
  const outputTokens = positiveInteger(input.outputTokens);
  const audioInputTokens = positiveInteger(input.audioInputTokens);
  const audioOutputTokens = positiveInteger(input.audioOutputTokens);
  const totalTokens = positiveInteger(
    input.totalTokens ?? inputTokens + outputTokens + audioInputTokens + audioOutputTokens
  );
  const estimatedCostUsdMicros = estimateCostUsdMicros({
    capability: input.capability,
    inputTokens,
    outputTokens,
    audioInputTokens,
    audioOutputTokens
  });

  const [event] = await db.insert(usageEvents).values({
    userId: input.userId,
    liveMeetingSessionId: input.liveMeetingSessionId ?? null,
    capability: input.capability,
    provider: input.provider,
    model: input.model,
    inputTokens,
    outputTokens,
    audioInputTokens,
    audioOutputTokens,
    totalTokens,
    durationMs: positiveInteger(input.durationMs),
    estimatedCostUsdMicros,
    requestStatus: input.requestStatus ?? "success",
    metadata: input.metadata ?? {}
  }).returning();

  const bucketDate = new Date().toISOString().slice(0, 10);
  await db.insert(usageRollups).values({
    userId: input.userId,
    bucketDate,
    capability: input.capability,
    provider: input.provider,
    model: input.model,
    requestCount: 1,
    inputTokens,
    outputTokens,
    audioInputTokens,
    audioOutputTokens,
    totalTokens,
    estimatedCostUsdMicros
  }).onConflictDoUpdate({
    target: [
      usageRollups.userId,
      usageRollups.bucketDate,
      usageRollups.capability,
      usageRollups.provider,
      usageRollups.model
    ],
    set: {
      requestCount: sql`${usageRollups.requestCount} + 1`,
      inputTokens: sql`${usageRollups.inputTokens} + ${inputTokens}`,
      outputTokens: sql`${usageRollups.outputTokens} + ${outputTokens}`,
      audioInputTokens: sql`${usageRollups.audioInputTokens} + ${audioInputTokens}`,
      audioOutputTokens: sql`${usageRollups.audioOutputTokens} + ${audioOutputTokens}`,
      totalTokens: sql`${usageRollups.totalTokens} + ${totalTokens}`,
      estimatedCostUsdMicros: sql`${usageRollups.estimatedCostUsdMicros} + ${estimatedCostUsdMicros}`
    }
  });

  return event;
}

export function buildSafetyIdentifier(userId: string) {
  return `orviko_user_${userId}`;
}

function estimateCostUsdMicros(input: {
  capability: UsageCapability;
  inputTokens: number;
  outputTokens: number;
  audioInputTokens: number;
  audioOutputTokens: number;
}) {
  const textInputRate = input.capability === "realtime_session"
    ? env.OPENAI_REALTIME_TEXT_INPUT_USD_PER_1M
    : env.OPENAI_TEXT_INPUT_USD_PER_1M;
  const textOutputRate = input.capability === "realtime_session"
    ? env.OPENAI_REALTIME_TEXT_OUTPUT_USD_PER_1M
    : env.OPENAI_TEXT_OUTPUT_USD_PER_1M;
  const usd = (input.inputTokens / 1_000_000) * textInputRate
    + (input.outputTokens / 1_000_000) * textOutputRate
    + (input.audioInputTokens / 1_000_000) * env.OPENAI_REALTIME_AUDIO_INPUT_USD_PER_1M
    + (input.audioOutputTokens / 1_000_000) * env.OPENAI_REALTIME_AUDIO_OUTPUT_USD_PER_1M;

  return Math.max(0, Math.round(usd * 1_000_000));
}

function positiveInteger(value: unknown) {
  const number = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.max(0, number);
}
