import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  quizzes,
  questions,
  answerChoices,
  quizSessions,
  players,
  playerAnswers,
} from "@/lib/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { quizSchema } from "@/lib/validators";
import { ensureDbMigrations } from "@/lib/db/migrations";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  await ensureDbMigrations();

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbAny: any = db;

  const quizId = parseInt(params.id);
  const [quiz] = await dbAny
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, quizId));

  if (!quiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  const quizQuestions = await dbAny
    .select()
    .from(questions)
    .where(eq(questions.quizId, quizId))
    .orderBy(asc(questions.orderIndex));

  const questionsWithChoices = await Promise.all(
    (quizQuestions as any[]).map(async (q: any) => {
      const choices = await dbAny
        .select()
        .from(answerChoices)
        .where(eq(answerChoices.questionId, q.id))
        .orderBy(asc(answerChoices.orderIndex));
      return { ...q, choices };
    })
  );

  return NextResponse.json({ ...quiz, questions: questionsWithChoices });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbAny: any = db;

  const quizId = parseInt(params.id);
  const body = await request.json();
  const parsed = quizSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors },
      { status: 400 }
    );
  }

  const [updated] = await dbAny
    .update(quizzes)
    .set({
      title: parsed.data.title,
      description: parsed.data.description || null,
      customSlug: parsed.data.customSlug || null,
      updatedAt: new Date(),
    })
    .where(eq(quizzes.id, quizId))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  await ensureDbMigrations();

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbAny: any = db;

  const quizId = parseInt(params.id);
  await dbAny.transaction(async (tx: any) => {
    const sessionRows = (await tx
      .select({ id: quizSessions.id })
      .from(quizSessions)
      .where(eq(quizSessions.quizId, quizId))) as any[];
    const sessionIds = sessionRows.map((s: any) => s.id);

    const questionRows = (await tx
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.quizId, quizId))) as any[];
    const questionIds = questionRows.map((q: any) => q.id);

    if (questionIds.length > 0) {
      await tx
        .delete(playerAnswers)
        .where(inArray(playerAnswers.questionId, questionIds));
    }

    if (sessionIds.length > 0) {
      await tx
        .delete(playerAnswers)
        .where(inArray(playerAnswers.sessionId, sessionIds));
      await tx.delete(players).where(inArray(players.sessionId, sessionIds));
      await tx
        .delete(quizSessions)
        .where(inArray(quizSessions.id, sessionIds));
    }

    await tx.delete(quizzes).where(eq(quizzes.id, quizId));
  });

  return NextResponse.json({ success: true });
}


