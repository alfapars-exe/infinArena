import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, nowSql } from "@/lib/db";
import { quizzes, quizSessions, questions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateUniquePin } from "@/lib/pin-generator";
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
  const dbAny: any = db;
  const [quiz] = await dbAny
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, quizId));

  if (!quiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  const qs = await dbAny
    .select()
    .from(questions)
    .where(eq(questions.quizId, quizId));

  if (qs.length === 0) {
    return NextResponse.json(
      { error: "Quiz must have at least one question" },
      { status: 400 }
    );
  }

  await dbAny
    .update(quizzes)
    .set({ status: "published", updatedAt: nowSql })
    .where(eq(quizzes.id, quizId));

  const pin = await generateUniquePin();
  const [quizSession] = await dbAny
    .insert(quizSessions)
    .values({
      quizId,
      pin,
      createdAt: nowSql,
    })
    .returning();

  return NextResponse.json({
    session: quizSession,
    pin,
    url: `/play/${pin}`,
  });
}


