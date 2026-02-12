import { db, client, isSqlite } from "./index";
import { admins } from "./schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Starting database initialization...");
  
  // Create tables ONLY - DO NOT DROP (preserve all quiz data)
  const statements = [
    `CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE TABLE IF NOT EXISTS quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL REFERENCES admins(id),
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      custom_slug TEXT UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      question_type TEXT NOT NULL DEFAULT 'multiple_choice',
      order_index INTEGER NOT NULL,
      time_limit_seconds INTEGER NOT NULL DEFAULT 20,
      base_points INTEGER NOT NULL DEFAULT 1000,
      deduction_points INTEGER NOT NULL DEFAULT 50,
      deduction_interval INTEGER NOT NULL DEFAULT 1,
      media_url TEXT,
      background_url TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS answer_choices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      choice_text TEXT NOT NULL,
      is_correct INTEGER NOT NULL DEFAULT 0,
      order_index INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS quiz_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL REFERENCES quizzes(id),
      pin TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'lobby',
      current_question_index INTEGER DEFAULT -1,
      is_live INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
      nickname TEXT NOT NULL,
      avatar TEXT,
      socket_id TEXT,
      total_score INTEGER NOT NULL DEFAULT 0,
      is_connected INTEGER NOT NULL DEFAULT 1,
      joined_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE TABLE IF NOT EXISTS player_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id),
      session_id INTEGER NOT NULL REFERENCES quiz_sessions(id),
      choice_id INTEGER REFERENCES answer_choices(id),
      is_correct INTEGER NOT NULL DEFAULT 0,
      response_time_ms INTEGER NOT NULL,
      points_awarded INTEGER NOT NULL DEFAULT 0,
      answered_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
  ];

  const dbAny: any = db;
  const clientAny: any = client;

  if (isSqlite) {
    await clientAny.execute("PRAGMA foreign_keys = OFF");
    for (const sql of statements) {
      try {
        await clientAny.execute(sql);
      } catch {
        // Ignore table already exists errors
        console.log("Note: Table create statement completed (may already exist)");
      }
    }
    await clientAny.execute("PRAGMA foreign_keys = ON");
  } else {
    console.log("Postgres detected: skipping SQLite table bootstrap");
  }

  // Ensure admin user exists (create only if not present)
  try {
    const existing = await dbAny
      .select()
      .from(admins)
      .where(eq(admins.username, "admin"));

    if (existing.length === 0) {
      const hash = bcrypt.hashSync("inFina2026!!**", 10);
      await dbAny.insert(admins).values({
        username: "admin",
        email: "admin@infinarena.com",
        passwordHash: hash,
        name: "Admin",
      });
      console.log("✓ Admin user created: admin / inFina2026!!**");
    } else {
      console.log("✓ Admin user already exists - no changes made");
    }
  } catch (err) {
    console.error("Error during seed:", err);
  }

  console.log("✓ Database initialization completed - all quiz data preserved!");
}

seed().catch(console.error);


