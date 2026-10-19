import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Loads KEY=VALUE lines from .env.local into process.env (existing variables win). Never prints values.
 * Next's own loader skips .env.local when NODE_ENV=test, which is what Vitest sets, so we read it directly.
 */
export function loadEnvLocal(dir = process.cwd()): void {
  const file = join(dir, ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || line.trimStart().startsWith("#")) continue;
    const [, key, raw] = match;
    const value = raw.replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[key] === undefined && value !== "") process.env[key] = value;
  }
}

export const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "TEST_USER_A_EMAIL",
  "TEST_USER_A_PASSWORD",
  "TEST_USER_B_EMAIL",
  "TEST_USER_B_PASSWORD",
] as const;
