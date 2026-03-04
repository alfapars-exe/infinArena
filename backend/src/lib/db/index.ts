import { createClient } from "@libsql/client";
import { drizzle as drizzleSqlite } from "drizzle-orm/libsql";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { resolveDatabaseUrl } from "@/lib/storage";
import { mkdir } from "fs/promises";
import path from "path";
import postgres from "postgres";
import * as schema from "./schema";

const databaseUrl = resolveDatabaseUrl();

const isSqlite = databaseUrl.startsWith("file:");

async function ensureDatabaseDirectory(url: string): Promise<void> {
  if (!url.startsWith("file:")) {
    return;
  }

  const rawPath = url.slice("file:".length);
  if (!rawPath) {
    return;
  }

  const dbPath = path.isAbsolute(rawPath) ? rawPath : path.join(process.cwd(), rawPath);
  await mkdir(path.dirname(dbPath), { recursive: true });
}

const databaseDirectoryReadyPromise = isSqlite
  ? ensureDatabaseDirectory(databaseUrl)
  : Promise.resolve();

export function ensureDatabaseDirectoryReady(): Promise<void> {
  return databaseDirectoryReadyPromise;
}

const client = isSqlite
  ? createClient({ url: databaseUrl })
  : postgres(databaseUrl, { ssl: "require" });

const dbInstance = isSqlite
  ? drizzleSqlite(client as ReturnType<typeof createClient>, { schema })
  : drizzlePostgres(client as ReturnType<typeof postgres>, { schema });

export type DatabaseClient = ReturnType<typeof drizzleSqlite>;
export const db: DatabaseClient = dbInstance as unknown as DatabaseClient;
export { client, isSqlite };

/** Raw SQL expression for current timestamp, compatible with SQLite and Postgres. */
export const nowSql = isSqlite ? sql`(unixepoch())` : sql`NOW()`;
