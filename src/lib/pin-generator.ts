import { db } from "./db";
import { quizSessions } from "./db/schema";
import { eq } from "drizzle-orm";

export function generatePin(): string {
  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  return pin;
}

export async function generateUniquePin(): Promise<string> {
  let pin: string;
  let attempts = 0;
  do {
    pin = generatePin();
    const existing = await db
      .select()
      .from(quizSessions)
      .where(eq(quizSessions.pin, pin));
    if (existing.length === 0) return pin;
    attempts++;
  } while (attempts < 100);
  throw new Error("Could not generate unique PIN");
}


