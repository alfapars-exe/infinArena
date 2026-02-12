import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { quizzes, questions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { quizSchema } from "@/lib/validators";
import { ensureDbMigrations } from "@/lib/db/migrations";

export async function GET() {
  await ensureDbMigrations();

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbAny: any = db;

  const adminId = parseInt(session.user?.id as string);
  const allQuizzes = await dbAny
    .select()
    .from(quizzes)
    .where(eq(quizzes.adminId, adminId))
    .orderBy(desc(quizzes.updatedAt));

  const result = await Promise.all(
    (allQuizzes as any[]).map(async (quiz: any) => {
      const qs = await dbAny
        .select()
        .from(questions)
        .where(eq(questions.quizId, quiz.id));
      return { ...quiz, questionCount: qs.length };
    })
  );

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  await ensureDbMigrations();

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbAny: any = db;

  const body = await request.json();
  const parsed = quizSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors },
      { status: 400 }
    );
  }

  const adminId = parseInt(session.user?.id as string);
  const [quiz] = await dbAny
    .insert(quizzes)
    .values({
      adminId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      customSlug: parsed.data.customSlug || null,
    })
    .returning();

  return NextResponse.json(quiz, { status: 201 });
}


