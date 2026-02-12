import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { resolveDatabaseUrl } from "@/lib/storage";
import fs from "fs";
import path from "path";
import * as schema from "./schema";

const databaseUrl = resolveDatabaseUrl();

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

ensureDatabaseDirectory(databaseUrl);

const client = createClient({
  url: databaseUrl,
});

export const db = drizzle(client, { schema });
export { client };
