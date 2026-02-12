import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/errors/with-auth";
import { publishQuiz } from "@/lib/services/quiz.service";

export const POST = withAuth(async (_request: NextRequest, _session, params) => {
  const quizId = parseInt(params!.id);
  const result = await publishQuiz(quizId);
  return NextResponse.json(result);
}, "Quiz Publish");
