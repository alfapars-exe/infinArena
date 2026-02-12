import { db, nowSql } from "@/lib/db";
import { quizzes, questions, answerChoices, quizSessions, players, playerAnswers } from "@/lib/db/schema";
import { eq, desc, asc, inArray } from "drizzle-orm";

export interface CreateQuizData {
  adminId: number;
  title: string;
  description?: string | null;
  customSlug?: string | null;
}

export interface UpdateQuizData {
  title?: string;
  description?: string | null;
  customSlug?: string | null;
  status?: "draft" | "published" | "archived";
}

export interface CreateQuestionData {
  quizId: number;
  questionText: string;
  questionType: string;
  orderIndex: number;
  timeLimitSeconds: number;
  basePoints: number;
  deductionPoints: number;
  deductionInterval: number;
  mediaUrl?: string | null;
  backgroundUrl?: string | null;
}

export interface CreateChoiceData {
  questionId: number;
  choiceText: string;
  isCorrect: boolean;
  orderIndex: number;
}

export const quizRepository = {
  async findById(id: number) {
    const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, id));
    return quiz ?? null;
  },

  async findAllByAdmin(adminId: number) {
    return db
      .select()
      .from(quizzes)
      .where(eq(quizzes.adminId, adminId))
      .orderBy(desc(quizzes.updatedAt));
  },

  async findWithQuestions(id: number) {
    const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, id));
    if (!quiz) return null;

    const quizQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.quizId, id))
      .orderBy(asc(questions.orderIndex));

    const questionsWithChoices = await Promise.all(
      quizQuestions.map(async (q: any) => {
        const choices = await db
          .select()
          .from(answerChoices)
          .where(eq(answerChoices.questionId, q.id))
          .orderBy(asc(answerChoices.orderIndex));
        return { ...q, choices };
      })
    );

    return { ...quiz, questions: questionsWithChoices };
  },

  async create(data: CreateQuizData) {
    const [quiz] = await db
      .insert(quizzes)
      .values({
        adminId: data.adminId,
        title: data.title,
        description: data.description || null,
        customSlug: data.customSlug || null,
        createdAt: nowSql,
        updatedAt: nowSql,
      })
      .returning();
    return quiz;
  },

  async update(id: number, data: UpdateQuizData) {
    const values: Record<string, unknown> = { updatedAt: nowSql };
    if (data.title !== undefined) values.title = data.title;
    if (data.description !== undefined) values.description = data.description;
    if (data.customSlug !== undefined) values.customSlug = data.customSlug;
    if (data.status !== undefined) values.status = data.status;

    const [updated] = await db
      .update(quizzes)
      .set(values)
      .where(eq(quizzes.id, id))
      .returning();
    return updated;
  },

  async delete(id: number) {
    await db.transaction(async (tx: any) => {
      const sessionRows = await tx
        .select({ id: quizSessions.id })
        .from(quizSessions)
        .where(eq(quizSessions.quizId, id));
      const sessionIds = sessionRows.map((s: any) => s.id);

      const questionRows = await tx
        .select({ id: questions.id })
        .from(questions)
        .where(eq(questions.quizId, id));
      const questionIds = questionRows.map((q: any) => q.id);

      if (questionIds.length > 0) {
        await tx.delete(playerAnswers).where(inArray(playerAnswers.questionId, questionIds));
      }

      if (sessionIds.length > 0) {
        await tx.delete(playerAnswers).where(inArray(playerAnswers.sessionId, sessionIds));
        await tx.delete(players).where(inArray(players.sessionId, sessionIds));
        await tx.delete(quizSessions).where(inArray(quizSessions.id, sessionIds));
      }

      await tx.delete(quizzes).where(eq(quizzes.id, id));
    });
  },

  async getQuestionCount(quizId: number): Promise<number> {
    const qs = await db.select().from(questions).where(eq(questions.quizId, quizId));
    return qs.length;
  },

  async getQuestionsByQuizId(quizId: number) {
    return db
      .select()
      .from(questions)
      .where(eq(questions.quizId, quizId))
      .orderBy(asc(questions.orderIndex));
  },

  async createQuestion(data: CreateQuestionData) {
    const [question] = await db.insert(questions).values(data).returning();
    return question;
  },

  async updateQuestion(id: number, data: Partial<CreateQuestionData>) {
    const [updated] = await db
      .update(questions)
      .set(data)
      .where(eq(questions.id, id))
      .returning();
    return updated;
  },

  async deleteQuestion(id: number) {
    await db.delete(questions).where(eq(questions.id, id));
  },

  async getQuestionById(id: number) {
    const [question] = await db.select().from(questions).where(eq(questions.id, id));
    return question ?? null;
  },

  async createChoices(choicesData: CreateChoiceData[]) {
    if (choicesData.length === 0) return [];
    return db.insert(answerChoices).values(choicesData).returning();
  },

  async deleteChoicesByQuestion(questionId: number) {
    await db.delete(answerChoices).where(eq(answerChoices.questionId, questionId));
  },

  async getChoicesByQuestion(questionId: number) {
    return db
      .select()
      .from(answerChoices)
      .where(eq(answerChoices.questionId, questionId))
      .orderBy(asc(answerChoices.orderIndex));
  },
};
