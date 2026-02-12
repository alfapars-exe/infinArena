import { client, isSqlite } from "./index";

let migrationPromise: Promise<void> | null = null;

function isLibsqlClient(value: unknown): value is { execute: (arg: { sql: string; args?: unknown[] }) => Promise<{ rows: { name?: string }[] }> } {
  return typeof (value as { execute?: unknown })?.execute === "function";
}

async function query(sqlText: string, args: unknown[] = []) {
  if (isLibsqlClient(client)) {
    return client.execute({ sql: sqlText, args });
  }
  return (client as { unsafe: (sql: string, args?: unknown[]) => Promise<unknown[]> }).unsafe(
    sqlText,
    args
  );
}

async function hasColumn(table: string, column: string): Promise<boolean> {
  if (isSqlite) {
    const result = await query(`PRAGMA table_info(${table})`);
    return (result as { rows: { name?: string }[] }).rows.some((row) => row.name === column);
  }

  const result = await query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2",
    [table, column]
  );
  return Array.isArray(result) ? result.length > 0 : false;
}

async function tableExists(table: string): Promise<boolean> {
  if (isSqlite) {
    const result = await query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
      [table]
    );
    return (result as { rows: { name?: string }[] }).rows.length > 0;
  }

  const result = (await query(
    "SELECT to_regclass($1) as name",
    [`public.${table}`]
  )) as any[];
  return Array.isArray(result) ? Boolean(result[0]?.name) : false;
}

async function runMigrations() {
  const hasQuestions = await tableExists("questions");
  if (!hasQuestions) {
    return;
  }

  if (isSqlite) {
    if (!(await hasColumn("questions", "background_url"))) {
      await query("ALTER TABLE questions ADD COLUMN background_url TEXT");
    }
    return;
  }

  await query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS background_url TEXT");
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



