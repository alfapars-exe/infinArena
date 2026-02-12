import { and, eq } from "drizzle-orm";
import { db, nowSql } from "@/lib/db";
import { ensureDbMigrations } from "@/lib/db/migrations";
import { players, quizSessions } from "@/lib/db/schema";
import type { QuizSessionRecord } from "@/lib/domain/session.types";

interface SessionAdminError {
  ok: false;
  status: 404;
  message: string;
}

interface SessionAdminSuccess {
  ok: true;
  data: {
    session: QuizSessionRecord;
    alreadyCompleted: boolean;
  };
}

export type TerminateSessionResult = SessionAdminSuccess | SessionAdminError;

export async function terminateSession(
  quizId: number,
  sessionId: number
): Promise<TerminateSessionResult> {
  await ensureDbMigrations();

  const [existingSession] = await db
    .select()
    .from(quizSessions)
    .where(and(eq(quizSessions.id, sessionId), eq(quizSessions.quizId, quizId)));

  if (!existingSession) {
    return { ok: false, status: 404, message: "Session not found" };
  }

  if (existingSession.status === "completed") {
    return {
      ok: true,
      data: {
        session: existingSession,
        alreadyCompleted: true,
      },
    };
  }

  await db
    .update(quizSessions)
    .set({
      status: "completed",
      isLive: false,
      completedAt: nowSql,
    })
    .where(eq(quizSessions.id, sessionId));

  await db
    .update(players)
    .set({
      isConnected: false,
      socketId: null,
    })
    .where(eq(players.sessionId, sessionId));

  const [updatedSession] = await db
    .select()
    .from(quizSessions)
    .where(eq(quizSessions.id, sessionId));

  return {
    ok: true,
    data: {
      session: updatedSession,
      alreadyCompleted: false,
    },
  };
}

