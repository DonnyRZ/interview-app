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
config(envPath ? { path: envPath } : undefined);

const envSchema = z.object({
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().default("postgres://postgres:postgres@127.0.0.1:5432/interview_app"),
  CV_STORAGE_DIR: z.string().default("storage/cvs"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_TEXT_MODEL: z.string().default("gpt-5-mini"),
  OPENAI_REALTIME_MODEL: z.string().default("gpt-realtime-mini")
});

export const env = envSchema.parse(process.env);
