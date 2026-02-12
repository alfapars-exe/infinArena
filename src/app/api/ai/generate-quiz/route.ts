import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/errors/with-auth";
import { generateQuiz } from "@/lib/services/ai.service";

export const POST = withAuth(async (request: NextRequest, session) => {
  const body = await request.json();
  const { topic, difficulty, numQuestions, model, language, timeLimitSeconds } = body;

  const result = await generateQuiz({
    topic,
    difficulty,
    numQuestions,
    model,
    language,
    timeLimitSeconds,
    userId: session.userId,
  });

  const status = result.questionsCreated < result.totalRequested ? 201 : 200;
  return NextResponse.json(result, { status });
}, "AI Generate");
