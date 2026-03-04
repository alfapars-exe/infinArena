import path from "path";
import type { Config } from "drizzle-kit";

function isHuggingFaceSpace(): boolean {
  return Boolean(
    process.env.SPACE_ID ||
      process.env.SPACE_HOST ||
      process.env.SPACE_REPO_NAME ||
      process.env.HF_SPACE_ID
  );
}

function resolveStorageDir(): string {
  const configured = process.env.APP_STORAGE_DIR?.trim();
  const rawDir =
    configured && configured.length > 0
      ? configured
      : isHuggingFaceSpace()
      ? "/data/infinarena"
      : "./data";

  return path.isAbsolute(rawDir) ? rawDir : path.join(process.cwd(), rawDir);
}

function resolveDatabaseUrl(): string {
  const envUrl = process.env.DATABASE_URL?.trim();
  if (envUrl) return envUrl;

  const supabaseUrl = process.env.SUPABASE_DATABASE_URL?.trim();
  if (supabaseUrl) return supabaseUrl;

  const supabaseHost = process.env.SUPABASE_DB_HOST?.trim();
  const supabasePassword = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (supabaseHost && supabasePassword) {
    const supabaseUser = process.env.SUPABASE_DB_USER?.trim() || "postgres";
    const supabasePort = process.env.SUPABASE_DB_PORT?.trim() || "5432";
    const supabaseDb = process.env.SUPABASE_DB_NAME?.trim() || "postgres";
    return `postgresql://${supabaseUser}:${encodeURIComponent(supabasePassword)}@${supabaseHost}:${supabasePort}/${supabaseDb}`;
  }

  if (isHuggingFaceSpace() || process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL (or SUPABASE_DATABASE_URL / SUPABASE_DB_HOST+SUPABASE_DB_PASSWORD) is required in production/Hugging Face Space"
    );
  }

  return `file:${path.join(resolveStorageDir(), "quiz.db")}`;
}

function resolveDialect(): "sqlite" | "postgresql" {
  const url = resolveDatabaseUrl();
  return url.startsWith("file:") ? "sqlite" : "postgresql";
}

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: resolveDialect(),
  dbCredentials: {
    url: resolveDatabaseUrl(),
  },
} satisfies Config;
