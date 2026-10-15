import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Same .env files as Next.js (.env.local, .env.development.local, ...);
// variables already in the environment win.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

// Migrations need a direct connection; Neon's pooled URL is the fallback.
// `generate` needs no database, so the credentials are optional here.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  ...(url ? { dbCredentials: { url } } : {}),
  strict: true,
  verbose: true,
});
