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
config(envPath ? { path: envPath, override: true } : { override: true });

export function parseBooleanEnv(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.trim().toLowerCase() === "true";
  }
  return false;
}

const booleanEnvSchema = z.preprocess(parseBooleanEnv, z.boolean()).default(false);

const envSchema = z.object({
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().default("postgres://postgres:postgres@127.0.0.1:5432/orviko_dev"),
  PROFILE_DOCUMENT_STORAGE_DIR: z.string().default("storage/profile-documents"),
  FRONTEND_BASE_URL: z.string().url().default("http://127.0.0.1:5174"),
  SESSION_SECRET: z.string().min(16).default("orviko-dev-session-secret-change-me"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  MIDTRANS_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  MIDTRANS_IS_PRODUCTION: booleanEnvSchema,
  MIDTRANS_SERVER_KEY: z.string().optional(),
  VITE_MIDTRANS_CLIENT_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_TEXT_MODEL: z.string().default("gpt-5-mini"),
  OPENAI_REALTIME_MODEL: z.string().default("gpt-realtime-mini")
});

export const env = envSchema.parse(process.env);
