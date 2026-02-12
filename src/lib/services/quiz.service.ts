import { quizRepository } from "@/lib/repositories/quiz.repository";
import { sessionRepository } from "@/lib/repositories/session.repository";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { quizSchema, questionSchema } from "@/lib/validators";
import { generateUniquePin } from "@/lib/pin-generator";
import { ensureDbMigrations } from "@/lib/db/migrations";
import { db } from "@/lib/db";
import { admins } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function resolveAdminId(session: { user?: { id?: string; email?: string | null } }): Promise<number | null> {
  const rawId = session.user?.id;
  if (rawId) {
    const parsedId = Number.parseInt(rawId, 10);
    if (!Number.isNaN(parsedId)) return parsedId;
  }

  const email = session.user?.email;
  if (!email) return null;

  const [adminByEmail] = await db
    .select({ id: admins.id })
    .from(admins)
    .where(eq(admins.email, email));

  return (adminByEmail as any)?.id ?? null;
}

export async function getAllQuizzes(adminId: number) {
  await ensureDbMigrations();
  const allQuizzes = await quizRepository.findAllByAdmin(adminId);

  return Promise.all(
    (allQuizzes as any[]).map(async (quiz: any) => {
      const count = await quizRepository.getQuestionCount(quiz.id);
      return { ...quiz, questionCount: count };
    })
  );
}

export async function getQuizWithQuestions(quizId: number) {
  await ensureDbMigrations();
  const quiz = await quizRepository.findWithQuestions(quizId);
  if (!quiz) throw new NotFoundError("Quiz", quizId);
  return quiz;
}

export async function createQuiz(adminId: number, data: { title: string; description?: string; customSlug?: string }) {
  await ensureDbMigrations();
  const parsed = quizSchema.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError("Invalid quiz data", parsed.error.errors);
  }

  return quizRepository.create({
    adminId,
    title: parsed.data.title,
    description: parsed.data.description || null,
    customSlug: parsed.data.customSlug || null,
  });
}

export async function updateQuiz(quizId: number, data: { title: string; description?: string; customSlug?: string }) {
  const parsed = quizSchema.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError("Invalid quiz data", parsed.error.errors);
  }

  return quizRepository.update(quizId, {
    title: parsed.data.title,
    description: parsed.data.description || null,
    customSlug: parsed.data.customSlug || null,
  });
}

export async function deleteQuiz(quizId: number) {
  await ensureDbMigrations();
  await quizRepository.delete(quizId);
}

export async function addQuestion(quizId: number, data: any) {
  await ensureDbMigrations();
  const parsed = questionSchema.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError("Invalid question data", parsed.error.errors);
  }

  const requiresCorrectChoice =
    parsed.data.questionType === "multiple_choice" ||
    parsed.data.questionType === "true_false" ||
    parsed.data.questionType === "multi_select";
  const hasCorrect = parsed.data.choices.some((c) => c.isCorrect);
  if (requiresCorrectChoice && !hasCorrect) {
    throw new ValidationError("At least one choice must be correct");
  }

  const existing = await quizRepository.getQuestionsByQuizId(quizId);
  const orderIndex = existing.length;

  const question = await quizRepository.createQuestion({
    quizId,
    questionText: parsed.data.questionText,
    questionType: parsed.data.questionType,
    orderIndex,
    timeLimitSeconds: parsed.data.timeLimitSeconds,
    basePoints: parsed.data.basePoints,
    deductionPoints: parsed.data.deductionPoints,
    deductionInterval: parsed.data.deductionInterval,
    mediaUrl: parsed.data.mediaUrl || null,
    backgroundUrl: parsed.data.backgroundUrl || null,
  });

  const choices = await quizRepository.createChoices(
    parsed.data.choices.map((c, i) => ({
      questionId: question.id,
      choiceText: c.choiceText,
      isCorrect: c.isCorrect,
      orderIndex: i,
    }))
  );

  return { ...question, choices };
}

export async function updateQuestion(questionId: number, data: any) {
  await ensureDbMigrations();
  const parsed = questionSchema.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError("Invalid question data", parsed.error.errors);
  }

  await quizRepository.updateQuestion(questionId, {
    questionText: parsed.data.questionText,
    questionType: parsed.data.questionType,
    timeLimitSeconds: parsed.data.timeLimitSeconds,
    basePoints: parsed.data.basePoints,
    deductionPoints: parsed.data.deductionPoints,
    deductionInterval: parsed.data.deductionInterval,
    mediaUrl: parsed.data.mediaUrl || null,
    backgroundUrl: parsed.data.backgroundUrl || null,
  });

  await quizRepository.deleteChoicesByQuestion(questionId);

  const choices = await quizRepository.createChoices(
    parsed.data.choices.map((c, i) => ({
      questionId,
      choiceText: c.choiceText,
      isCorrect: c.isCorrect,
      orderIndex: i,
    }))
  );

  const updated = await quizRepository.getQuestionById(questionId);
  return { ...updated, choices };
}

export async function deleteQuestion(questionId: number) {
  await ensureDbMigrations();
  await quizRepository.deleteQuestion(questionId);
}

export async function publishQuiz(quizId: number) {
  await ensureDbMigrations();
  const quiz = await quizRepository.findById(quizId);
  if (!quiz) throw new NotFoundError("Quiz", quizId);

  const questionCount = await quizRepository.getQuestionCount(quizId);
  if (questionCount === 0) {
    throw new ValidationError("Quiz must have at least one question");
  }

  await quizRepository.update(quizId, { status: "published" });
  const pin = await generateUniquePin();
  const session = await sessionRepository.create({ quizId, pin, isLive: false });

  return { session, pin, url: `/play/${pin}` };
}

export async function getQuizResults(quizId: number) {
  await ensureDbMigrations();
  const sessions = await sessionRepository.findByQuizId(quizId);

  return Promise.all(
    (sessions as any[]).map(async (s: any) => {
      const playerDetails = await sessionRepository.getSessionResults(s.id);
      return { ...s, players: playerDetails };
    })
  );
}
