import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ensureDbMigrations } from "@/lib/db/migrations";
import { quizSessions, quizzes } from "@/lib/db/schema";
import type {
  SessionLiveResponse,
  SessionLookupResponse,
} from "@/lib/domain/session.types";

interface SessionServiceError {
  ok: false;
  status: 404 | 410;
  message: string;
}

interface SessionLookupSuccess {
  ok: true;
  data: SessionLookupResponse;
}

interface SessionLiveSuccess {
  ok: true;
  data: SessionLiveResponse;
}

export type SessionLookupResult = SessionLookupSuccess | SessionServiceError;
export type SessionGoLiveResult = SessionLiveSuccess | SessionServiceError;

export async function getSessionByPin(pin: string): Promise<SessionLookupResult> {
  await ensureDbMigrations();

  const [row] = await db
    .select({
      id: quizSessions.id,
      status: quizSessions.status,
      pin: quizSessions.pin,
      isLive: quizSessions.isLive,
      quizTitle: quizzes.title,
    })
    .from(quizSessions)
    .leftJoin(quizzes, eq(quizzes.id, quizSessions.quizId))
    .where(eq(quizSessions.pin, pin));

  if (!row) {
    return { ok: false, status: 404, message: "Invalid PIN code" };
  }

  if (row.status === "completed") {
    return { ok: false, status: 410, message: "This quiz has already ended" };
  }

  return {
    ok: true,
    data: {
      sessionId: row.id,
      status: row.status,
      quizTitle: row.quizTitle || "Quiz",
      pin: row.pin,
      isLive: row.isLive,
    },
  };
}

export async function markSessionLiveByPin(pin: string): Promise<SessionGoLiveResult> {
  await ensureDbMigrations();

  const [existing] = await db
    .select({
      id: quizSessions.id,
      status: quizSessions.status,
      pin: quizSessions.pin,
      isLive: quizSessions.isLive,
    })
    .from(quizSessions)
    .where(eq(quizSessions.pin, pin));

  if (!existing) {
    return { ok: false, status: 404, message: "Session not found" };
  }

  if (existing.status === "completed") {
    return { ok: false, status: 410, message: "This quiz has already ended" };
  }

  await db
    .update(quizSessions)
    .set({ isLive: true })
    .where(and(eq(quizSessions.pin, pin), eq(quizSessions.status, "lobby")));

  const [updated] = await db
    .select({
      id: quizSessions.id,
      pin: quizSessions.pin,
      status: quizSessions.status,
      isLive: quizSessions.isLive,
    })
    .from(quizSessions)
    .where(eq(quizSessions.pin, pin));

  return {
    ok: true,
    data: {
      sessionId: updated.id,
      pin: updated.pin,
      status: updated.status,
      isLive: updated.isLive,
    },
  };
}

