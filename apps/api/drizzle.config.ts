import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./dist/db/schema/index.js",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:5432/orviko_dev"
  },
  strict: true,
  verbose: true
});
