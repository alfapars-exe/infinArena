import { createClient } from "@libsql/client";
import { drizzle as drizzleSqlite } from "drizzle-orm/libsql";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { resolveDatabaseUrl } from "@/lib/storage";
import fs from "fs";
import path from "path";
import postgres from "postgres";
import * as schema from "./schema";

const databaseUrl = resolveDatabaseUrl();

const isSqlite = databaseUrl.startsWith("file:");

function ensureDatabaseDirectory(url: string): void {
  if (!url.startsWith("file:")) {
    return;
  }

  const rawPath = url.slice("file:".length);
  if (!rawPath) {
    return;
  }

  const dbPath = path.isAbsolute(rawPath) ? rawPath : path.join(process.cwd(), rawPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

if (isSqlite) {
  ensureDatabaseDirectory(databaseUrl);
}

const client = isSqlite
  ? createClient({ url: databaseUrl })
  : postgres(databaseUrl, { ssl: "require" });

export const db = isSqlite
  ? drizzleSqlite(client as ReturnType<typeof createClient>, { schema })
  : drizzlePostgres(client as ReturnType<typeof postgres>, { schema });

export { client, isSqlite };
