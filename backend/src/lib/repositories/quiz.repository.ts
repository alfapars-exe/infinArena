import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, nowSql } from "@/lib/db";
import {
  answerChoices,
  playerAnswers,
  players,
  questions,
  quizzes,
  quizSessions,
} from "@/lib/db/schema";
import type {
  AnswerChoiceRecord,
  NewAnswerChoiceRecord,
  NewQuestionRecord,
  QuestionType,
  QuestionWithChoices,
  QuizRecord,
  QuizWithQuestions,
} from "@/lib/domain/quiz.types";

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
  questionType: QuestionType;
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
  async findById(id: number): Promise<QuizRecord | null> {
    const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, id));
    return quiz ?? null;
  },

  async findAllByAdmin(adminId: number): Promise<QuizRecord[]> {
    return db
      .select()
      .from(quizzes)
      .where(eq(quizzes.adminId, adminId))
      .orderBy(desc(quizzes.updatedAt));
  },

  async findWithQuestions(id: number): Promise<QuizWithQuestions | null> {
    const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, id));
    if (!quiz) return null;

    const quizQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.quizId, id))
      .orderBy(asc(questions.orderIndex));

    const questionsWithChoices: QuestionWithChoices[] = await Promise.all(
      quizQuestions.map(async (question) => {
        const choices = await db
          .select()
          .from(answerChoices)
          .where(eq(answerChoices.questionId, question.id))
          .orderBy(asc(answerChoices.orderIndex));

        return {
          ...question,
          choices,
        };
      })
    );

    return { ...quiz, questions: questionsWithChoices };
  },

  async create(data: CreateQuizData): Promise<QuizRecord> {
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

  async update(id: number, data: UpdateQuizData): Promise<QuizRecord> {
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

  async delete(id: number): Promise<void> {
    await db.transaction(async (tx) => {
      const sessionRows = await tx
        .select({ id: quizSessions.id })
        .from(quizSessions)
        .where(eq(quizSessions.quizId, id));
      const sessionIds = sessionRows.map((session) => session.id);

      const questionRows = await tx
        .select({ id: questions.id })
        .from(questions)
        .where(eq(questions.quizId, id));
      const questionIds = questionRows.map((question) => question.id);

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
    const rows = await db
      .select({
        questionCount: sql<number>`count(*)`,
      })
      .from(questions)
      .where(eq(questions.quizId, quizId));

    return Number(rows[0]?.questionCount || 0);
  },

  async getQuestionCountsByQuizIds(quizIds: number[]): Promise<Map<number, number>> {
    if (quizIds.length === 0) {
      return new Map<number, number>();
    }

    const rows = await db
      .select({
        quizId: questions.quizId,
        questionCount: sql<number>`count(*)`,
      })
      .from(questions)
      .where(inArray(questions.quizId, quizIds))
      .groupBy(questions.quizId);

    return new Map(rows.map((row) => [row.quizId, Number(row.questionCount)] as const));
  },

  async getQuestionsByQuizId(quizId: number) {
    return db
      .select()
      .from(questions)
      .where(eq(questions.quizId, quizId))
      .orderBy(asc(questions.orderIndex));
  },

  async createQuestion(data: CreateQuestionData) {
    const payload: NewQuestionRecord = {
      quizId: data.quizId,
      questionText: data.questionText,
      questionType: data.questionType,
      orderIndex: data.orderIndex,
      timeLimitSeconds: data.timeLimitSeconds,
      basePoints: data.basePoints,
      deductionPoints: data.deductionPoints,
      deductionInterval: data.deductionInterval,
      mediaUrl: data.mediaUrl || null,
      backgroundUrl: data.backgroundUrl || null,
    };
    const [question] = await db.insert(questions).values(payload).returning();
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

  async deleteQuestion(id: number): Promise<void> {
    await db.delete(questions).where(eq(questions.id, id));
  },

  async getQuestionById(id: number) {
    const [question] = await db.select().from(questions).where(eq(questions.id, id));
    return question ?? null;
  },

  async createChoices(choicesData: CreateChoiceData[]): Promise<AnswerChoiceRecord[]> {
    if (choicesData.length === 0) return [];

    const payload: NewAnswerChoiceRecord[] = choicesData.map((choice) => ({
      questionId: choice.questionId,
      choiceText: choice.choiceText,
      isCorrect: choice.isCorrect,
      orderIndex: choice.orderIndex,
    }));

    return db.insert(answerChoices).values(payload).returning();
  },

  async deleteChoicesByQuestion(questionId: number): Promise<void> {
    await db.delete(answerChoices).where(eq(answerChoices.questionId, questionId));
  },

  async getChoicesByQuestion(questionId: number): Promise<AnswerChoiceRecord[]> {
    return db
      .select()
      .from(answerChoices)
      .where(eq(answerChoices.questionId, questionId))
      .orderBy(asc(answerChoices.orderIndex));
  },
};

