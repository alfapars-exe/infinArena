import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { quizSessions } from "@/lib/db/schema";
import { withAuth } from "@/lib/errors/with-auth";

export const POST = withAuth(async (_request: NextRequest, _session, params) => {
  const pin = params?.pin;
  if (!pin) {
    return NextResponse.json({ error: "PIN is required" }, { status: 400 });
  }

  const dbAny: any = db;

  const [existing] = await dbAny
    .select()
    .from(quizSessions)
    .where(eq(quizSessions.pin, pin));

  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (existing.status === "completed") {
    return NextResponse.json(
      { error: "This quiz has already ended" },
      { status: 410 }
    );
  }

  await dbAny
    .update(quizSessions)
    .set({ isLive: true })
    .where(
      and(
        eq(quizSessions.pin, pin),
        eq(quizSessions.status, "lobby")
      )
    );

  const [updated] = await dbAny
    .select()
    .from(quizSessions)
    .where(eq(quizSessions.pin, pin));

  return NextResponse.json({
    sessionId: updated.id,
    pin: updated.pin,
    status: updated.status,
    isLive: updated.isLive,
  });
}, "Session Go Live");
