import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { quizSessions, quizzes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: { pin: string } }
) {
  const { pin } = params;

  const [session] = await db
    .select()
    .from(quizSessions)
    .where(eq(quizSessions.pin, pin));

  if (!session) {
    return NextResponse.json(
      { error: "Invalid PIN code" },
      { status: 404 }
    );
  }

  if (session.status === "completed") {
    return NextResponse.json(
      { error: "This quiz has already ended" },
      { status: 410 }
    );
  }

  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, session.quizId));

  return NextResponse.json({
    sessionId: session.id,
    status: session.status,
    quizTitle: quiz?.title || "Quiz",
    pin: session.pin,
    isLive: session.isLive,
  });
}


