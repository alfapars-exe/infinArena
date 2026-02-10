import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { quizzes, questions, answerChoices } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
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

  const quizId = parseInt(params.id);
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, quizId));

  if (!quiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  const quizQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.quizId, quizId))
    .orderBy(asc(questions.orderIndex));

  const questionsWithChoices = await Promise.all(
    quizQuestions.map(async (q) => {
      const choices = await db
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

  const quizId = parseInt(params.id);
  const body = await request.json();
  const parsed = quizSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors },
      { status: 400 }
    );
  }

  const [updated] = await db
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
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const quizId = parseInt(params.id);
  await db.delete(quizzes).where(eq(quizzes.id, quizId));

  return NextResponse.json({ success: true });
}


