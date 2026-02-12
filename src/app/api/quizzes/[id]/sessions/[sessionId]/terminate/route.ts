import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { and, eq } from "drizzle-orm";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { players, quizSessions } from "@/lib/db/schema";
import { ensureDbMigrations } from "@/lib/db/migrations";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; sessionId: string } }
) {
  await ensureDbMigrations();

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbAny: any = db;

  const quizId = Number.parseInt(params.id, 10);
  const sessionId = Number.parseInt(params.sessionId, 10);

  if (Number.isNaN(quizId) || Number.isNaN(sessionId)) {
    return NextResponse.json({ error: "Invalid identifiers" }, { status: 400 });
  }

  const [existingSession] = await dbAny
    .select()
    .from(quizSessions)
    .where(and(eq(quizSessions.id, sessionId), eq(quizSessions.quizId, quizId)));

  if (!existingSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (existingSession.status === "completed") {
    return NextResponse.json({
      session: existingSession,
      alreadyCompleted: true,
    });
  }

  await dbAny
    .update(quizSessions)
    .set({
      status: "completed",
      isLive: false,
      completedAt: new Date(),
    })
    .where(eq(quizSessions.id, sessionId));

  await dbAny
    .update(players)
    .set({
      isConnected: false,
      socketId: null,
    })
    .where(eq(players.sessionId, sessionId));

  const [updatedSession] = await dbAny
    .select()
    .from(quizSessions)
    .where(eq(quizSessions.id, sessionId));

  return NextResponse.json({ session: updatedSession });
}
