import { db, nowSql } from "@/lib/db";
import { quizSessions, players, playerAnswers, questions, answerChoices } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export interface CreateSessionData {
  quizId: number;
  pin: string;
  isLive?: boolean;
}

export const sessionRepository = {
  async findById(id: number) {
    const [session] = await db.select().from(quizSessions).where(eq(quizSessions.id, id));
    return session ?? null;
  },

  async findByPin(pin: string) {
    const [session] = await db.select().from(quizSessions).where(eq(quizSessions.pin, pin));
    return session ?? null;
  },

  async create(data: CreateSessionData) {
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

  async setLive(id: number, isLive: boolean) {
    await db
      .update(quizSessions)
      .set({ isLive })
      .where(eq(quizSessions.id, id));
  },

  async updateQuestionIndex(id: number, index: number) {
    await db
      .update(quizSessions)
      .set({ currentQuestionIndex: index })
      .where(eq(quizSessions.id, id));
  },

  async findByQuizId(quizId: number) {
    return db
      .select()
      .from(quizSessions)
      .where(eq(quizSessions.quizId, quizId))
      .orderBy(desc(quizSessions.createdAt));
  },

  async getSessionResults(sessionId: number) {
    const sessionPlayers = await db
      .select()
      .from(players)
      .where(eq(players.sessionId, sessionId))
      .orderBy(desc(players.totalScore));

    const playerDetails = await Promise.all(
      sessionPlayers.map(async (p: any) => {
        const answers = await db
          .select()
          .from(playerAnswers)
          .where(eq(playerAnswers.playerId, p.id));

        const answersWithDetails = await Promise.all(
          answers.map(async (a: any) => {
            const [question] = await db
              .select()
              .from(questions)
              .where(eq(questions.id, a.questionId));
            const [choice] = a.choiceId
              ? await db
                  .select()
                  .from(answerChoices)
                  .where(eq(answerChoices.id, a.choiceId))
              : [null];

            return {
              ...a,
              questionText: (question as any)?.questionText,
              choiceText: (choice as any)?.choiceText || "No answer",
            };
          })
        );

        return {
          ...p,
          answers: answersWithDetails,
          correctCount: answers.filter((a: any) => a.isCorrect).length,
          totalQuestions: answers.length,
        };
      })
    );

    return playerDetails;
  },
};
