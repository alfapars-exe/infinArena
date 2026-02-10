import { client } from "./index";

let migrationPromise: Promise<void> | null = null;

async function hasColumn(table: string, column: string): Promise<boolean> {
  const result = await client.execute(`PRAGMA table_info(${table})`);
  return result.rows.some((row) => row.name === column);
}

async function runMigrations() {
  if (!(await hasColumn("questions", "background_url"))) {
    await client.execute(`ALTER TABLE questions ADD COLUMN background_url TEXT`);
  }
}

export function ensureDbMigrations(): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = runMigrations().catch((err) => {
      migrationPromise = null;
      throw err;
    });
  }
  return migrationPromise;
}



