import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, nowSql } from "@/lib/db";
import { admins, quizzes, questions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { quizSchema } from "@/lib/validators";
import { ensureDbMigrations } from "@/lib/db/migrations";
import type { Session } from "next-auth";

async function resolveAdminId(session: Session): Promise<number | null> {
  const rawId = session.user?.id;
  if (rawId) {
    const parsedId = Number.parseInt(rawId, 10);
    if (!Number.isNaN(parsedId)) {
      return parsedId;
    }
  }

  const email = session.user?.email;
  if (!email) {
    return null;
  }

  const [adminByEmail] = await db
    .select({ id: admins.id })
    .from(admins)
    .where(eq(admins.email, email));

  return adminByEmail?.id ?? null;
}

export async function GET() {
  await ensureDbMigrations();

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbAny: any = db;

  const adminId = await resolveAdminId(session);
  if (!adminId) {
    return NextResponse.json(
      { error: "Admin account not found for current session" },
      { status: 401 }
    );
  }

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

  try {
    const body = await request.json();
    const parsed = quizSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors },
        { status: 400 }
      );
    }

    const adminId = await resolveAdminId(session);
    if (!adminId) {
      return NextResponse.json(
        { error: "Admin account not found for current session" },
        { status: 401 }
      );
    }

    const [quiz] = await dbAny
      .insert(quizzes)
      .values({
        adminId,
        title: parsed.data.title,
        description: parsed.data.description || null,
        customSlug: parsed.data.customSlug || null,
        createdAt: nowSql,
        updatedAt: nowSql,
      })
      .returning();

    return NextResponse.json(quiz, { status: 201 });
  } catch (err) {
    console.error("quiz create error:", err);
    return NextResponse.json(
      { error: "Failed to create quiz" },
      { status: 500 }
    );
  }
}

