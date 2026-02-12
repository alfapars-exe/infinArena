import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/errors/with-auth";
import { getQuizWithQuestions, updateQuiz, deleteQuiz } from "@/lib/services/quiz.service";

export const GET = withAuth(async (_request, _session, params) => {
  const quizId = parseInt(params!.id);
  const quiz = await getQuizWithQuestions(quizId);
  return NextResponse.json(quiz);
}, "Quiz GET");

export const PUT = withAuth(async (request: NextRequest, _session, params) => {
  const quizId = parseInt(params!.id);
  const body = await request.json();
  const updated = await updateQuiz(quizId, body);
  return NextResponse.json(updated);
}, "Quiz PUT");

export const DELETE = withAuth(async (_request, _session, params) => {
  const quizId = parseInt(params!.id);
  await deleteQuiz(quizId);
  return NextResponse.json({ success: true });
}, "Quiz DELETE");
