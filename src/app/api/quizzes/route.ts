import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/errors/with-auth";
import { getAllQuizzes, createQuiz, resolveAdminId } from "@/lib/services/quiz.service";

export const GET = withAuth(async (_request, session) => {
  const adminId = await resolveAdminId({ user: { id: String(session.userId), email: session.email } });
  if (!adminId) {
    return NextResponse.json({ error: "Admin account not found" }, { status: 401 });
  }
  const result = await getAllQuizzes(adminId);
  return NextResponse.json(result);
}, "Quizzes GET");

export const POST = withAuth(async (request: NextRequest, session) => {
  const body = await request.json();
  const adminId = await resolveAdminId({ user: { id: String(session.userId), email: session.email } });
  if (!adminId) {
    return NextResponse.json({ error: "Admin account not found" }, { status: 401 });
  }
  const quiz = await createQuiz(adminId, body);
  return NextResponse.json(quiz, { status: 201 });
}, "Quizzes POST");
