import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  quizSessions,
  players,
  playerAnswers,
  questions,
  answerChoices,
} from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { ensureDbMigrations } from "@/lib/db/migrations";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  await ensureDbMigrations();

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbAny: any = db;

  const quizId = parseInt(params.id);

  const sessions = (await dbAny
    .select()
    .from(quizSessions)
    .where(eq(quizSessions.quizId, quizId))
    .orderBy(desc(quizSessions.createdAt))) as any[];

  const results = await Promise.all(
    sessions.map(async (s: any) => {
      const sessionPlayers = (await dbAny
        .select()
        .from(players)
        .where(eq(players.sessionId, s.id))
        .orderBy(desc(players.totalScore))) as any[];

      const playerDetails = await Promise.all(
        sessionPlayers.map(async (p: any) => {
          const answers = (await dbAny
            .select()
            .from(playerAnswers)
            .where(eq(playerAnswers.playerId, p.id))) as any[];

          const answersWithDetails = await Promise.all(
            answers.map(async (a: any) => {
              const [question] = await dbAny
                .select()
                .from(questions)
                .where(eq(questions.id, a.questionId));
              const [choice] = a.choiceId
                ? await dbAny
                    .select()
                    .from(answerChoices)
                    .where(eq(answerChoices.id, a.choiceId))
                : [null];

              return {
                ...a,
                questionText: question?.questionText,
                choiceText: choice?.choiceText || "No answer",
              };
            })
          );

          return {
            ...p,
            answers: answersWithDetails,
            correctCount: answers.filter((a) => a.isCorrect).length,
            totalQuestions: answers.length,
          };
        })
      );

      return {
        ...s,
        players: playerDetails,
      };
    })
  );

  return NextResponse.json(results);
}


