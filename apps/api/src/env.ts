import { z } from "zod";
import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env"),
  path.resolve(process.cwd(), "..", "..", ".env")
];

const envPath = envCandidates.find((candidate) => existsSync(candidate));
config(envPath ? { path: envPath, override: false } : { override: false });

export function parseBooleanEnv(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.trim().toLowerCase() === "true";
  }
  return false;
}

const envSchema = z.object({
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().default("postgres://postgres:postgres@127.0.0.1:5432/orviko_dev"),
  PROFILE_DOCUMENT_STORAGE_DIR: z.string().default("storage/profile-documents"),
  FRONTEND_BASE_URL: z.string().url().default("http://127.0.0.1:5174"),
  CORS_ALLOWED_ORIGINS: z.string().default("http://127.0.0.1:5174,http://localhost:5174,http://127.0.0.1:5175,http://localhost:5175"),
  SESSION_SECRET: z.string().min(16).default("orviko-dev-session-secret-change-me"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  LYNK_PROFILE_URL: z.string().url().default("https://lynk.id/rizki-09"),
  LYNK_MINI_URL: z.string().url().optional(),
  LYNK_STARTER_URL: z.string().url().optional(),
  LYNK_PRO_URL: z.string().url().optional(),
  LYNK_MINI_PRODUCT_ID: z.string().min(1).optional(),
  LYNK_STARTER_PRODUCT_ID: z.string().min(1).optional(),
  LYNK_PRO_PRODUCT_ID: z.string().min(1).optional(),
  LYNK_WEBHOOK_SECRET: z.string().optional(),
  LYNK_WEBHOOK_PROVIDER_AUTH_CONFIRMED: z.preprocess(parseBooleanEnv, z.boolean()).default(false),
  PAYMENT_INTENT_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_TEXT_MODEL: z.string().default("gpt-5-mini"),
  OPENAI_REALTIME_MODEL: z.string().default("gpt-realtime-mini"),
  OPENAI_KILL_SWITCH: z.preprocess(parseBooleanEnv, z.boolean()).default(false),
  OPENAI_TEXT_INPUT_USD_PER_1M: z.coerce.number().min(0).default(0),
  OPENAI_TEXT_OUTPUT_USD_PER_1M: z.coerce.number().min(0).default(0),
  OPENAI_REALTIME_TEXT_INPUT_USD_PER_1M: z.coerce.number().min(0).default(0),
  OPENAI_REALTIME_TEXT_OUTPUT_USD_PER_1M: z.coerce.number().min(0).default(0),
  OPENAI_REALTIME_AUDIO_INPUT_USD_PER_1M: z.coerce.number().min(0).default(0),
  OPENAI_REALTIME_AUDIO_OUTPUT_USD_PER_1M: z.coerce.number().min(0).default(0),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(10000).default(180),
  AI_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(1000).default(20),
  PAYMENT_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(1000).default(30),
  MAX_CONCURRENT_LIVE_MEETINGS: z.coerce.number().int().min(1).max(10).default(1),
  MAX_LIVE_MEETING_MINUTES: z.coerce.number().int().min(5).max(480).default(90),
  REALTIME_CLIENT_SECRET_LIMIT_PER_SESSION: z.coerce.number().int().min(1).max(20).default(3),
  PROFILE_DOCUMENT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(365),
  LIVE_TRANSCRIPT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(180),
  PAYMENT_EVENT_RETENTION_DAYS: z.coerce.number().int().min(30).max(3650).default(2555),
  ACCOUNT_DELETION_JOB_RETENTION_DAYS: z.coerce.number().int().min(30).max(3650).default(2555)
  ,
  OPERATIONS_TOKEN: z.string().min(24).optional(),
  AI_JOB_STUCK_MINUTES: z.coerce.number().int().min(5).max(1440).default(20)
});

const parsedEnv = envSchema.parse(process.env);

const requiredProductionKeys = [
  "DATABASE_URL",
  "FRONTEND_BASE_URL",
  "CORS_ALLOWED_ORIGINS",
  "SESSION_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "LYNK_WEBHOOK_SECRET",
  "LYNK_MINI_URL",
  "LYNK_STARTER_URL",
  "LYNK_PRO_URL",
  "LYNK_MINI_PRODUCT_ID",
  "LYNK_STARTER_PRODUCT_ID",
  "LYNK_PRO_PRODUCT_ID",
  "OPENAI_API_KEY",
  "OPERATIONS_TOKEN"
] as const;

if (parsedEnv.NODE_ENV === "production") {
  const missingKeys = requiredProductionKeys.filter((key) => !process.env[key]);
  const unsafeDefaults = [
    parsedEnv.DATABASE_URL.includes("/orviko_dev") ? "DATABASE_URL" : "",
    parsedEnv.FRONTEND_BASE_URL.includes("127.0.0.1") || parsedEnv.FRONTEND_BASE_URL.includes("localhost") ? "FRONTEND_BASE_URL" : "",
    parsedEnv.SESSION_SECRET === "orviko-dev-session-secret-change-me" ? "SESSION_SECRET" : "",
    !parsedEnv.LYNK_WEBHOOK_PROVIDER_AUTH_CONFIRMED ? "LYNK_WEBHOOK_PROVIDER_AUTH_CONFIRMED" : "",
    /^postgres(?:ql)?:\/\/postgres:/i.test(parsedEnv.DATABASE_URL) ? "DATABASE_URL_APP_ROLE" : ""
  ].filter(Boolean);

  const invalidKeys = Array.from(new Set([...missingKeys, ...unsafeDefaults]));
  if (invalidKeys.length > 0) {
    throw new Error(`Production environment is missing or using unsafe defaults: ${invalidKeys.join(", ")}`);
  }
}

export const env = parsedEnv;

export const corsAllowedOrigins = new Set(
  parsedEnv.CORS_ALLOWED_ORIGINS
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean)
);
