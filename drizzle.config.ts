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
  if (envUrl) {
    return envUrl;
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
