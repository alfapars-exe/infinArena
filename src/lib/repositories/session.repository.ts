import { desc, eq, inArray } from "drizzle-orm";
import { db, nowSql } from "@/lib/db";
import {
  answerChoices,
  playerAnswers,
  players,
  questions,
  quizSessions,
} from "@/lib/db/schema";
import type {
  PlayerAnswerRecord,
  PlayerAnswerWithDetails,
  SessionPlayerResult,
} from "@/lib/domain/player.types";
import type { QuizSessionRecord } from "@/lib/domain/session.types";

export interface CreateSessionData {
  quizId: number;
  pin: string;
  isLive?: boolean;
}

export const sessionRepository = {
  async findById(id: number): Promise<QuizSessionRecord | null> {
    const [session] = await db.select().from(quizSessions).where(eq(quizSessions.id, id));
    return session ?? null;
  },

  async findByPin(pin: string): Promise<QuizSessionRecord | null> {
    const [session] = await db.select().from(quizSessions).where(eq(quizSessions.pin, pin));
    return session ?? null;
  },

  async create(data: CreateSessionData): Promise<QuizSessionRecord> {
    const [session] = await db
      .insert(quizSessions)
      .values({
        quizId: data.quizId,
        pin: data.pin,
        isLive: data.isLive ?? false,
        createdAt: nowSql,
      })
      .returning();
    return session;
  },

  async updateStatus(id: number, status: "lobby" | "in_progress" | "completed") {
    const values: Record<string, unknown> = { status };
    if (status === "in_progress") values.startedAt = nowSql;
    if (status === "completed") values.completedAt = nowSql;

    const [updated] = await db
      .update(quizSessions)
      .set(values)
      .where(eq(quizSessions.id, id))
      .returning();
    return updated;
  },

  async setLive(id: number, isLive: boolean): Promise<void> {
    await db
      .update(quizSessions)
      .set({ isLive })
      .where(eq(quizSessions.id, id));
  },

  async updateQuestionIndex(id: number, index: number): Promise<void> {
    await db
      .update(quizSessions)
      .set({ currentQuestionIndex: index })
      .where(eq(quizSessions.id, id));
  },

  async findByQuizId(quizId: number): Promise<QuizSessionRecord[]> {
    return db
      .select()
      .from(quizSessions)
      .where(eq(quizSessions.quizId, quizId))
      .orderBy(desc(quizSessions.createdAt));
  },

  async getSessionResults(sessionId: number): Promise<SessionPlayerResult[]> {
    const sessionPlayers = await db
      .select()
      .from(players)
      .where(eq(players.sessionId, sessionId))
      .orderBy(desc(players.totalScore));

    if (sessionPlayers.length === 0) {
      return [];
    }

    const answers = await db
      .select()
      .from(playerAnswers)
      .where(eq(playerAnswers.sessionId, sessionId));

    const questionIds = Array.from(new Set(answers.map((answer) => answer.questionId)));
    const choiceIds = Array.from(
      new Set(
        answers
          .map((answer) => answer.choiceId)
          .filter((choiceId): choiceId is number => typeof choiceId === "number")
      )
    );

    const [questionRows, choiceRows] = await Promise.all([
      questionIds.length > 0
        ? db
            .select({ id: questions.id, questionText: questions.questionText })
            .from(questions)
            .where(inArray(questions.id, questionIds))
        : Promise.resolve([]),
      choiceIds.length > 0
        ? db
            .select({ id: answerChoices.id, choiceText: answerChoices.choiceText })
            .from(answerChoices)
            .where(inArray(answerChoices.id, choiceIds))
        : Promise.resolve([]),
    ]);

    const questionTextById = new Map(questionRows.map((row) => [row.id, row.questionText] as const));
    const choiceTextById = new Map(choiceRows.map((row) => [row.id, row.choiceText] as const));

    const answersByPlayerId = new Map<number, PlayerAnswerRecord[]>();
    for (const answer of answers) {
      const playerAnswersForPlayer = answersByPlayerId.get(answer.playerId);
      if (playerAnswersForPlayer) {
        playerAnswersForPlayer.push(answer);
      } else {
        answersByPlayerId.set(answer.playerId, [answer]);
      }
    }

    return sessionPlayers.map((player) => {
      const playerAnswerRows = answersByPlayerId.get(player.id) || [];
      const answerDetails: PlayerAnswerWithDetails[] = playerAnswerRows.map((answer) => ({
        ...answer,
        questionText: questionTextById.get(answer.questionId) || null,
        choiceText:
          (typeof answer.choiceId === "number" ? choiceTextById.get(answer.choiceId) : undefined) ||
          "No answer",
      }));

      return {
        ...player,
        answers: answerDetails,
        correctCount: playerAnswerRows.filter((answer) => answer.isCorrect).length,
        totalQuestions: playerAnswerRows.length,
      };
    });
  },
};

