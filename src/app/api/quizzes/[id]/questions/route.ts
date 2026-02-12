import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/errors/with-auth";
import { addQuestion, updateQuestion, deleteQuestion } from "@/lib/services/quiz.service";

export const POST = withAuth(async (request: NextRequest, _session, params) => {
  const quizId = parseInt(params!.id);
  const body = await request.json();
  const result = await addQuestion(quizId, body);
  return NextResponse.json(result, { status: 201 });
}, "Question POST");

export const PUT = withAuth(async (request: NextRequest) => {
  const body = await request.json();
  const { questionId, ...data } = body;
  const result = await updateQuestion(questionId, data);
  return NextResponse.json(result);
}, "Question PUT");

export const DELETE = withAuth(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const questionId = parseInt(searchParams.get("questionId") || "0");
  if (!questionId) {
    return NextResponse.json({ error: "questionId required" }, { status: 400 });
  }
  await deleteQuestion(questionId);
  return NextResponse.json({ success: true });
}, "Question DELETE");
