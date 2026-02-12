import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/errors/with-auth";
import { getQuizResults } from "@/lib/services/quiz.service";

export const GET = withAuth(async (_request: NextRequest, _session, params) => {
  const quizId = parseInt(params!.id);
  const results = await getQuizResults(quizId);
  return NextResponse.json(results);
}, "Quiz Results");
