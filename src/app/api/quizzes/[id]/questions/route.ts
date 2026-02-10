import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { questions, answerChoices } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { questionSchema } from "@/lib/validators";
import { ensureDbMigrations } from "@/lib/db/migrations";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  await ensureDbMigrations();

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const quizId = parseInt(params.id);
  const body = await request.json();
  const parsed = questionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors },
      { status: 400 }
    );
  }

  const existing = await db
    .select()
    .from(questions)
    .where(eq(questions.quizId, quizId));
  const orderIndex = existing.length;

  const requiresCorrectChoice =
    parsed.data.questionType === "multiple_choice" ||
    parsed.data.questionType === "true_false" ||
    parsed.data.questionType === "multi_select";
  const hasCorrect = parsed.data.choices.some((c) => c.isCorrect);
  if (requiresCorrectChoice && !hasCorrect) {
    return NextResponse.json(
      { error: "At least one choice must be correct" },
      { status: 400 }
    );
  }

  const [question] = await db
    .insert(questions)
    .values({
      quizId,
      questionText: parsed.data.questionText,
      questionType: parsed.data.questionType,
      orderIndex,
      timeLimitSeconds: parsed.data.timeLimitSeconds,
      basePoints: parsed.data.basePoints,
      deductionPoints: parsed.data.deductionPoints,
      deductionInterval: parsed.data.deductionInterval,
      mediaUrl: parsed.data.mediaUrl || null,
      backgroundUrl: parsed.data.backgroundUrl || null,
    })
    .returning();

  const choices = await Promise.all(
    parsed.data.choices.map(async (c, i) => {
      const [choice] = await db
        .insert(answerChoices)
        .values({
          questionId: question.id,
          choiceText: c.choiceText,
          isCorrect: c.isCorrect,
          orderIndex: i,
        })
        .returning();
      return choice;
    })
  );

  return NextResponse.json({ ...question, choices }, { status: 201 });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  await ensureDbMigrations();

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { questionId, ...data } = body;
  const parsed = questionSchema.safeParse(data);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors },
      { status: 400 }
    );
  }

  await db
    .update(questions)
    .set({
      questionText: parsed.data.questionText,
      questionType: parsed.data.questionType,
      timeLimitSeconds: parsed.data.timeLimitSeconds,
      basePoints: parsed.data.basePoints,
      deductionPoints: parsed.data.deductionPoints,
      deductionInterval: parsed.data.deductionInterval,
      mediaUrl: parsed.data.mediaUrl || null,
      backgroundUrl: parsed.data.backgroundUrl || null,
    })
    .where(eq(questions.id, questionId));

  await db.delete(answerChoices).where(eq(answerChoices.questionId, questionId));

  const choices = await Promise.all(
    parsed.data.choices.map(async (c, i) => {
      const [choice] = await db
        .insert(answerChoices)
        .values({
          questionId,
          choiceText: c.choiceText,
          isCorrect: c.isCorrect,
          orderIndex: i,
        })
        .returning();
      return choice;
    })
  );

  const [updated] = await db
    .select()
    .from(questions)
    .where(eq(questions.id, questionId));

  return NextResponse.json({ ...updated, choices });
}

export async function DELETE(request: NextRequest) {
  await ensureDbMigrations();

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const questionId = parseInt(searchParams.get("questionId") || "0");

  if (!questionId) {
    return NextResponse.json(
      { error: "questionId required" },
      { status: 400 }
    );
  }

  await db.delete(questions).where(eq(questions.id, questionId));

  return NextResponse.json({ success: true });
}


